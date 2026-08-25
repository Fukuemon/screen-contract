import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./snapshot.js";

const FULL = {
  runId: "current",
  status: "paused",
  mode: "operate",
  recording: true,
  events: [{ kind: "paused", atIndex: 0 }],
  entryUrl: "http://127.0.0.1:5174",
  stateId: "http://127.0.0.1:5174/",
  steps: [{ id: "step-0", action: { kind: "click", ref: "el-a" }, expect: [{ kind: "url" }] }],
  newElements: [
    { id: "el-a", name: "開く", type: "button", locator: { role: "button", name: "開く" } },
  ],
  badges: ["el-a"],
  warnings: [],
};

describe("parseSnapshot", () => {
  it("揃った応答をそのまま写す", () => {
    expect(parseSnapshot(FULL)).toEqual({
      ...FULL,
      steps: [{ ...FULL.steps[0], warning: undefined }],
    });
  });

  it("項目が欠けても落ちない", () => {
    // 型は server 側 (app) が定めるが、**古い server プロセスが動いたまま
    // 新しい画面を読む**ことがある。そのときの応答は現在の型と一致しない。
    expect(parseSnapshot({})).toEqual({
      runId: "current",
      status: "idle",
      mode: "view",
      recording: false,
      events: [],
      entryUrl: "",
      stateId: "",
      steps: [],
      newElements: [],
      badges: [],
      warnings: [],
    });
  });

  it.each([undefined, null, "文字列", 42, []])("応答が %s でも落ちない", (value) => {
    expect(() => parseSnapshot(value)).not.toThrow();
  });

  it("badges を持たない応答を空として扱う", () => {
    // server を入れ替えた直後に実際に起きた形。
    const { badges: _dropped, ...withoutBadges } = FULL;
    expect(parseSnapshot(withoutBadges).badges).toEqual([]);
  });

  it("語彙にない status を idle にする", () => {
    expect(parseSnapshot({ ...FULL, status: "unknown" }).status).toBe("idle");
  });

  it("語彙にない mode を view にする", () => {
    expect(parseSnapshot({ ...FULL, mode: "evil" }).mode).toBe("view");
  });

  it("形の合わない step を落とす", () => {
    const broken = { ...FULL, steps: [{ id: "x", action: { kind: "click" } }, ...FULL.steps] };
    expect(parseSnapshot(broken).steps.map((step) => step.id)).toEqual(["step-0"]);
  });

  it("clickPoint の step を読む", () => {
    const withPoint = {
      ...FULL,
      steps: [{ id: "p", action: { kind: "clickPoint", x: 1, y: 2 }, expect: [] }],
    };
    expect(parseSnapshot(withPoint).steps[0]?.action).toEqual({ kind: "clickPoint", x: 1, y: 2 });
  });

  it("id を持たない step へ連番を振る", () => {
    const noId = { ...FULL, steps: [{ action: { kind: "click", ref: "el-a" }, expect: [] }] };
    expect(parseSnapshot(noId).steps[0]?.id).toBe("step-0");
  });

  it("locator を持たない要素定義を落とす", () => {
    const broken = { ...FULL, newElements: [{ id: "el-b", name: "x", type: "y" }] };
    expect(parseSnapshot(broken).newElements).toEqual([]);
  });

  it("文字列でない badge を落とす", () => {
    expect(parseSnapshot({ ...FULL, badges: ["el-a", 42, null] }).badges).toEqual(["el-a"]);
  });
});
