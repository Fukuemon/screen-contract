/**
 * 配信する HTML へトークンを埋め込むときの meta 名。
 *
 * **`apps/web` と同じ値を持つ。** `apps/` 同士は互いを参照できない
 * (context/architecture.md) ため、値を共有できない。片方だけ変えるとトークンを
 * 読めなくなるので、両方に同じコメントを置く。
 */
export const TOKEN_META = "screen-contract-token";
