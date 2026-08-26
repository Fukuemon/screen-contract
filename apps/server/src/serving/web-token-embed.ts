import { ConflictError } from "@screen-contract/app";
import { TOKEN_META } from "./web-token.js";

/**
 * 配信する HTML へトークンを埋め込む。
 *
 * ブラウザは `runtime.json` を読めず、URL の query には載せられない
 * (履歴・`Referer`・アクセスログに残る)。配信する HTML が唯一の経路である。
 */
function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function embedToken(html: string, token: string): string {
  const meta = `<meta name="${TOKEN_META}" content="${escapeAttribute(token)}">`;
  const head = html.indexOf("</head>");
  if (head < 0) {
    // 埋め込めないまま配信しない。配信すると、原因の分からない 401 になる。
    // **入力の誤りではない。** ビルド成果物の異常であり、client には直せない。
    throw new ConflictError("配信する HTML に head がありません");
  }
  return html.slice(0, head) + meta + html.slice(head);
}
