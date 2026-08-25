import { createApprovalQueue, type ApprovalRequest, type ApprovalResult } from "./approval.js";
import { type Revision } from "./revision.js";
import {
  authoritativeWriterOf,
  draftStoreOf,
  parseStoreKey,
  type StoreKey,
  type StorePort,
} from "./store.js";
import {
  authContextKey,
  parseAuthProfileName,
  parseRunId,
  type AuthContext,
  type BrowserPort,
  type RunId,
} from "@screen-contract/core-execution";

export interface UseCaseDeps {
  readonly browser: BrowserPort;
  readonly store: StorePort;
}

export interface StartRunInput {
  readonly runId: RunId;
  readonly auth: AuthContext;
}

/**
 * interface 層 (api / agent) が外部入力を use case の入力へ変換する唯一の経路。
 *
 * **interface 層で必ずこれを通す。** branded type は実行時の保証を持たないため、
 * 型アサーションで持ち上げると `{kind:"profile", name:"../../.ssh/id_rsa"}` が
 * そのまま保存先のパス組み立てまで届く。
 *
 * interface 層は core / domain を参照できない (context/architecture.md) ため、
 * AuthContext を自力で組み立てられない。app がこの変換を提供する。
 */
export function parseStartRunInput(raw: unknown): StartRunInput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("run の開始入力がオブジェクトではありません");
  }
  const { runId, authProfile } = raw as { runId?: unknown; authProfile?: unknown };
  if (typeof runId !== "string") {
    throw new Error("run の開始入力に runId がありません");
  }
  if (authProfile !== undefined && authProfile !== null && typeof authProfile !== "string") {
    throw new Error("認証プロファイル名は文字列で指定します");
  }
  const auth: AuthContext =
    authProfile === undefined || authProfile === null
      ? { kind: "anonymous" }
      : { kind: "profile", name: parseAuthProfileName(authProfile) };
  return { runId: parseRunId(runId), auth };
}

export interface UseCases {
  startRun(input: StartRunInput): Promise<void>;
  saveDraft(key: StoreKey, content: string): Promise<Revision>;
  loadDraft(key: StoreKey): Promise<string | undefined>;
  /** 差分表示のために正本を読む。書き込みは承認 use case だけが行う。 */
  loadAuthoritative(key: StoreKey): Promise<string | undefined>;
  requestApproval(key: StoreKey): Promise<ApprovalRequest>;
  approve(requestId: string): Promise<ApprovalResult>;
  listPendingApprovals(): readonly ApprovalRequest[];
}

/** adapter の具象を受け取らない。合成ルートが注入する (ADR-0023)。 */
export function createUseCases(deps: UseCaseDeps): UseCases {
  const approvals = createApprovalQueue(
    draftStoreOf(deps.store),
    authoritativeWriterOf(deps.store),
  );
  return {
    ...approvals,
    loadDraft: (key: StoreKey) => deps.store.load("draft", key),
    loadAuthoritative: (key: StoreKey) => deps.store.load("authoritative", key),
    async startRun(input: StartRunInput): Promise<void> {
      const session = await deps.browser.createSession(input.auth);
      try {
        const snapshot = await session.snapshot();
        // 鍵に run と認証コンテキストを含める。含めないと権限の異なる実行結果が
        // 同じ場所へ混ざり、Baseline を (screen, state, authProfile) で
        // 識別する前提が壊れる (ADR-0022)。
        const key = parseStoreKey(`run/${input.runId}/${authContextKey(input.auth)}/snapshot`);
        // 実行履歴は正本とも draft とも別の置き場に残す。**正本へ書かない。**
        // 混ぜると、鍵を合わせた run.start が承認を経ずに正本を上書きできる
        // (ADR-0017)。
        await deps.store.save("history", key, JSON.stringify(snapshot));
      } finally {
        // close の失敗で元のエラーを握り潰さない。finally 内で reject すると
        // try 内の例外が置き換わり、本当の失敗理由が消える。
        await session.close().catch(() => undefined);
      }
    },
  };
}

export {
  authoritativeWriterOf,
  draftStoreOf,
  parseStoreKey,
  type AuthoritativeWriter,
  type DraftStore,
  type StoreKey,
  type StorePort,
  type StoreSpace,
} from "./store.js";
export { contentRevision, type Revision } from "./revision.js";
export {
  createApprovalQueue,
  type ApprovalQueue,
  type ApprovalRequest,
  type ApprovalResult,
} from "./approval.js";
export {
  expectationCandidates,
  recordClick,
  startRecording,
  stopRecording,
  type ClickInput,
  type ForwardInput,
  type RecordClickInput,
  type RecordedAction,
  type RecordedClick,
  type RecordedExpectation,
  type RecordedObservation,
  type RecordedStep,
  type RecordingDraft,
  type RecordingSession,
  type SelectExpectations,
  type StopRecordingInput,
  type StopRecordingOutcome,
} from "./recording.js";

export {
  createViewportControl,
  type AuthProfilesView,
  type ViewportControl,
} from "./viewport/control.js";
export { type AuthProfileStore } from "./viewport/auth-profiles.js";
export {
  createAllowedOrigins,
  parseOrigin,
  OriginError,
  type AllowedOrigins,
  type OriginsConfigPort,
} from "./viewport/origins.js";
export {
  createRunSession,
  type RunSession,
  type RunSessionOptions,
  type ViewportSnapshot,
} from "./viewport/run-session.js";
export type { RunState, StreamMode } from "./viewport/run-state.js";
export {
  createViewport,
  isValidViewport,
  type PickedElement,
  type Viewport,
  type ViewportOptions,
  type ViewportSubscription,
} from "./viewport/session.js";
export { stateKeyOf } from "./viewport/state-key.js";

/**
 * interface 層 (api / web) へ型を中継する。
 *
 * interface は core / domain へ直接依存できない (context/architecture.md)。
 * 表示や応答に要る型は app が窓口になる。**値は中継しない。**
 */
export type {
  BoundingBox,
  ConsoleMessage,
  EvaluationPhase,
  ExecutionEvent,
  ObservedElement,
  SemanticLocator,
  StepResult,
  TerminalRunStatus,
  ViewportSize,
} from "@screen-contract/core-execution";
export type { ElementDef } from "@screen-contract/core-element";
export type { ElementId } from "@screen-contract/domain";
