import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKey, type Keystore } from "./index.js";
import { createSecretStore, SecretError } from "./secrets.js";

let stateDir: string;
const KEY = generateKey();
/** 鍵は OS キーストアにのみ置く。テストでは差し替える。 */
const keystore: Keystore = { loadOrCreate: () => KEY };

function store() {
  return createSecretStore({ stateDir, keystore });
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "sc-secrets-"));
  chmodSync(stateDir, 0o700);
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

describe("入力値の保管", () => {
  it("保存して読み戻せる", () => {
    const secrets = store();
    secrets.save("login-password", "pa55word");
    expect(secrets.load("login-password")).toBe("pa55word");
  });

  it("平文で書かない", () => {
    // **ここが本題である。** DSL にも実行履歴にも値を入れない代わりに、置き場が
    // 平文だと意味が無い (context/infrastructure.md)。
    const secrets = store();
    secrets.save("login-password", "pa55word");
    const raw = readFileSync(join(stateDir, "secrets", "login-password.enc"), "utf8");
    expect(raw).not.toContain("pa55word");
  });

  it("所有者だけが読める権限で書く", () => {
    const secrets = store();
    secrets.save("login-password", "pa55word");
    const mode = statSync(join(stateDir, "secrets", "login-password.enc")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("改ざんしたら読まない", () => {
    // **認証に失敗したら中止する** (fail closed)。
    const secrets = store();
    secrets.save("login-password", "pa55word");
    const target = join(stateDir, "secrets", "login-password.enc");
    const envelope = JSON.parse(readFileSync(target, "utf8")) as { ciphertext: string };
    const bytes = Buffer.from(envelope.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    rmSync(target);
    writeFileSync(target, JSON.stringify({ ...envelope, ciphertext: bytes.toString("base64") }));
    expect(() => secrets.load("login-password")).toThrow();
  });

  it("別の名前で保存したものを開かない", () => {
    // 取り違えを検知する。AAD に名前を含めていないと通ってしまう。
    const secrets = store();
    secrets.save("a", "pa55word");
    const from = join(stateDir, "secrets", "a.enc");
    const to = join(stateDir, "secrets", "b.enc");
    renameSync(from, to);
    expect(() => secrets.load("b")).toThrow();
  });

  it("まだ無い名前は undefined を返す", () => {
    expect(store().load("missing")).toBeUndefined();
  });

  it("一覧に名前だけを出す", () => {
    // **値は返さない。** 一覧を見るだけで秘密が読めてはいけない。
    const secrets = store();
    secrets.save("a", "pa55word");
    secrets.save("b", "hunter2");
    expect(secrets.list()).toEqual(["a", "b"]);
  });

  it("消せる", () => {
    const secrets = store();
    secrets.save("a", "pa55word");
    secrets.remove("a");
    expect(secrets.list()).toEqual([]);
  });

  it.each([
    ["大文字", "Login"],
    ["パス区切り", "a/b"],
    ["親ディレクトリ", ".."],
    ["空", ""],
    ["予約名", "con"],
    ["末尾のドット", "a."],
    ["長すぎる", "a".repeat(65)],
  ])("%s の名前を拒否する", (_label, name) => {
    // 保存先のパスの一部になる。通すと未検証の文字列がパス組み立てまで届く。
    expect(() => store().save(name, "x")).toThrow(SecretError);
  });

  it("拒否した値をメッセージへ入れない", () => {
    let message = "";
    try {
      store().save("../../etc/passwd", "x");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("passwd");
  });
});
