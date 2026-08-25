import { Circle, Play, Plug, Square } from "lucide-react";
import type { ExecutionEvent, RecordedStep } from "@screen-contract/api";
import type { mouseInput } from "../state/input.js";
import { rejectUiAction, type UiAction, type UiRejection, type UiState } from "../state/mode.js";
import type { ViewerState } from "../state/viewer.js";
import { Badge } from "./parts/badge.js";
import { Button } from "./parts/button.js";
import { Panel } from "./parts/panel.js";
import { ViewportPanel } from "./viewport-panel.js";

/**
 * エディタ画面。
 *
 * **web はドメインロジックを持たない。** 判断は `state/` の純粋関数にあり、
 * ここは描画と入力の受け渡しだけを行う (context/architecture.md)。
 */

/** 語彙が増えたら型エラーで気付く。拒否したのに何も出ない状態を作らない。 */
const REJECTION_TEXT: Readonly<Record<UiRejection, string>> = {
  "not-paused": "一時停止中だけ操作モードへ切り替えられます。",
  "not-operate-mode": "記録は操作モードの中で始めます。",
  "already-recording": "すでに記録中です。",
  "not-recording": "記録していません。",
};

const STEP_TONE = {
  pending: "muted",
  running: "accent",
  skipped: "muted",
  executed: "ok",
  failed: "danger",
} as const;

const STEP_LABEL = {
  pending: "未実行",
  running: "実行中",
  skipped: "満たしていたので省略",
  executed: "実行",
  failed: "失敗",
} as const;

export interface EditorScreenProps {
  readonly frame: string | undefined;
  readonly ui: UiState;
  readonly viewer: ViewerState;
  readonly rejection: UiRejection | undefined;
  readonly connected: boolean;
  readonly entryUrl: string;
  readonly steps: readonly RecordedStep[];
  readonly events: readonly ExecutionEvent[];
  readonly error: string | undefined;
  readonly onConnect: () => void;
  readonly onResume: () => void;
  readonly onUi: (action: UiAction) => void;
  readonly onPageInput: (input: ReturnType<typeof mouseInput>) => void;
  /** 選択モードでクリックした座標。要素選択そのものは skeleton の範囲外。 */
  readonly onPick: (point: { readonly x: number; readonly y: number }) => void;
  readonly picked: { readonly x: number; readonly y: number } | undefined;
}

export function EditorScreen(props: EditorScreenProps) {
  const reject = (action: UiAction): UiRejection | undefined =>
    rejectUiAction(props.ui, action, props.viewer);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">screen-contract</span>
          <span className="text-xs text-muted">画面を操作して仕様書を書く</span>
        </div>

        <code className="ml-4 truncate rounded bg-panel px-2 py-1 text-xs text-muted">
          {props.entryUrl}
        </code>

        <div className="ml-auto flex items-center gap-2">
          <Badge tone={props.viewer.paused ? "accent" : props.connected ? "ok" : "muted"}>
            {props.viewer.paused ? "一時停止中" : props.connected ? "再生中" : "未接続"}
          </Badge>
          <Button tone="primary" onClick={props.onConnect} disabled={props.connected}>
            <Plug className="size-3.5" />
            接続
          </Button>
          <Button onClick={props.onResume} disabled={!props.viewer.paused}>
            <Play className="size-3.5" />
            再開
          </Button>
        </div>
      </header>

      {/* 何をするアプリかを最初に示す。触り方が分からないまま止まらせない。 */}
      {!props.connected && (
        <p className="shrink-0 border-b border-line bg-accent/5 px-4 py-2 text-xs text-muted">
          <strong className="text-ink">使い方</strong>: 「接続」で対象アプリを開く →
          「操作モード」へ切り替える → 「記録を開始」して画面を操作する →
          記録した手順を承認すると、画面仕様書の正本になります。
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <ViewportPanel
          frame={props.frame}
          ui={props.ui}
          viewer={props.viewer}
          onPageInput={props.onPageInput}
          onPick={props.onPick}
        />

        <aside className="flex w-90 shrink-0 flex-col border-l border-line">
          <Panel title="モード" className="shrink-0">
            <div className="flex flex-col gap-2 p-3">
              <div className="flex gap-1.5">
                <Button
                  pressed={props.ui.mode === "operate"}
                  disabled={reject({ kind: "set-mode", mode: "operate" }) !== undefined}
                  onClick={() => props.onUi({ kind: "set-mode", mode: "operate" })}
                >
                  操作モード
                </Button>
                <Button
                  pressed={props.ui.mode === "view"}
                  disabled={reject({ kind: "set-mode", mode: "view" }) !== undefined}
                  onClick={() => props.onUi({ kind: "set-mode", mode: "view" })}
                >
                  選択モード
                </Button>
              </div>
              <p className="text-xs text-muted">
                {props.ui.mode === "operate"
                  ? "クリックが対象ページへ届きます。記録中なら手順として残ります。"
                  : "クリックは要素の選択に使い、対象ページへは届きません。"}
              </p>
              {props.picked !== undefined && (
                <p className="text-xs text-muted tabular-nums">
                  選択した座標: {props.picked.x}, {props.picked.y}
                </p>
              )}
            </div>
          </Panel>

          <Panel
            title="記録"
            className="shrink-0 border-t"
            action={
              /* **記録中であることを常時表示する。** 黙って記録しない。 */
              <Badge tone={props.ui.recording ? "danger" : "muted"}>
                {props.ui.recording ? (
                  <>
                    <Circle className="size-2.5 fill-current" />
                    記録中
                  </>
                ) : (
                  "停止中"
                )}
              </Badge>
            }
          >
            <div className="flex flex-col gap-2 p-3">
              <div className="flex gap-1.5">
                <Button
                  tone="danger"
                  disabled={reject({ kind: "start-recording" }) !== undefined}
                  onClick={() => props.onUi({ kind: "start-recording" })}
                >
                  <Circle className="size-3 fill-current" />
                  記録を開始
                </Button>
                <Button
                  disabled={reject({ kind: "stop-recording" }) !== undefined}
                  onClick={() => props.onUi({ kind: "stop-recording" })}
                >
                  <Square className="size-3 fill-current" />
                  停止
                </Button>
              </div>
              {props.rejection !== undefined && (
                <p role="alert" className="text-xs text-danger">
                  {REJECTION_TEXT[props.rejection]}
                </p>
              )}
            </div>
          </Panel>

          <Panel title="記録した手順" className="min-h-0 flex-1 border-t">
            {props.steps.length === 0 ? (
              <p className="p-3 text-xs text-muted">まだ記録していません。</p>
            ) : (
              <ol className="divide-y divide-line">
                {props.steps.map((step, index) => (
                  <li key={index} className="flex flex-col gap-1 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted tabular-nums">{index + 1}</span>
                      <code className="text-xs">
                        {step.action.kind === "click"
                          ? `click ${step.action.ref}`
                          : `clickPoint ${String(step.action.x)}, ${String(step.action.y)}`}
                      </code>
                      {step.action.kind === "clickPoint" && <Badge tone="danger">未解決</Badge>}
                    </div>
                    {step.expect.length === 0 ? (
                      <p className="text-[11px] text-danger">
                        期待状態がありません。再生のたびに実行されます。
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted">期待状態 {step.expect.length} 件</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="実行" className="max-h-56 shrink-0 border-t">
            {props.viewer.steps.length === 0 ? (
              <p className="p-3 text-xs text-muted">まだ実行していません。</p>
            ) : (
              <ol className="divide-y divide-line">
                {props.viewer.steps.map((step, index) => (
                  <li key={index} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs text-muted tabular-nums">{index + 1}</span>
                    <Badge tone={STEP_TONE[step]}>{STEP_LABEL[step]}</Badge>
                  </li>
                ))}
              </ol>
            )}
            {props.viewer.failureReason !== undefined && (
              <p role="alert" className="px-3 pb-3 text-xs text-danger">
                {props.viewer.failureReason}
              </p>
            )}
          </Panel>
        </aside>
      </div>

      {props.error !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-t border-line bg-danger/10 px-4 py-2 text-xs text-danger"
        >
          {props.error}
        </p>
      )}
    </div>
  );
}
