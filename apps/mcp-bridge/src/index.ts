/**
 * stdio とループバックをつなぐ透過 proxy (ADR-0021)。
 *
 * tool 語彙を解釈しない。受け取った JSON-RPC のフレームを Workflow Server へ
 * 転送し、トークンを付与するだけを担う。
 */
export function createBridge(): never {
  throw new Error("not implemented");
}
