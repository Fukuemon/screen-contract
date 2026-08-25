import { Circle, MousePointerClick, Square, TriangleAlert } from "lucide-react";
import type { RecordedStepView } from "../../shared/api/client.js";
import { Badge } from "../../shared/ui/badge.js";
import { Button } from "../../shared/ui/button.js";
import { EmptyState, Panel } from "../../shared/ui/panel.js";
import { rejectUiAction, type UiAction, type UiRejection, type UiState } from "./mode.js";

/**
 * モード切替と記録の描画 (presentation)。
 *
 * **記録中であることを常時表示する。** 黙って記録しない (web-editor feature)。
 */

const REJECTION_TEXT: Readonly<Record<UiRejection, string>> = {
  "not-paused": "一時停止中だけ操作モードへ切り替えられます。「接続」を押してください。",
  "not-operate-mode": "記録は操作モードの中で始めます。",
  "already-recording": "すでに記録中です。",
  "not-recording": "記録していません。",
};

interface PickedView {
  readonly locator: { readonly role: string; readonly name: string };
  readonly unique: boolean;
  readonly matches: number;
}

export interface RecordingViewProps {
  readonly ui: UiState;
  readonly paused: boolean;
  readonly steps: readonly RecordedStepView[];
  readonly picked: PickedView | undefined;
  readonly onUi: (action: UiAction) => void;
}

export function RecordingView(props: RecordingViewProps) {
  const context = { paused: props.paused };
  const reject = (action: UiAction): UiRejection | undefined =>
    rejectUiAction(props.ui, action, context);
  const blocked = reject({ kind: "start-recording" });

  return (
    <>
      <Panel title="モード" className="shrink-0 border-b border-line/40">
        <div className="flex flex-col gap-2 p-3">
          <div className="flex gap-1.5" role="group" aria-label="モード">
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
          <p className="text-xs leading-relaxed text-muted">
            {props.ui.mode === "operate"
              ? "クリックが対象ページへ届きます。記録中なら手順として残ります。"
              : "クリックした要素の Locator を調べます。対象ページへは届きません。"}
          </p>

          {/* 選択した要素は座標ではなく Locator で示す。座標は viewport を
              変えると意味を失うが、role+name は解決できる (ADR-0026)。 */}
          {props.picked !== undefined && (
            <div className="flex flex-col gap-1 rounded-md border border-line/60 bg-elevated p-2">
              <div className="flex items-center gap-1.5 text-xs">
                <MousePointerClick className="size-3.5 text-muted" aria-hidden />
                <span className="font-mono">{props.picked.locator.role}</span>
                <span className="truncate text-muted">{props.picked.locator.name}</span>
              </div>
              {props.picked.unique ? (
                <Badge tone="accent">一意に解決できます</Badge>
              ) : (
                <Badge tone="warn">
                  同じ role と名前が {props.picked.matches} 件あり、記録に使えません
                </Badge>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="記録"
        className="shrink-0 border-b border-line/40"
        action={
          <Badge tone={props.ui.recording ? "danger" : "muted"}>
            {props.ui.recording ? (
              <>
                <Circle className="size-2.5 animate-pulse fill-current" aria-hidden />
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
              disabled={blocked !== undefined}
              onClick={() => props.onUi({ kind: "start-recording" })}
            >
              <Circle className="size-3 fill-current" aria-hidden />
              記録を開始
            </Button>
            <Button
              disabled={reject({ kind: "stop-recording" }) !== undefined}
              onClick={() => props.onUi({ kind: "stop-recording" })}
            >
              <Square className="size-3 fill-current" aria-hidden />
              停止
            </Button>
          </div>
          {blocked !== undefined && !props.ui.recording && (
            <p className="text-xs text-muted">{REJECTION_TEXT[blocked]}</p>
          )}
        </div>
      </Panel>

      <Panel title="記録した手順" className="min-h-40 flex-1 border-b border-line/40">
        {props.steps.length === 0 ? (
          <EmptyState>
            記録を開始してから対象ページをクリックすると、ここに手順が積まれます。
          </EmptyState>
        ) : (
          <ol className="divide-y divide-line/30">
            {props.steps.map((step, index) => (
              <li key={index} className="flex flex-col gap-1 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted tabular-nums">{index + 1}</span>
                  <code className="min-w-0 flex-1 truncate text-xs">
                    {step.action.kind === "click"
                      ? `click ${step.action.ref}`
                      : `clickPoint ${String(step.action.x)}, ${String(step.action.y)}`}
                  </code>
                  {step.action.kind === "clickPoint" && (
                    <Badge tone="warn">
                      <TriangleAlert className="size-3" aria-hidden />
                      未解決
                    </Badge>
                  )}
                </div>
                {step.expect.length === 0 ? (
                  <p className="text-xs text-warn">
                    期待状態がありません。再生のたびに実行されます。
                  </p>
                ) : (
                  <p className="text-xs text-muted">期待状態 {step.expect.length} 件</p>
                )}
                {step.warning !== undefined && <p className="text-xs text-warn">{step.warning}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
