import { describe, expect, it } from "vitest";
import {
  authFrame,
  ConnectionError,
  httpBase,
  inputFrame,
  readEmbeddedToken,
  serverTargetOf,
  streamUrl,
  TOKEN_META_NAME,
} from "./connection.js";

const SERVED_ORIGIN = "http://127.0.0.1:5173";
const TARGET = serverTargetOf(SERVED_ORIGIN);

/** `document` の代わり。`querySelector` だけを持つ最小の相手。 */
function documentWith(token: string | undefined) {
  return {
    querySelector: (selectors: string) =>
      selectors === `meta[name="${TOKEN_META_NAME}"]` && token !== undefined
        ? { getAttribute: () => token }
        : null,
  };
}

describe("接続先", () => {
  it("自分が配信された origin へ繋ぐ", () => {
    expect(httpBase(TARGET)).toBe(SERVED_ORIGIN);
    expect(streamUrl(TARGET)).toBe("ws://127.0.0.1:5173/stream");
  });

  it("localhost で配信されていても繋ぐ", () => {
    expect(streamUrl(serverTargetOf("http://localhost:5173"))).toBe("ws://localhost:5173/stream");
  });

  it.each([
    ["別ホスト", "http://example.test:5173"],
    ["全アドレス", "http://0.0.0.0:5173"],
    ["ポート無し", "http://127.0.0.1"],
    ["file スキーム", "file:///tmp/x.html"],
    ["URL でない", "not-a-url"],
  ])("%s を接続先にしない", (_label, origin) => {
    expect(() => serverTargetOf(origin)).toThrow(ConnectionError);
  });

  it("ループバックの別ポート (実行基盤のポート) へ繋がない", () => {
    // **origin を選ばせない設計で塞ぐ。** 引数で選べると、agent-browser の
    // ポート (9222 等) を指定できてしまう (ADR-0008)。
    const other = serverTargetOf("http://127.0.0.1:9222");
    expect(other.origin).not.toBe(TARGET.origin);
    // 実際に使う値は location.origin から来るため、別ポートは現れない。
    expect(serverTargetOf(SERVED_ORIGIN).port).toBe(5173);
  });

  it("トークンを URL に載せない", () => {
    // URL は履歴・Referer・アクセスログに残る。
    const token = "s3cr3t";
    expect(streamUrl(TARGET)).not.toContain(token);
    expect(httpBase(TARGET)).not.toContain(token);
    expect(streamUrl(TARGET)).not.toContain("?");
  });

  it("最初に送るフレームが auth である", () => {
    expect(authFrame("s3cr3t", "run-1")).toEqual({
      kind: "auth",
      token: "s3cr3t",
      runId: "run-1",
    });
    // 入力フレームはトークンを持たない。持たせると毎フレーム秘密が流れる。
    expect(JSON.stringify(inputFrame("x"))).not.toContain("token");
  });
});

describe("トークンの受け取り", () => {
  it("配信された HTML の meta から読む", () => {
    // ブラウザは runtime.json を読めないため、Web UI だけは別経路が要る。
    expect(readEmbeddedToken(documentWith("s3cr3t"))).toBe("s3cr3t");
  });

  it("埋め込まれていなければ明示的に失敗する", () => {
    // 隠すと、原因の分からない 401 になる。
    expect(() => readEmbeddedToken(documentWith(undefined))).toThrow(ConnectionError);
    expect(() => readEmbeddedToken(documentWith(""))).toThrow(ConnectionError);
  });
});
