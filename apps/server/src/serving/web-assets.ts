import { readFileSync, realpathSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { WebAssets } from "@screen-contract/api";
import { ConflictError } from "@screen-contract/app";
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
    // **入力の誤りではない。** ビルド成果物の異常であり、client には直せない。
    throw new ConflictError("配信する HTML に head がありません");
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
  // **symlink を辿ってから固定する。** `resolve` は字句解決で symlink を辿ら
  // ないため、配信ルート配下に外を指す symlink があると前置き一致が通る。
  const realRoot = realpathSync(resolve(options.root));
  return {
    /**
     * 配信する HTML。
     *
     * **チケットを持たない相手にはトークンを埋めない。** 埋めると、ループバック
     * へ繋げる任意プロセスが `curl` 1 本でトークンを取れる。画面は「開き直して
     * ください」を出す。
     */
    shell: (authorized: boolean) => {
      const html = readFileSync(join(realRoot, "_shell.html"), "utf8");
      return authorized ? embedToken(html, options.token) : html;
    },

    asset(path: string) {
      // 要求されたパスが配信ルートの配下に収まることを解決後に検査する。
      // 文字列検査だけでは `..` を含む要求を通しうる。
      const resolved = resolve(realRoot, `.${path}`);
      // 実体を辿ってから配下判定する。辿れなければ配信しない。
      let target: string;
      try {
        target = realpathSync(resolved);
      } catch {
        return undefined;
      }
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
