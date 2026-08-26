import { tokensMatch } from "./auth.js";

/**
 * 起動チケット。
 *
 * **`GET /` はトークンを埋め込んだ画面を返す唯一の経路である。** ここを無条件に
 * 開けると、ループバックへ繋げる同一マシンの任意プロセスが `curl` 1 本で
 * トークンを取り、以後すべての endpoint を呼べる。`runtime.json` を 0600 に
 * した意味が消える。
 *
 * 起動ごとの単回チケットを URL の query で受け取り、cookie へ移す。
 * **トークンを query に載せるのではない** — チケットは寿命がプロセス 1 回分で、
 * 認可には使えない (context/infrastructure.md)。
 */

/** cookie の名前。プロセスをまたいで使い回さない。 */
export const BOOT_COOKIE = "screen-contract-boot";

/** query で受け取る名前。 */
export const BOOT_QUERY = "boot";

export interface BootRequest {
  /** `?boot=` の値。 */
  readonly query: string | undefined;
  /** `Cookie` ヘッダの生の値。 */
  readonly cookie: string | undefined;
}

export type BootOutcome =
  /** 通す。既に cookie を持っている。 */
  | { readonly kind: "authorized" }
  /** 通す。**cookie を発行する** — 次からは query が要らない。 */
  | { readonly kind: "issue" }
  /** 通さない。トークンを埋めない画面を返す。 */
  | { readonly kind: "denied" };

/** `Cookie` ヘッダから 1 つ取り出す。 */
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) {
      return part.slice(at + 1).trim();
    }
  }
  return undefined;
}

export function checkBootTicket(request: BootRequest, bootKey: string): BootOutcome {
  const held = cookieValue(request.cookie, BOOT_COOKIE);
  if (held !== undefined && tokensMatch(bootKey, held)) {
    return { kind: "authorized" };
  }
  if (request.query !== undefined && tokensMatch(bootKey, request.query)) {
    return { kind: "issue" };
  }
  return { kind: "denied" };
}

/**
 * cookie の属性。
 *
 * `HttpOnly` で JS から読めなくし、`SameSite=Strict` で別 origin からの遷移で
 * 送られないようにする。`Secure` は付けない — ループバックの http で動くため、
 * 付けると送られない。
 */
export function bootCookie(bootKey: string): string {
  return `${BOOT_COOKIE}=${bootKey}; Path=/; HttpOnly; SameSite=Strict`;
}
