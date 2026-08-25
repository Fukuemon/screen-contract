import type { ApprovalRequest, RecordedStep } from "@screen-contract/api";
import { describe, expect, it } from "vitest";
import {
  expectationWarnings,
  forgetMissing,
  INITIAL_APPROVAL_UI,
  rejectApprove,
  showDiff,
  type DiffView,
} from "./approval.js";

function request(id: string, revision: string): ApprovalRequest {
  return { id, key: "screens/login" as ApprovalRequest["key"], revision } as ApprovalRequest;
}

const A = request("r-1", "rev-a");
const B = request("r-2", "rev-b");

function diff(id: string, revision: string): DiffView {
  return { requestId: id, revision, before: "旧", after: "新" };
}

describe("承認の導線", () => {
  it("差分を表示していない依頼を承認させない", () => {
    // 見ずに確定できると、承認が「内容を確かめた」ことの証拠にならない。
    expect(rejectApprove(INITIAL_APPROVAL_UI, [A], A.id)).toBe("not-reviewed");
  });

  it("差分を表示したら承認できる", () => {
    const shown = showDiff(INITIAL_APPROVAL_UI, diff(A.id, A.revision));
    expect(rejectApprove(shown, [A], A.id)).toBeUndefined();
  });

  it("別の依頼の差分を見ても承認できない", () => {
    const shown = showDiff(INITIAL_APPROVAL_UI, diff(B.id, B.revision));
    expect(rejectApprove(shown, [A, B], A.id)).toBe("not-reviewed");
  });

  it("見た差分から内容が変わったら承認させない", () => {
    // server も stale で弾くが、押せてしまう時点で「確かめた」証拠にならない。
    const shown = showDiff(INITIAL_APPROVAL_UI, diff(A.id, "rev-old"));
    expect(rejectApprove(shown, [A], A.id)).toBe("stale-review");
  });

  it("知らない依頼を承認させない", () => {
    expect(rejectApprove(INITIAL_APPROVAL_UI, [A], "r-999")).toBe("unknown-request");
  });

  it("消えた依頼の既読を持ち越さない", () => {
    const shown = showDiff(INITIAL_APPROVAL_UI, diff(A.id, A.revision));
    expect(forgetMissing(shown, [B]).reviewed.has(A.id)).toBe(false);
  });

  it("残っている依頼の既読は保つ", () => {
    const shown = showDiff(INITIAL_APPROVAL_UI, diff(A.id, A.revision));
    expect(forgetMissing(shown, [A, B]).reviewed.get(A.id)).toBe(A.revision);
  });
});

describe("Expectation を選ばずに承認できることの明示", () => {
  function step(overrides: Partial<RecordedStep> = {}): RecordedStep {
    return { action: { kind: "click", ref: "el-open" }, expect: [], ...overrides } as RecordedStep;
  }

  it("期待状態を持たないステップを警告する", () => {
    // 選ばないと冪等スキップが効かず、再生のたびに実行される。
    const warnings = expectationWarnings([step(), step()]);
    expect(warnings[0]).toContain("2 件");
    expect(warnings[0]).toContain("冪等スキップ");
  });

  it("解決できなかった操作を警告する", () => {
    const warnings = expectationWarnings([
      step({ action: { kind: "clickPoint", x: 1, y: 2 }, warning: "座標を含む要素がありません" }),
    ]);
    expect(warnings.some((w) => w.includes("座標のまま"))).toBe(true);
  });

  it("問題が無ければ警告を出さない", () => {
    expect(expectationWarnings([step({ expect: [{ kind: "url", path: "/settings" }] })])).toEqual(
      [],
    );
  });
});
