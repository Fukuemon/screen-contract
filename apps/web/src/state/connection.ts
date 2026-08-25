/**
 * Workflow Server への接続。
 *
 * **接続先は単一エンドポイントのみ。** 実行基盤 (agent-browser) のポートへは
 * 接続しない (ADR-0008)。
 */

export interface ConnectionTarget {
  readonly address: string;
  readonly port: number;
}

/** ループバック以外へ繋がない。`localhost` は名前解決の結果を選べない。 */
const LOOPBACK = "127.0.0.1";

export function isAllowedTarget(target: ConnectionTarget): boolean {
  return target.address === LOOPBACK && Number.isInteger(target.port) && target.port > 0;
}

export function httpBase(target: ConnectionTarget): string {
  if (!isAllowedTarget(target)) {
    throw new Error("接続先が Workflow Server のループバックアドレスではありません");
  }
  return `http://${target.address}:${String(target.port)}`;
}

/**
 * WebSocket の接続先。
 *
 * **トークンを URL の query に載せない。** URL はブラウザの履歴・`Referer`・
 * サーバのアクセスログに残る。WebSocket は任意のヘッダを付けられないため、
 * 接続後の最初のフレームで認証する (context/infrastructure.md)。
 */
export function streamUrl(target: ConnectionTarget): string {
  if (!isAllowedTarget(target)) {
    throw new Error("接続先が Workflow Server のループバックアドレスではありません");
  }
  return `ws://${target.address}:${String(target.port)}/stream`;
}

export interface AuthFrame {
  readonly kind: "auth";
  readonly token: string;
}

/** 接続後に最初に送るフレーム。 */
export function authFrame(token: string): AuthFrame {
  return { kind: "auth", token };
}
