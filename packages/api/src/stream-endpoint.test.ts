import { describe, expect, it } from "vitest";
import {
  createStreamConnection,
  createStreamProxy,
  type RunState,
  type StreamProxy,
  type StreamSink,
} from "./index.js";

const TOKEN = "a".repeat(64);

function sink(): StreamSink & { readonly sent: string[] } {
  const sent: string[] = [];
  return { sent, send: (payload) => void sent.push(payload) };
}

function setup(state: RunState | undefined = { runId: "run-1", paused: true, mode: "operate" }) {
  const upstream = sink();
  const proxy: StreamProxy = createStreamProxy({
    upstream,
    downstream: sink(),
    runState: { current: () => state },
  });
  return { upstream, proxy, connection: createStreamConnection({ token: TOKEN, proxy }) };
}

const AUTH = JSON.stringify({ kind: "auth", token: TOKEN, runId: "run-1" });
/** 中継してよい語彙の入力。列挙外の形は Stream Proxy 側が拒む。 */
const CLICK = JSON.stringify({ type: "input_mouse", eventType: "mousePressed", x: 1, y: 2 });
const INPUT = JSON.stringify({ kind: "input", payload: CLICK });

describe("接続後の最初のフレームで認証する", () => {
  it("正しいトークンで認証を通す", () => {
    const { connection } = setup();
    expect(connection.receive(AUTH)).toBeUndefined();
    expect(connection.authenticated()).toBe(true);
  });

  it("認証前の入力を中継しない", () => {
    // 最初のフレームは必ず auth である。
    const { connection, upstream } = setup();
    expect(connection.receive(INPUT)).toBe("unauthenticated");
    expect(upstream.sent).toEqual([]);
    expect(connection.authenticated()).toBe(false);
  });

  it("誤ったトークンを拒否する", () => {
    const { connection } = setup();
    expect(connection.receive(JSON.stringify({ kind: "auth", token: "b", runId: "run-1" }))).toBe(
      "unauthenticated",
    );
    expect(connection.authenticated()).toBe(false);
  });

  it("2 度目の認証を受けない", () => {
    // 受けると、認証後に要求元の run を差し替えて他人の run へ入力を送れる。
    const { connection, upstream } = setup();
    connection.receive(AUTH);
    expect(connection.receive(JSON.stringify({ kind: "auth", token: TOKEN, runId: "run-2" }))).toBe(
      "already-authenticated",
    );
    connection.receive(INPUT);
    expect(upstream.sent).toEqual([CLICK]);
  });

  it.each([
    ["JSON でない", "not json"],
    ["語彙にない kind", JSON.stringify({ kind: "evil" })],
    ["token が無い", JSON.stringify({ kind: "auth", runId: "run-1" })],
    ["runId が無い", JSON.stringify({ kind: "auth", token: TOKEN })],
    ["payload が文字列でない", JSON.stringify({ kind: "input", payload: 1 })],
    ["配列", JSON.stringify([])],
    ["null", "null"],
  ])("%s のフレームを拒否する", (_label, raw) => {
    const { connection } = setup();
    expect(connection.receive(raw)).toBe("bad-frame");
  });
});

describe("認証後の中継", () => {
  it("条件を満たす入力を転送する", () => {
    const { connection, upstream } = setup();
    connection.receive(AUTH);
    expect(connection.receive(INPUT)).toBeUndefined();
    expect(upstream.sent).toEqual([CLICK]);
  });

  it("再生中の入力は認証を通っていても転送しない", () => {
    // 中継の可否は server 側の run 状態で判定する (ADR-0008)。
    const { connection, upstream, proxy } = setup({
      runId: "run-1",
      paused: false,
      mode: "operate",
    });
    connection.receive(AUTH);
    connection.receive(INPUT);
    expect(upstream.sent).toEqual([]);
    expect(proxy.discarded().map((e) => e.reason)).toEqual(["not-paused"]);
  });

  it("他人の run を名乗った入力は転送しない", () => {
    const { connection, upstream, proxy } = setup();
    connection.receive(JSON.stringify({ kind: "auth", token: TOKEN, runId: "run-2" }));
    connection.receive(INPUT);
    expect(upstream.sent).toEqual([]);
    expect(proxy.discarded().map((e) => e.reason)).toEqual(["foreign-run"]);
  });
});
