import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ElementDef, ObservedElement } from "@screen-contract/core-element";
import {
  authoritativeWriterOf,
  createApprovalQueue,
  createUseCases,
  draftStoreOf,
  parseStoreKey,
  startRecording,
  stopRecording,
  type RecordedAction,
  type RecordedObservation,
} from "@screen-contract/app";
import { createAgentBrowserPort } from "@screen-contract/adapter-browser";
import { createFsStore } from "@screen-contract/adapter-store";
import {
  layoutBadges,
  parseArtifactSegment,
  rawImageName,
  renderAnnotatedImage,
  renderElementTable,
} from "@screen-contract/core-artifact";
import type { ExecutionStep } from "@screen-contract/core-workflow";
import {
  reconstruct,
  rerunStep,
  runSteps,
  type BrowserSession,
  type Observation,
} from "@screen-contract/core-execution";
import type { ElementId } from "@screen-contract/domain";
import { startFixtureApp, type FixtureApp } from "@screen-contract/fixture-app";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * walking skeleton の通し検証。
 *
 * **中核ロジックはここで検証する。** 冪等スキップ、Locator の解決、Snapshot の
 * 取得を、実際の実行基盤を起動して確かめる (context/testing.md)。
 * Web UI を介さず、app と adapter の結線を直接叩く。
 */

/** テスト専用の名前空間で隔離する。ブラウザ本体のキャッシュは共有する。 */
const NAMESPACE = "sc-skeleton-integration";

let app: FixtureApp;
let stateDir: string;
let session: BrowserSession;

beforeAll(async () => {
  app = await startFixtureApp();
  stateDir = mkdtempSync(join(tmpdir(), "sc-skeleton-"));
  const port = createAgentBrowserPort({ home: process.env["HOME"] ?? "", namespace: NAMESPACE });
  session = await port.createSession({ kind: "anonymous" });
  await session.perform({ kind: "open", url: `${app.origin}/` });
}, 60_000);

afterAll(async () => {
  await session.close();
  await app.close();
  rmSync(stateDir, { recursive: true, force: true });
});

function store() {
  return createFsStore({ root: stateDir });
}

/** 観測を記録用の形へ写す。可視かどうかは観測に現れることで表す。 */
function toRecorded(elements: readonly ObservedElement[], url: string): RecordedObservation {
  return {
    url,
    title: "設定画面",
    visibleRefs: elements.map((element) => `el-${element.name}` as ElementId),
  };
}

/** 実行の相手。Browser Port を要素定義で包む。 */
function runnerFor(elements: readonly ElementDef[]) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  return {
    observe: async (): Promise<Observation> => {
      const observed = await session.observeElements();
      const visible = new Map<string, boolean>();
      for (const element of byId.values()) {
        const found = observed.some(
          (o) => o.role === element.locator.role && o.name === element.locator.name,
        );
        visible.set(element.id, found);
      }
      return {
        url: new URL(await session.currentUrl()).pathname,
        title: "設定画面",
        elements: visible,
        counts: new Map(),
      };
    },
    perform: async (step: ExecutionStep): Promise<void> => {
      if (step.action.kind === "open") {
        await session.perform({ kind: "open", url: step.action.url });
        return;
      }
      if (step.action.kind !== "click") {
        throw new Error(`未対応の action です: ${step.action.kind}`);
      }
      const element = byId.get(step.action.ref as ElementId);
      if (element === undefined) {
        throw new Error("要素定義がありません");
      }
      await session.perform({ kind: "click", locator: element.locator });
    },
  };
}

describe("記録", () => {
  it("座標のクリックを ref を指す step として記録し、要素定義も draft へ入れる", async () => {
    const observed = await session.observeElements();
    const button = observed.find((element) => element.role === "button");
    expect(button).toBeDefined();

    const forwarded: RecordedAction[] = [];
    const recording = startRecording("default");
    const step = await recording.click(
      {
        elements: observed,
        x: button!.box.x + button!.box.width / 2,
        y: button!.box.y + button!.box.height / 2,
        nextId: (locator) => `el-${locator.name}` as ElementId,
      },
      async (action) => {
        forwarded.push(action);
        if (action.kind === "click") {
          await session.perform({
            kind: "click",
            locator: { role: button!.role, name: button!.name },
          });
        }
      },
      async () => toRecorded(await session.observeElements(), "/"),
    );

    // **座標ではなく ref を指す。**
    expect(step.action).toEqual({ kind: "click", ref: `el-${button!.name}` });
    expect(step.warning).toBeUndefined();
    expect(forwarded).toEqual([step.action]);

    const draft = recording.finish();
    // 要素定義が同時に draft へ入る。
    expect(draft.newElements).toEqual([
      {
        id: `el-${button!.name}`,
        name: button!.name,
        type: button!.role,
        locator: { role: button!.role, name: button!.name },
      },
    ]);
    // 操作の前後で変化した項目だけが候補になる。
    expect(step.expect.every((e) => e.kind !== "url")).toBe(true);
  }, 60_000);

  it("記録を停止すると、記録に使った run を resume して completed で終える", async () => {
    // 記録は draft を書く操作なので、pause 中に draft が変わる。したがって
    // 再開時に IR の版が差し替わる (ADR-0018)。
    await session.perform({ kind: "open", url: `${app.origin}/` });
    const outcome = await stopRecording({
      session: startRecording("default"),
      irVersion: "v1",
      currentIrVersion: "v2",
      steps: [
        {
          action: { kind: "open", url: `${app.origin}/` },
          expect: [{ kind: "url", path: "/" }],
          origin: { document: "workflow", documentId: "goto", index: 0 },
        },
      ],
      runner: runnerFor([]),
    });
    expect(outcome.run.events.map((event) => event.kind)).toEqual([
      "ir-version-changed",
      "resumed",
      "step-started",
      "expectation-evaluated",
      "step-skipped",
      "run-completed",
    ]);
    expect(outcome.draft.fromState).toBe("default");
  }, 60_000);
});

describe("承認", () => {
  const KEY = parseStoreKey("screens/login");

  it("draft と正本が別のものとして保存される", async () => {
    const fs = store();
    const queue = createApprovalQueue(draftStoreOf(fs), authoritativeWriterOf(fs));
    await queue.saveDraft(KEY, "draft の内容");
    const request = await queue.requestApproval(KEY);
    expect(await queue.approve(request.id)).toMatchObject({ kind: "approved" });

    // 別のディレクトリに実ファイルとして並ぶ。
    expect(statSync(join(stateDir, "drafts", "screens", "login")).isFile()).toBe(true);
    expect(statSync(join(stateDir, "authoritative", "screens", "login")).isFile()).toBe(true);
    // 承認後も draft は残る。差し戻しからの再依頼で元の内容を辿れる。
    expect(await fs.load("draft", KEY)).toBe("draft の内容");
  });

  it("承認待ちの間に編集すると stale になる", async () => {
    const fs = store();
    const queue = createApprovalQueue(draftStoreOf(fs), authoritativeWriterOf(fs));
    const key = parseStoreKey("screens/stale");
    await queue.saveDraft(key, "依頼した内容");
    const request = await queue.requestApproval(key);
    await queue.saveDraft(key, "後から書き換えた内容");
    expect(await queue.approve(request.id)).toMatchObject({ kind: "stale" });
    expect(await fs.load("authoritative", key)).toBeUndefined();
  });

  it("実行履歴が正本を上書きしない", async () => {
    // 鍵を合わせても、置き場が別なので正本へ届かない (ADR-0017)。
    const fs = store();
    // **共有セッションを渡さない。** startRun は finally で close するため、
    // 渡すと後続のテストがセッションを失う。
    const useCases = createUseCases({
      browser: createAgentBrowserPort({
        home: process.env["HOME"] ?? "",
        namespace: NAMESPACE,
      }),
      store: fs,
    });
    const key = parseStoreKey("run/r1/anon/snapshot");
    const queue = createApprovalQueue(draftStoreOf(fs), authoritativeWriterOf(fs));
    await queue.saveDraft(key, "承認した内容");
    await queue.approve((await queue.requestApproval(key)).id);

    await useCases.startRun({ runId: "r1" as never, auth: { kind: "anonymous" } });
    expect(await fs.load("authoritative", key)).toBe("承認した内容");
    expect(await fs.load("history", key)).not.toBe("承認した内容");
  }, 60_000);
});

describe("再現と冪等スキップ", () => {
  it("記録どおりに再現し、同じセッションでの再実行は全て skipped になる", async () => {
    // 記録した状態へ戻す。
    await session.perform({ kind: "open", url: `${app.origin}/` });
    const observed = await session.observeElements();
    const button = observed.find((element) => element.role === "button");
    const elements: ElementDef[] = [
      {
        id: "el-open" as ElementId,
        name: button!.name,
        type: button!.role,
        locator: { role: button!.role, name: button!.name },
      },
      {
        // **`--annotate` は dialog 自体を返さず、中の要素だけを返す。**
        // モーダルが開いたことは、開いたときにだけ現れる要素で表す。
        id: "el-close" as ElementId,
        name: "閉じる",
        type: "button",
        locator: { role: "button", name: "閉じる" },
      },
    ];
    const steps: ExecutionStep[] = [
      {
        action: { kind: "open", url: `${app.origin}/` },
        expect: [{ kind: "url", path: "/" }],
        origin: { document: "workflow", documentId: "goto", index: 0 },
      },
      {
        action: { kind: "click", ref: "el-open" },
        expect: [{ kind: "element", ref: "el-close", visible: true }],
        origin: { document: "screen", documentId: "login", stateId: "modal-open", index: 1 },
      },
    ];

    const first = await runSteps({ steps, irVersion: "v1", runner: runnerFor(elements) });
    expect(first.status).toBe("completed");
    // open は既に満たしているので skip、click は実行される。
    expect(first.results.map((r) => r.outcome)).toEqual(["skipped", "executed"]);

    // **同じセッション**で最初のステップから再実行する。
    const again = await rerunStep({
      steps,
      irVersion: "v1",
      currentIrVersion: "v1",
      fromIndex: 0,
      previousResults: first.results,
      runner: runnerFor(elements),
    });
    expect(again.results.map((r) => r.outcome)).toEqual(["skipped", "skipped"]);
    expect(again.status).toBe("completed");

    // イベント列だけからステップ結果を再構成できる。
    expect(reconstruct(first.events)).toEqual({
      status: first.status,
      results: first.results,
    });

    // 実行イベント列に現れるのは 11 件に限る。
    const allowed = new Set([
      "run-started",
      "step-started",
      "expectation-evaluated",
      "step-skipped",
      "step-executed",
      "step-failed",
      "paused",
      "ir-version-changed",
      "resumed",
      "run-completed",
      "run-failed",
    ]);
    for (const event of [...first.events, ...again.events]) {
      expect(allowed.has(event.kind)).toBe(true);
    }
  }, 120_000);
});

describe("成果物", () => {
  it("到達した状態から注釈画像とテーブルを生成し、同じ入力では書き換えない", async () => {
    const observed = await session.observeElements();
    const target = observed.find((element) => element.role === "button");
    const shot = await session.screenshot();
    const bytes = shot.bytes;
    const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
    const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;

    const stateId = parseArtifactSegment("default");
    const layout = layoutBadges({
      badges: ["el-open"],
      boxes: new Map([["el-open", target!.box]]),
      image: { width, height },
    });
    expect(layout.warnings).toEqual([]);
    // バッジ 1 個。
    expect(layout.placements).toHaveLength(1);
    expect(layout.placements[0]?.number).toBe(1);

    const svg = renderAnnotatedImage({
      width,
      height,
      rawImage: bytes,
      placements: layout.placements,
    });
    const table = renderElementTable({
      badges: ["el-open"],
      elementIds: ["el-open"],
      elements: [
        {
          id: "el-open",
          name: target!.name,
          type: target!.role,
          states: ["default"],
          hiddenIn: [],
          optional: false,
        },
      ],
    });
    // 1 行の Markdown テーブル (見出し 2 行 + 本文 1 行)。
    expect(table.markdown.trimEnd().split("\n")).toHaveLength(3);
    expect(table.warnings).toEqual([]);

    const fs = store();
    const svgKey = parseStoreKey(`artifacts/${stateId}.svg`);
    const tableKey = parseStoreKey(`artifacts/${stateId}.md`);
    await fs.save("authoritative", svgKey, svg);
    await fs.save("authoritative", tableKey, table.markdown);
    const svgPath = join(stateDir, "authoritative", "artifacts", `${stateId}.svg`);
    const before = statSync(svgPath).mtimeMs;

    // 同じ入力でもう一度生成する。**内容が同じなら書き換えない。**
    const again = renderAnnotatedImage({
      width,
      height,
      rawImage: bytes,
      placements: layout.placements,
    });
    expect(again).toBe(svg);
    const decided = (await fs.load("authoritative", svgKey)) === again ? "unchanged" : "changed";
    expect(decided).toBe("unchanged");
    // 書き換えないので mtime も変わらない。
    expect(statSync(svgPath).mtimeMs).toBe(before);

    // 生スクリーンショットは別ファイルとして持つ (差分検知の対象)。
    expect(rawImageName(stateId)).toBe("default.raw.png");
  }, 120_000);
});

describe("操作モードの入力転送", () => {
  it("一時停止した run の操作モードでだけ入力が対象ページへ届く", async () => {
    // 中継条件は server 側の run 状態で判定する (ADR-0008)。client の自称では
    // 満たせない。
    const { createRunSession } = await import("./viewport/run-session.js");
    const runner = {
      observe: async () => ({
        url: new URL(await session.currentUrl()).pathname,
        title: "",
        elements: new Map<string, boolean>(),
        counts: new Map<string, number>(),
      }),
      perform: async (step: ExecutionStep) => {
        if (step.action.kind === "open") {
          await session.perform({ kind: "open", url: step.action.url });
        }
      },
    };
    const run = createRunSession({ entryUrl: `${app.origin}/`, runner: () => runner });

    // run を起こす前は中継しない。
    expect(run.relayState()).toBeUndefined();

    await run.start();
    expect(run.relayState()).toEqual({ runId: "current", paused: true, mode: "view" });

    // 選択モードのままでは中継条件を満たさない。
    const { discardReason } = await import("@screen-contract/api");
    expect(discardReason(run.relayState(), { requesterRunId: "current" })).toBe("not-operate-mode");

    run.setMode("operate");
    expect(discardReason(run.relayState(), { requesterRunId: "current" })).toBeUndefined();
    // 他人の run を名乗った入力は、操作モードでも中継しない。
    expect(discardReason(run.relayState(), { requesterRunId: "other" })).toBe("foreign-run");

    await run.resume();
    expect(discardReason(run.relayState(), { requesterRunId: "current" })).toBe("not-paused");
  }, 120_000);
});
