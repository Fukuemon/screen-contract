import { readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { WebAssets } from "@screen-contract/api";
import { TOKEN_META } from "./web-token.js";

/**
 * Web UI の配信。
 *
 * Web UI は Workflow Server が配信する静的ファイルである
 * (context/infrastructure.md)。**トークンは配信する HTML へ埋め込む。**
 * ブラウザは `runtime.json` を読めず、URL の query には載せられない
 * (履歴・`Referer`・アクセスログに残る)。
 */

/** HTML をエスケープする。トークンは 16 進だが、埋め込みの安全は形に依存させない。 */
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
    throw new Error("配信する HTML に head がありません");
  }
  return html.slice(0, head) + meta + html.slice(head);
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export interface FsWebAssetsOptions {
  /** ビルド成果物のディレクトリ。 */
  readonly root: string;
  readonly token: string;
}

export function createFsWebAssets(options: FsWebAssetsOptions): WebAssets {
  const realRoot = resolve(options.root);
  return {
    shell: () => embedToken(readFileSync(join(realRoot, "_shell.html"), "utf8"), options.token),

    asset(path: string) {
      // 要求されたパスが配信ルートの配下に収まることを解決後に検査する。
      // 文字列検査だけでは `..` を含む要求を通しうる。
      const target = resolve(realRoot, `.${path}`);
      if (target !== realRoot && !target.startsWith(realRoot + sep)) {
        return undefined;
      }
      try {
        return {
          body: readFileSync(target),
          contentType: CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
        };
      } catch {
        return undefined;
      }
    },
  };
}
