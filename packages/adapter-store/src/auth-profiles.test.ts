import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthProfileError, createAuthProfileStore } from "./auth-profiles.js";
import { generateKey, type Keystore } from "./index.js";

let stateDir: string;
const KEY = generateKey();
/** 鍵は OS キーストアにのみ置く。テストでは差し替える。 */
const keystore: Keystore = { loadOrCreate: () => KEY };

function store() {
  return createAuthProfileStore({ stateDir, keystore });
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "sc-auth-"));
  chmodSync(stateDir, 0o700);
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

const STATE = { cookies: [{ name: "session", value: "s3cr3t" }], localStorage: { a: 1 } };

describe("認証プロファイル", () => {
  it("保存して読み戻せる", () => {
    const profiles = store();
    profiles.save("admin", STATE);
    expect(profiles.load("admin")).toEqual(STATE);
  });

  it("平文でディスクへ残さない", () => {
    // DSL・ログ・成果物へ平文で保存しない (context/infrastructure.md)。
    store().save("admin", STATE);
    const raw = readFileSync(join(stateDir, "auth", "admin.enc"), "utf8");
    expect(raw).not.toContain("s3cr3t");
    expect(raw).not.toContain("session");
  });

  it("0600 で書く", () => {
    store().save("admin", STATE);
    expect(statSync(join(stateDir, "auth", "admin.enc")).mode & 0o777).toBe(0o600);
  });

  it("一覧を返す", () => {
    const profiles = store();
    profiles.save("admin", STATE);
    profiles.save("viewer", STATE);
    expect(profiles.list()).toEqual(["admin", "viewer"]);
  });

  it("無いプロファイルは undefined を返す", () => {
    expect(store().load("missing")).toBeUndefined();
  });

  it("削除できる", () => {
    const profiles = store();
    profiles.save("admin", STATE);
    profiles.remove("admin");
    expect(profiles.list()).toEqual([]);
    expect(profiles.load("admin")).toBeUndefined();
  });

  it("上書き保存で一時ファイルを残さない", () => {
    const profiles = store();
    profiles.save("admin", STATE);
    profiles.save("admin", { cookies: [], localStorage: {} });
    expect(profiles.list()).toEqual(["admin"]);
    expect(profiles.load("admin")).toEqual({ cookies: [], localStorage: {} });
  });

  it("鍵が違えば読めない", () => {
    store().save("admin", STATE);
    const other = createAuthProfileStore({
      stateDir,
      keystore: { loadOrCreate: () => generateKey() },
    });
    expect(() => other.load("admin")).toThrow("復号できません");
  });

  it("別プロファイルのファイルを差し替えても読まない", () => {
    // 取り違えを AAD で検知する。
    const profiles = store();
    profiles.save("admin", STATE);
    profiles.save("viewer", { cookies: [], localStorage: {} });
    const adminFile = join(stateDir, "auth", "admin.enc");
    writeFileSync(join(stateDir, "auth", "viewer.enc"), readFileSync(adminFile, "utf8"));
    expect(() => profiles.load("viewer")).toThrow("復号できません");
  });

  it("改ざんしたファイルを読まない", () => {
    // 検知しないと、攻撃者の指定した状態でブラウザを動かすことになる。
    const profiles = store();
    profiles.save("admin", STATE);
    const path = join(stateDir, "auth", "admin.enc");
    const envelope = JSON.parse(readFileSync(path, "utf8")) as { ciphertext: string };
    const bytes = Buffer.from(envelope.ciphertext, "base64");
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;
    writeFileSync(path, JSON.stringify({ ...envelope, ciphertext: bytes.toString("base64") }));
    expect(() => profiles.load("admin")).toThrow();
  });

  it.each(["../escape", "a/b", "", "Admin", "-a", "x".repeat(65), "a.", "a ", "con", "nul.json"])(
    "規則に合わない名前 %s を拒否する",
    (name) => {
      expect(() => store().save(name, STATE)).toThrow(AuthProfileError);
      expect(() => store().load(name)).toThrow(AuthProfileError);
    },
  );

  it("拒否のメッセージへ入力値を入れない", () => {
    try {
      store().load("../../.ssh/id_rsa");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("id_rsa");
    }
  });

  it("保存していなければ一覧が空である", () => {
    expect(store().list()).toEqual([]);
  });
});

describe("取り込みの世代", () => {
  it("取り込むたびに 1 つ進む", () => {
    // 進めないと、同じ名前へ別のアカウントを入れた瞬間から権限の違う結果が
    // 同じ Baseline へ混ざる (ADR-0022)。
    const profiles = store();
    expect(profiles.save("admin", { cookies: [], localStorage: {} })).toBe(1);
    expect(profiles.save("admin", { cookies: [], localStorage: {} })).toBe(2);
    expect(profiles.generation("admin")).toBe(2);
  });

  it("プロファイルごとに数える", () => {
    const profiles = store();
    profiles.save("admin", { cookies: [], localStorage: {} });
    profiles.save("admin", { cookies: [], localStorage: {} });
    profiles.save("guest", { cookies: [], localStorage: {} });
    expect(profiles.generation("admin")).toBe(2);
    expect(profiles.generation("guest")).toBe(1);
  });

  it("まだ無ければ 0", () => {
    expect(store().generation("admin")).toBe(0);
  });

  it("世代を進めても中身は読める", () => {
    const profiles = store();
    profiles.save("admin", { cookies: [{ name: "a" }], localStorage: {} });
    profiles.save("admin", { cookies: [{ name: "b" }], localStorage: {} });
    expect(profiles.load("admin")).toEqual({ cookies: [{ name: "b" }], localStorage: {} });
  });
});
