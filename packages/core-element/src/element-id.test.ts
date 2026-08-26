import { describe, expect, it } from "vitest";
import { ElementIdError, parseElementId } from "./index.js";

describe("parseElementId", () => {
  it("採番した形を受ける", () => {
    expect(parseElementId("el-button-設定を開く")).toBe("el-button-設定を開く");
    expect(parseElementId("el-a")).toBe("el-a");
  });

  it.each([
    ["接頭辞が無い", "button-a"],
    ["空", ""],
    ["接頭辞だけ", "el-"],
    ["パス区切り", "el-a/../b"],
    ["親ディレクトリ", "el-.."],
    ["空白", "el-a b"],
    ["長すぎる", `el-${"a".repeat(200)}`],
  ])("%s を拒否する", (_label, raw) => {
    // branded type は実行時の保証を持たない。通すと未検証の文字列が保存先の
    // パス組み立てまで届く。
    expect(() => parseElementId(raw)).toThrow(ElementIdError);
  });

  it("拒否した値をメッセージへ入れない", () => {
    // ログや応答へ外部入力が反射する。
    let message = "";
    try {
      parseElementId("el-../../etc/passwd");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("passwd");
  });
});
