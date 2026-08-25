import { renderElementTable, type TableWarning } from "@screen-contract/core-artifact";
import type { ElementDef } from "@screen-contract/core-element";
import type { RecordedStep } from "../recording.js";
import { parseStoreKey, type StoreKey } from "../store.js";
import { ValidationError } from "../errors.js";

/**
 * 記録から画面仕様書の下書きを起こす。
 *
 * **承認へ回すのは文字列である。** 承認は draft と正本のテキスト比較で判定する
 * (ADR-0017 / ADR-0028)。生成入力の比較という別規則を持たない。
 */

export interface ScreenDraft {
  readonly key: StoreKey;
  readonly content: string;
  /** 表に出せなかった要素などの注意書き。**黙って落とさない。** */
  readonly warnings: readonly TableWarning[];
}

export interface ScreenDraftInput {
  /** 番号を振った画面。鍵の materialize に使う。 */
  readonly stateUrl: string;
  readonly badges: readonly string[];
  readonly elements: readonly ElementDef[];
  readonly steps: readonly RecordedStep[];
}

/**
 * 画面状態から保存の鍵を作る。
 *
 * **鍵の規則を満たす形へ落とす** (`parseStoreKey`)。落とせない入力は弾く —
 * 弾かないと、未検証の文字列が保存先のパス組み立てまで届く。
 */
export function draftKeyOf(stateUrl: string): StoreKey {
  let parsed: URL;
  try {
    parsed = new URL(stateUrl);
  } catch {
    throw new ValidationError("画面状態の URL を解釈できません");
  }
  const slug = `${parsed.host}${parsed.pathname}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    throw new ValidationError("画面状態から保存の鍵を作れません");
  }
  // 鍵は 1 セグメント 64 文字まで。長い URL はここで切る。
  return parseStoreKey(`screens/${slug.slice(0, 64).replace(/-+$/, "")}`);
}

/** 記録した手順を人が読める形にする。 */
function stepLines(steps: readonly RecordedStep[], elements: readonly ElementDef[]): string[] {
  const nameOf = new Map(elements.map((element) => [element.id, element.name]));
  return steps.map((step, index) => {
    const what =
      step.action.kind === "click"
        ? `${nameOf.get(step.action.ref) ?? step.action.ref} をクリック`
        : `座標 ${String(step.action.x)}, ${String(step.action.y)} をクリック (要素へ解決できず)`;
    const expectations =
      step.expect.length === 0 ? " — 期待状態なし" : ` — 期待状態 ${String(step.expect.length)} 件`;
    return `${String(index + 1)}. ${what}${expectations}`;
  });
}

export function renderScreenDraft(input: ScreenDraftInput): ScreenDraft {
  const table = renderElementTable({
    badges: input.badges,
    // その状態に現れる要素。skeleton では定義したものがそのまま該当する。
    elementIds: input.elements.map((element) => element.id),
    elements: input.elements.map((element) => ({
      id: element.id,
      name: element.name,
      type: element.type,
      locator: element.locator,
      states: ["default"],
      hiddenIn: [],
      optional: false,
    })),
  });

  const lines = [
    `# ${input.stateUrl}`,
    "",
    "## 構成要素",
    "",
    table.markdown,
    "",
    "## 操作手順",
    "",
    ...(input.steps.length === 0
      ? ["まだ記録していません。"]
      : stepLines(input.steps, input.elements)),
    "",
  ];

  return { key: draftKeyOf(input.stateUrl), content: lines.join("\n"), warnings: table.warnings };
}
