import { describe, expect, it } from "vitest";
import {
  flattenExecutionSteps,
  normalizeScreen,
  parseScreenDocument,
  parseWorkflowDocument,
  WorkflowError,
  type NormalizeInput,
} from "./index.js";

const workflowRaw = {
  version: 1,
  workflow: {
    id: "goto-settings",
    steps: [
      {
        action: { open: { url: "http://127.0.0.1:5173/" } },
        expect: [{ url: { path: "/" } }],
      },
    ],
  },
};

const screenRaw = {
  version: 1,
  screen: {
    id: "settings",
    title: "設定画面",
    entry: { workflow: "goto-settings" },
    states: [
      {
        id: "default",
        expect: [{ element: { ref: "el-open", visible: true } }],
        badges: ["el-open"],
      },
      {
        id: "modal-open",
        from: "default",
        steps: [{ action: { click: { ref: "el-open" } } }],
        expect: [{ element: { ref: "el-modal", visible: true } }],
        badges: ["el-modal"],
      },
    ],
    elements: [
      {
        id: "el-open",
        name: "設定を開く",
        type: "button",
        locator: { role: "button", name: "設定を開く" },
      },
      {
        id: "el-modal",
        name: "設定モーダル",
        type: "dialog",
        locator: { role: "dialog" },
        states: ["modal-open"],
      },
    ],
  },
};

function input(screen: unknown = screenRaw, workflow: unknown = workflowRaw): NormalizeInput {
  const parsed = parseWorkflowDocument(workflow);
  return {
    screen: parseScreenDocument(screen),
    workflows: new Map([[parsed.id, parsed]]),
  };
}

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowError);
    expect((error as WorkflowError).code).toBe(code);
    return;
  }
  expect.unreachable("エラーにならなかった");
}

describe("parseScreenDocument", () => {
  it("2 状態 1 遷移の文書を受け入れる", () => {
    const screen = parseScreenDocument(screenRaw);
    expect(screen.id).toBe("settings");
    expect(screen.states.map((s) => s.id)).toEqual(["default", "modal-open"]);
    expect(screen.states[1]?.steps[0]).toEqual({
      kind: "action",
      action: { kind: "click", ref: "el-open" },
      expect: [],
    });
  });

  it("badges のリスト位置が構成番号になる (要素定義は番号を持たない)", () => {
    const screen = parseScreenDocument(screenRaw);
    expect(screen.states[0]?.badges).toEqual(["el-open"]);
    expect(screen.elements[0]).not.toHaveProperty("number");
  });

  it.each([
    ["version が無い", { screen: screenRaw.screen }],
    ["対応しない version", { ...screenRaw, version: 2 }],
    [
      "default 状態が無い",
      {
        ...screenRaw,
        screen: { ...screenRaw.screen, states: [{ id: "x", from: "default", steps: [] }] },
      },
    ],
    [
      "default に from がある",
      {
        ...screenRaw,
        screen: { ...screenRaw.screen, states: [{ id: "default", from: "x" }] },
      },
    ],
    [
      "default 以外に from が無い",
      {
        ...screenRaw,
        screen: { ...screenRaw.screen, states: [{ id: "default" }, { id: "x" }] },
      },
    ],
    [
      "未知の action",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          states: [
            { id: "default" },
            { id: "x", from: "default", steps: [{ action: { teleport: { to: "x" } } }] },
          ],
        },
      },
    ],
    [
      "未知の Expectation",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          states: [{ id: "default", expect: [{ vibe: { good: true } }] }],
        },
      },
    ],
    [
      "action が 2 つの語彙を持つ",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          states: [
            { id: "default" },
            {
              id: "x",
              from: "default",
              steps: [{ action: { click: { ref: "a" }, hover: { ref: "b" } } }],
            },
          ],
        },
      },
    ],
  ])("規則に合わない文書を拒否する: %s", (_name, raw) => {
    expectCode(() => parseScreenDocument(raw), "schema/invalid");
  });

  it("語彙は一通り受け付ける (実行系の対応可否とは別)", () => {
    // Schema を段階的に広げると、語彙を足すたびに検証とテストを触ることになる。
    const screen = parseScreenDocument({
      ...screenRaw,
      screen: {
        ...screenRaw.screen,
        states: [
          { id: "default" },
          {
            id: "x",
            from: "default",
            steps: [
              { action: { fill: { ref: "a", value: "v" } } },
              { action: { hover: { ref: "a" } } },
              { action: { scroll: { ref: "a" } } },
              { action: { clickPoint: { x: 1, y: 2 } } },
            ],
            expect: [{ title: { value: "t" } }, { count: { ref: "a", value: 2 } }],
          },
        ],
      },
    });
    expect(screen.states[1]?.steps).toHaveLength(4);
  });
});

describe("normalizeScreen", () => {
  it("状態ごとに現れる要素を継承規則から確定させる", () => {
    const ir = normalizeScreen(input());
    expect(ir.states[0]?.elementIds).toEqual(["el-open"]);
    // 子孫状態は遷移元の要素を継承する。
    expect(ir.states[1]?.elementIds).toEqual(["el-open", "el-modal"]);
  });

  it("版は内容から決まり、編集していなければ同じ値になる", () => {
    expect(normalizeScreen(input()).version).toBe(normalizeScreen(input()).version);
  });

  it("1 文字でも変われば別の版になる", () => {
    const edited = { ...screenRaw, screen: { ...screenRaw.screen, title: "設定画面 " } };
    expect(normalizeScreen(input(edited)).version).not.toBe(normalizeScreen(input()).version);
  });

  it("キーの順序が違っても同じ版になる", () => {
    // JSON.stringify はキーの挿入順をそのまま出す。順序で版が変わると、
    // 編集していないのに ir-version-changed が出る。
    const reordered = {
      screen: { ...screenRaw.screen },
      version: 1,
    };
    expect(normalizeScreen(input(reordered)).version).toBe(normalizeScreen(input()).version);
  });

  it.each([
    [
      "要素 ID の重複",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          elements: [screenRaw.screen.elements[0], screenRaw.screen.elements[0]],
        },
      },
      "element/duplicate-id",
    ],
    [
      "badges の未解決参照",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          states: [{ id: "default", badges: ["el-missing"] }],
        },
      },
      "ref/unresolved",
    ],
    [
      "badges の重複",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          states: [{ id: "default", badges: ["el-open", "el-open"] }],
          elements: [screenRaw.screen.elements[0]],
        },
      },
      "badges/invalid",
    ],
    [
      "状態の循環",
      {
        ...screenRaw,
        screen: {
          ...screenRaw.screen,
          states: [{ id: "default" }, { id: "a", from: "b" }, { id: "b", from: "a" }],
          elements: [screenRaw.screen.elements[0]],
        },
      },
      "ref/cyclic",
    ],
  ])("正規化で規則違反を検出する: %s", (_name, raw, code) => {
    expectCode(() => normalizeScreen(input(raw)), code);
  });

  it("optional な要素を badges に載せさせない", () => {
    // 載せると番号が飛ぶ。optional はテーブルに番号 - で載る。
    expectCode(
      () =>
        normalizeScreen(
          input({
            ...screenRaw,
            screen: {
              ...screenRaw.screen,
              states: [{ id: "default", badges: ["el-note"] }],
              elements: [{ id: "el-note", name: "注記", type: "text", optional: true }],
            },
          }),
        ),
      "badges/invalid",
    );
  });

  it("entry の Workflow が見つからなければ弾く", () => {
    expectCode(
      () => normalizeScreen({ screen: parseScreenDocument(screenRaw), workflows: new Map() }),
      "ref/unresolved",
    );
  });
});

describe("flattenExecutionSteps", () => {
  it("entry から対象状態まで順に平坦化する", () => {
    const steps = flattenExecutionSteps(input(), "modal-open");
    expect(steps.map((s) => s.action.kind)).toEqual(["open", "click"]);
    expect(steps[0]?.origin).toEqual({
      document: "workflow",
      documentId: "goto-settings",
      index: 0,
    });
    expect(steps[1]?.origin).toEqual({
      document: "screen",
      documentId: "settings",
      stateId: "modal-open",
      index: 0,
    });
  });

  it("entry の open は url の Expectation を持つ", () => {
    // Expectation を持たないステップは必ず実行される。持たないと
    // 「全ステップが skipped」が成立しない。
    expect(flattenExecutionSteps(input(), "default")[0]?.expect).toEqual([
      { kind: "url", path: "/" },
    ]);
  });

  it("default を対象にすると entry だけになる", () => {
    expect(flattenExecutionSteps(input(), "default")).toHaveLength(1);
  });

  it("名前付き断片を展開する", () => {
    const withFragment = {
      ...screenRaw,
      screen: {
        ...screenRaw.screen,
        fragments: { "open-settings": [{ action: { click: { ref: "el-open" } } }] },
        states: [
          screenRaw.screen.states[0],
          { ...screenRaw.screen.states[1], steps: [{ use: "open-settings" }] },
        ],
      },
    };
    expect(
      flattenExecutionSteps(input(withFragment), "modal-open").map((s) => s.action.kind),
    ).toEqual(["open", "click"]);
  });

  it.each([
    ["自己参照", { a: [{ use: "a" }] }, "ref/cyclic"],
    ["相互参照", { a: [{ use: "b" }], b: [{ use: "a" }] }, "ref/cyclic"],
    ["未解決の断片", { a: [{ action: { click: { ref: "el-open" } } }] }, "ref/unresolved"],
  ])("展開の停止性を守る: %s", (name, fragments, code) => {
    const raw = {
      ...screenRaw,
      screen: {
        ...screenRaw.screen,
        fragments,
        states: [
          screenRaw.screen.states[0],
          {
            ...screenRaw.screen.states[1],
            steps: [{ use: name === "未解決の断片" ? "missing" : "a" }],
          },
        ],
      },
    };
    expectCode(() => flattenExecutionSteps(input(raw), "modal-open"), code);
  });

  it.each([
    ["未対応の action", { action: { hover: { ref: "el-open" } } }, "action/unimplemented"],
    [
      "未対応の Expectation",
      { action: { click: { ref: "el-open" } }, expect: [{ title: { value: "t" } }] },
      "expect/unimplemented",
    ],
  ])("実行系が対応していない語彙を黙って無視しない: %s", (_name, step, code) => {
    // 無視すると、書いたステップが実行されないまま skipped として記録されうる。
    const raw = {
      ...screenRaw,
      screen: {
        ...screenRaw.screen,
        states: [screenRaw.screen.states[0], { ...screenRaw.screen.states[1], steps: [step] }],
      },
    };
    expectCode(() => flattenExecutionSteps(input(raw), "modal-open"), code);
  });
});
