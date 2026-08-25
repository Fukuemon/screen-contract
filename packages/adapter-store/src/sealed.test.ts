import { describe, expect, it } from "vitest";
import { generateKey, open, parseEnvelope, seal, SealError } from "./sealed.js";

const KEY = generateKey();
const PROFILE = "admin";
const PLAIN = JSON.stringify({ cookies: [{ name: "session", value: "s3cr3t" }] });

describe("封筒", () => {
  it("封じて開くと元へ戻る", () => {
    expect(open(seal(PLAIN, KEY, 1, PROFILE, 1), KEY, PROFILE)).toBe(PLAIN);
  });

  it("暗号文に平文が現れない", () => {
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 1);
    expect(JSON.stringify(sealed)).not.toContain("s3cr3t");
    expect(JSON.stringify(sealed)).not.toContain("session");
  });

  it("毎回 nonce を作り直す", () => {
    // **同じ鍵で再利用しない。** 再利用すると GCM の安全性が崩れる。
    const first = seal(PLAIN, KEY, 1, PROFILE, 1);
    const second = seal(PLAIN, KEY, 1, PROFILE, 1);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("鍵が違えば開かない", () => {
    expect(() => open(seal(PLAIN, KEY, 1, PROFILE, 1), generateKey(), PROFILE)).toThrow(SealError);
  });

  it("別プロファイルのファイルを開かない", () => {
    // 取り違えを検知する。AAD に profile を含めていないと通ってしまう。
    expect(() => open(seal(PLAIN, KEY, 1, PROFILE, 1), KEY, "other")).toThrow(SealError);
  });

  it("鍵の版が違えば開かない", () => {
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 1);
    expect(() => open({ ...sealed, keyVersion: 2 }, KEY, PROFILE)).toThrow(SealError);
  });

  it("暗号文を書き換えたら開かない", () => {
    // **改ざんを検知する。** 検知しないと、攻撃者の指定した状態を注入できる。
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 1);
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;
    expect(() => open({ ...sealed, ciphertext: bytes.toString("base64") }, KEY, PROFILE)).toThrow(
      SealError,
    );
  });

  it("認証タグを書き換えたら開かない", () => {
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 1);
    const tag = Buffer.from(sealed.tag, "base64");
    tag[0] = (tag[0]! ^ 0xff) & 0xff;
    expect(() => open({ ...sealed, tag: tag.toString("base64") }, KEY, PROFILE)).toThrow(SealError);
  });

  it("形式の版が違えば復号へ進まない", () => {
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 1);
    expect(() => open({ ...sealed, format: 99 }, KEY, PROFILE)).toThrow("版が合いません");
  });

  it("鍵の長さを検査する", () => {
    expect(() => seal(PLAIN, Buffer.alloc(16), 1, PROFILE, 1)).toThrow("鍵の長さ");
  });

  it("失敗しても原因を漏らさない", () => {
    // 鍵違いと改ざんを区別できると総当たりの手掛かりになる。
    try {
      open(seal(PLAIN, KEY, 1, PROFILE, 1), generateKey(), PROFILE);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toBe("認証状態を復号できません");
    }
  });
});

describe("parseEnvelope", () => {
  it("封じた結果をそのまま読める", () => {
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 1);
    expect(parseEnvelope(JSON.stringify(sealed))).toEqual(sealed);
  });

  it.each([
    ["JSON でない", "not json"],
    ["null", "null"],
    ["配列", "[]"],
    ["項目が欠ける", JSON.stringify({ format: 1, nonce: "a", tag: "b", ciphertext: "c" })],
    [
      "型が違う",
      JSON.stringify({ format: "1", keyVersion: 1, nonce: "a", tag: "b", ciphertext: "c" }),
    ],
  ])("%s を復号へ進めない", (_label, raw) => {
    expect(() => parseEnvelope(raw)).toThrow(SealError);
  });
});

describe("generateKey", () => {
  it("32 バイトを返す", () => {
    expect(generateKey()).toHaveLength(32);
  });

  it("毎回違う鍵を返す", () => {
    expect(generateKey().equals(generateKey())).toBe(false);
  });
});

describe("取り込みの世代", () => {
  it("封筒に平文で載る", () => {
    // 一覧のたびにキーストアを開かずに読めるようにする。
    expect(seal(PLAIN, KEY, 1, PROFILE, 3).generation).toBe(3);
  });

  it("世代を書き換えたら開かない", () => {
    // **AAD で守る。** 守らないと、平文のまま巻き戻して古い Baseline へ
    // 結果を混ぜられる (ADR-0022)。
    const sealed = seal(PLAIN, KEY, 1, PROFILE, 3);
    expect(() => open({ ...sealed, generation: 1 }, KEY, PROFILE)).toThrow(SealError);
  });

  it("世代の無い封筒を読まない", () => {
    const { generation: _dropped, ...without } = seal(PLAIN, KEY, 1, PROFILE, 1);
    expect(() => parseEnvelope(JSON.stringify(without))).toThrow(SealError);
  });
});
