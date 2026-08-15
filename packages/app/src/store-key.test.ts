import { describe, expect, it } from "vitest";
import { parseStartRunInput, parseStoreKey } from "./index.js";

describe("parseStoreKey", () => {
  it.each(["a", "run/001/anon/snapshot", "screen.home/state.default"])(
    "規則に合う鍵を受け入れる: %s",
    (raw) => {
      expect(parseStoreKey(raw)).toBe(raw);
    },
  );

  it.each([
    ["空文字", ""],
    ["親ディレクトリ", ".."],
    ["親ディレクトリを含む", "run/../../etc/passwd"],
    ["カレントディレクトリ", "."],
    ["絶対パス", "/etc/passwd"],
    ["末尾がスラッシュ", "run/"],
    ["連続スラッシュ", "run//001"],
    ["先頭が記号", "-run/001"],
    ["ホームディレクトリ", "~/.zshrc"],
    ["バックスラッシュ区切り", "run\\..\\etc"],
  ])("パスの脱出につながる鍵を拒否する: %s", (_name, raw) => {
    expect(() => parseStoreKey(raw)).toThrow();
  });
});

describe("parseStartRunInput", () => {
  it("認証プロファイルを省略すると匿名になる", () => {
    // 省略を「認証なし」として黙って通さず、明示的な anonymous へ写す (ADR-0022)。
    expect(parseStartRunInput({ runId: "run-001" })).toEqual({
      runId: "run-001",
      auth: { kind: "anonymous" },
    });
  });

  it("認証プロファイル名を検証してから受け入れる", () => {
    expect(parseStartRunInput({ runId: "run-001", authProfile: "admin" })).toEqual({
      runId: "run-001",
      auth: { kind: "profile", name: "admin" },
    });
  });

  it.each([
    ["オブジェクトでない", "run-001"],
    ["null", null],
    ["runId が無い", {}],
    ["runId が文字列でない", { runId: 1 }],
    ["runId がパスを脱出する", { runId: "../../etc" }],
    ["プロファイル名がパスを脱出する", { runId: "run-001", authProfile: "../../.ssh/id_rsa" }],
    ["プロファイル名が予約語", { runId: "run-001", authProfile: "anonymous" }],
    ["プロファイル名が文字列でない", { runId: "run-001", authProfile: 1 }],
  ])("検証していない外部入力を拒否する: %s", (_name, raw) => {
    expect(() => parseStartRunInput(raw)).toThrow();
  });
});
