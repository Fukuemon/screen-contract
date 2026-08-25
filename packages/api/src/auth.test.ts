import { timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isAllowedHost, isAllowedOrigin, rejectRequest, tokensMatch } from "./index.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const POLICY = { token: "a".repeat(64), port: 5173 };

describe("tokensMatch", () => {
  it("一致するトークンを通す", () => {
    expect(tokensMatch(POLICY.token, POLICY.token)).toBe(true);
  });

  it("1 文字違うトークンを拒否する", () => {
    expect(tokensMatch(POLICY.token, "a".repeat(63) + "b")).toBe(false);
  });

  it("先頭だけ一致するトークンを拒否する", () => {
    expect(tokensMatch(POLICY.token, "a".repeat(10))).toBe(false);
  });

  it("空文字を拒否する", () => {
    expect(tokensMatch(POLICY.token, "")).toBe(false);
  });

  it("定数時間比較を必ず通す", () => {
    // 通常の文字列比較は先頭からの一致長で処理時間が変わり、1 バイトずつ
    // 総当たりできる。実装を `===` へ戻すとこのテストが落ちる。
    vi.mocked(timingSafeEqual).mockClear();
    tokensMatch(POLICY.token, POLICY.token);
    expect(vi.mocked(timingSafeEqual)).toHaveBeenCalledTimes(1);
  });

  it("長さが違うときは比較そのものを行わない", () => {
    // timingSafeEqual は長さが違うと投げる。長さは秘密ではない (固定長で生成する)。
    vi.mocked(timingSafeEqual).mockClear();
    expect(tokensMatch(POLICY.token, "short")).toBe(false);
    expect(vi.mocked(timingSafeEqual)).not.toHaveBeenCalled();
  });

  it("長さが違っても投げずに false を返す", () => {
    // timingSafeEqual は長さが違うと投げる。呼び出し側へ例外を出さない。
    expect(() => tokensMatch("ab", "abc")).not.toThrow();
  });
});

describe("Origin と Host", () => {
  it("自分の待受ポートの Origin を通す", () => {
    expect(isAllowedOrigin("http://127.0.0.1:5173", POLICY)).toBe(true);
  });

  it.each([
    ["別ポート", "http://127.0.0.1:5174"],
    ["別ホスト", "http://evil.test:5173"],
    ["localhost 名", "http://localhost:5173"],
    ["ポートなし", "http://127.0.0.1"],
    ["file スキーム", "file:///tmp/x.html"],
    ["URL でない", "not-a-url"],
  ])("%s の Origin を拒否する", (_label, origin) => {
    expect(isAllowedOrigin(origin, POLICY)).toBe(false);
  });

  it("Origin を送らない経路はトークンで守る", () => {
    // ブラウザ以外からの呼び出しは Origin を持たない。
    expect(isAllowedOrigin(undefined, POLICY)).toBe(true);
  });

  it("自分の待受ポートの Host だけを通す", () => {
    expect(isAllowedHost("127.0.0.1:5173", POLICY)).toBe(true);
    expect(isAllowedHost("127.0.0.1:5174", POLICY)).toBe(false);
    expect(isAllowedHost("localhost:5173", POLICY)).toBe(false);
    expect(isAllowedHost(undefined, POLICY)).toBe(false);
  });
});

describe("rejectRequest", () => {
  const ok = { token: POLICY.token, origin: "http://127.0.0.1:5173", host: "127.0.0.1:5173" };

  it("すべて揃えば通す", () => {
    expect(rejectRequest(ok, POLICY)).toBeUndefined();
  });

  it.each([
    ["トークン無し", { ...ok, token: undefined }, "missing-token"],
    ["トークンが空", { ...ok, token: "" }, "missing-token"],
    ["トークンが違う", { ...ok, token: "b".repeat(64) }, "bad-token"],
    ["Origin が違う", { ...ok, origin: "http://evil.test" }, "bad-origin"],
    ["Host が違う", { ...ok, host: "evil.test:5173" }, "bad-host"],
  ])("%s を拒否する", (_label, input, rejection) => {
    expect(rejectRequest(input, POLICY)).toBe(rejection);
  });

  it("拒否の理由に受け取った値を含めない", () => {
    // 理由は列挙であり文字列を組み立てない。反射を構造で塞ぐ。
    expect(rejectRequest({ ...ok, token: "s3cr3t-guess" }, POLICY)).toBe("bad-token");
  });
});
