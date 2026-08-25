import { describe, expect, it } from "vitest";
import { BOOT_COOKIE, bootCookie, checkBootTicket } from "./boot-ticket.js";

const KEY = "k".repeat(43);

describe("checkBootTicket", () => {
  it("チケット付きの query を通し、cookie を発行する", () => {
    expect(checkBootTicket({ query: KEY, cookie: undefined }, KEY)).toEqual({ kind: "issue" });
  });

  it("cookie を持っていれば query が無くても通す", () => {
    // 再読み込みのたびに URL を貼り直させない。
    expect(checkBootTicket({ query: undefined, cookie: `${BOOT_COOKIE}=${KEY}` }, KEY)).toEqual({
      kind: "authorized",
    });
  });

  it("他の cookie が混ざっていても読む", () => {
    expect(
      checkBootTicket({ query: undefined, cookie: `a=1; ${BOOT_COOKIE}=${KEY}; b=2` }, KEY),
    ).toEqual({ kind: "authorized" });
  });

  it.each([
    ["どちらも無い", { query: undefined, cookie: undefined }],
    ["query が違う", { query: "x".repeat(43), cookie: undefined }],
    ["cookie が違う", { query: undefined, cookie: `${BOOT_COOKIE}=${"x".repeat(43)}` }],
    ["名前が違う cookie", { query: undefined, cookie: `other=${KEY}` }],
    ["空の query", { query: "", cookie: undefined }],
    ["空の cookie", { query: undefined, cookie: `${BOOT_COOKIE}=` }],
  ])("%s なら通さない", (_label, request) => {
    // 通すと、ループバックへ繋げる任意プロセスが curl 1 本でトークンを取れる。
    expect(checkBootTicket(request, KEY)).toEqual({ kind: "denied" });
  });

  it("cookie を JS から読めなくし、別 origin へ送らない", () => {
    const header = bootCookie(KEY);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/");
  });
});
