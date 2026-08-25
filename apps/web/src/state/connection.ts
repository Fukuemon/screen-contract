/**
 * Workflow Server への接続。
 *
 * **Web UI は Workflow Server が配信する静的ファイルである**
 * (context/infrastructure.md)。したがって接続先は**自分が配信された origin**
 * であり、それ以外へは繋がない。実行基盤 (agent-browser) のポートにも繋がない
 * (ADR-0008)。
 */

/** `localhost` は特別名で常にループバックへ解決される (RFC 6761)。 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export interface ServerTarget {
  readonly origin: string;
  readonly port: number;
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * 自分が配信された origin から接続先を決める。
 *
 * **origin を引数で選ばせない。** 選ばせると、ループバックの別ポート
 * (実行基盤のポート) を指定できてしまう。
 */
export function serverTargetOf(origin: string): ServerTarget {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ConnectionError("接続先の origin を解釈できません");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectionError("接続先の scheme が http/https ではありません");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ConnectionError("接続先がループバックではありません");
  }
  if (url.port === "") {
    throw new ConnectionError("接続先のポートが決まっていません");
  }
  return { origin: url.origin, port: Number(url.port) };
}

export function httpBase(target: ServerTarget): string {
  return target.origin;
}

/**
 * WebSocket の接続先。
 *
 * **トークンを URL の query に載せない。** URL はブラウザの履歴・`Referer`・
 * サーバのアクセスログに残る。WebSocket は任意のヘッダを付けられないため、
 * 接続後の最初のフレームで認証する (context/infrastructure.md)。
 */
export function streamUrl(target: ServerTarget): string {
  const url = new URL("/stream", target.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export interface AuthFrame {
  readonly kind: "auth";
  readonly token: string;
  readonly runId: string;
}

export interface InputFrame {
  readonly kind: "input";
  readonly payload: string;
}

/** 接続後に**最初に**送るフレーム。 */
export function authFrame(token: string, runId: string): AuthFrame {
  return { kind: "auth", token, runId };
}

export function inputFrame(payload: string): InputFrame {
  return { kind: "input", payload };
}

/**
 * サーバが配信する HTML へ埋め込んだトークンを読む。
 *
 * ブラウザは `runtime.json` を読めないため、Web UI だけは別経路が要る
 * (context/infrastructure.md)。**query から読まない。**
 *
 * **`apps/server` の `TOKEN_META` と同じ値を持つ。** `apps/` 同士は互いを
 * 参照できないため値を共有できない。片方だけ変えるとトークンを読めなくなる。
 */
export const TOKEN_META_NAME = "screen-contract-token";

export function readEmbeddedToken(root: {
  querySelector(selectors: string): { getAttribute(name: string): string | null } | null;
}): string {
  const meta = root.querySelector(`meta[name="${TOKEN_META_NAME}"]`);
  const token = meta?.getAttribute("content");
  if (token === null || token === undefined || token.length === 0) {
    // 必須データの欠落を隠さない。無いまま進むと、原因の分からない 401 になる。
    throw new ConnectionError("配信された HTML にトークンが埋め込まれていません");
  }
  return token;
}
