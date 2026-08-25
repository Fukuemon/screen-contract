import type { BadgePlacement } from "./badge.js";

/**
 * 注釈画像 (SVG) の組み立て。
 *
 * core は SVG のテキストを作るだけで、画像合成ライブラリを持たない (ADR-0028)。
 */

/** SVG は XML なので、埋め込む値は必ずエスケープする。要素名は DSL 由来で任意の文字を含む。 */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export interface AnnotatedImageInput {
  readonly width: number;
  readonly height: number;
  /**
   * 生スクリーンショットの PNG バイト列。
   *
   * **data URI として埋め込む。** ブラウザは `<img src="x.svg">` で読んだ SVG の
   * 外部参照を一切読み込まない (secure static mode) ため、外部参照にすると
   * Markdown の `![](x.svg)` で背景が出ずバッジだけが浮く。GitHub は `<object>`
   * と inline `<svg>` を sanitize で落とすので、埋め込み以外に成立する経路が無い。
   * 差分検知の対象は別ファイルの生スクリーンショットのままである (ADR-0028)。
   */
  readonly rawImage: Uint8Array;
  readonly placements: readonly BadgePlacement[];
  readonly fill?: string | undefined;
  readonly textColor?: string | undefined;
}

export const DEFAULT_BADGE_FILL = "#d93025";
export const DEFAULT_BADGE_TEXT_COLOR = "#ffffff";

/** base64 は決定的な写像であり、同じバイト列からは常に同じ文字列になる。 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * 同じ入力からは常に同じテキストを返す。書き換え抑止がテキスト比較 (完全一致)
 * で成り立つ前提である (ADR-0028)。
 */
export function renderAnnotatedImage(input: AnnotatedImageInput): string {
  const fill = escapeXml(input.fill ?? DEFAULT_BADGE_FILL);
  const textColor = escapeXml(input.textColor ?? DEFAULT_BADGE_TEXT_COLOR);
  const href = `data:image/png;base64,${toBase64(input.rawImage)}`;
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    // SVG 2 は href、SVG 1.1 のレンダラは xlink:href を見る。両方出して解決先を揃える。
    `  <image x="0" y="0" width="${input.width}" height="${input.height}" href="${href}" xlink:href="${href}"/>`,
  ];
  for (const badge of input.placements) {
    const half = badge.size / 2;
    lines.push(
      `  <g data-element-id="${escapeXml(badge.elementId)}">`,
      `    <circle cx="${badge.x + half}" cy="${badge.y + half}" r="${half}" fill="${fill}"/>`,
      `    <text x="${badge.x + half}" y="${badge.y + half}" fill="${textColor}" font-family="sans-serif" font-size="${Math.round(badge.size * 0.6)}" text-anchor="middle" dominant-baseline="central">${badge.number}</text>`,
      `  </g>`,
    );
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
