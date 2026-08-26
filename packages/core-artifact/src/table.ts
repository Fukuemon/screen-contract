import type { ElementDefinition } from "@screen-contract/core-workflow";

/**
 * 構成要素テーブル (Markdown) の生成。
 *
 * core 同士は型の参照のみ許可される (context/architecture.md)。
 */

/** Markdown の表はセル内の `|` と改行で壊れる。埋め込む値は必ず通す。 */
export function escapeCell(value: string): string {
  // `\r` 単独 (旧 Mac 改行) も落とす。残すと表のセルに生の制御文字が入る。
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll(/[\r\n]+/g, " ");
}

/** リンクの表示テキスト。`]` を残すとリンクの範囲が早く閉じ、リンク先が差し替わる。 */
export function escapeLinkText(value: string): string {
  return escapeCell(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

/**
 * リンク先として素の Markdown に書けるか。
 *
 * 空白と丸括弧は `(...)` の範囲を壊す。URL はセル用のエスケープを通せない
 * (`\|` を足すとリンク先そのものが変わる) ため、書けない値は**リンクにしない**。
 */
const UNSAFE_IN_LINK_TARGET = /[\s()<>|\\]/;

export type TableWarningReason = "unknown-badge" | "badge-not-in-state" | "unsafe-child-doc";

export interface TableWarning {
  readonly elementId: string;
  readonly reason: TableWarningReason;
}

export interface TableInput {
  /** 構成番号順の要素 ID。 */
  readonly badges: readonly string[];
  /** その状態に現れる要素 ID (badges を含む)。 */
  readonly elementIds: readonly string[];
  readonly elements: readonly ElementDefinition[];
}

export interface TableOutput {
  readonly markdown: string;
  readonly warnings: readonly TableWarning[];
}

const HEADER = ["| 番号 | 名称 | 種別 | 備考 |", "| --- | --- | --- | --- |"];

/**
 * 行は「バッジ要素 (1..N) → 条件付き表示要素 (`-`) → 子文書要素 (番号なし)」の順。
 * 番号は状態内で 1..N であり、状態をまたいで連番にしない (ADR-0005)。
 *
 * この 3 種に当てはまらない要素 (その状態に現れるが badges に載らず、`optional`
 * でも `child_doc` でもないもの) は表に出さない。仕様書の読者に示すのは番号で
 * 指せる要素と、番号を持てない理由がある要素に限るためである。
 */
export function renderElementTable(input: TableInput): TableOutput {
  const byId = new Map(input.elements.map((element) => [element.id, element]));
  const inState = new Set(input.elementIds);
  const badged = new Set(input.badges);
  const rows: string[] = [];
  const warnings: TableWarning[] = [];

  input.badges.forEach((id, position) => {
    const element = byId.get(id);
    if (element === undefined) {
      // 行だけ落とすと番号に欠番が出る。ADR-0005 は 1..N の連番を要求するため、
      // 入力の欠落として報告する。
      warnings.push({ elementId: id, reason: "unknown-badge" });
      return;
    }
    if (!inState.has(id)) {
      // 継承展開の結果その状態に現れない要素が badges に残っている。
      warnings.push({ elementId: id, reason: "badge-not-in-state" });
      return;
    }
    rows.push(`| ${position + 1} | ${escapeCell(element.name)} | ${escapeCell(element.type)} |  |`);
  });

  for (const id of input.elementIds) {
    const element = byId.get(id);
    if (element === undefined || badged.has(id) || element.childDoc !== undefined) {
      continue;
    }
    if (element.optional) {
      // 番号を持たない要素は `-`。空欄にすると「番号が抜けた」ように読める。
      rows.push(`| - | ${escapeCell(element.name)} | ${escapeCell(element.type)} |  |`);
    }
  }

  for (const id of input.elementIds) {
    const element = byId.get(id);
    if (element?.childDoc === undefined) {
      continue;
    }
    const name = escapeLinkText(element.name);
    const cell = UNSAFE_IN_LINK_TARGET.test(element.childDoc)
      ? (warnings.push({ elementId: id, reason: "unsafe-child-doc" }), name)
      : `[${name}](${element.childDoc})`;
    rows.push(`|  | ${cell} | ${escapeCell(element.type)} |  |`);
  }

  return { markdown: `${[...HEADER, ...rows].join("\n")}\n`, warnings };
}
