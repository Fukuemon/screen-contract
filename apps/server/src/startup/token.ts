import { randomBytes } from "node:crypto";

/**
 * ローカルトークンを生成する。
 *
 * **暗号論的に安全な乱数生成器で 32 バイト以上**を生成する。連番・時刻・
 * プロセス ID から作らない (context/infrastructure.md)。
 *
 * 生成は合成ルートの責務である。起動ごとに作り、接続先と一緒に `runtime.json`
 * へ書き出す。**照合はここに置かない。** 照合を行うのはリクエストを受ける
 * `packages/api` であり、`apps/` は packages から参照できない
 * (context/architecture.md)。ここに置くと api 側で複製され、片方だけ
 * 通常比較へ戻る事故が起きる。定数時間比較は api の認証と同時に入れる。
 */
export function generateLocalToken(): string {
  return randomBytes(32).toString("hex");
}
