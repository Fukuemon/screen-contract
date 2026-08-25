import { Circle, Square, TriangleAlert } from "lucide-react";
import type { RecordedStepView } from "../../shared/api/client.js";
import { Badge } from "../../shared/ui/badge.js";
import { Button } from "../../shared/ui/button.js";
import { EmptyState } from "../../shared/ui/panel.js";
import { rejectUiAction, type UiAction, type UiRejection, type UiState } from "./mode.js";

const REJECTION_TEXT: Readonly<Record<UiRejection, string>> = {
  "not-paused": "「接続」してから記録できます。",
  "not-operate-mode": "操作モードにすると記録できます。",
  "already-recording": "すでに記録中です。",
  "not-recording": "記録していません。",
};

export interface RecordingViewProps {
  readonly ui: UiState;
  readonly paused: boolean;
  readonly steps: readonly RecordedStepView[];
  readonly onUi: (action: UiAction) => void;
}

/** 記録の操作と、記録した手順の一覧。 */
export function RecordingView(props: RecordingViewProps) {
  const context = { paused: props.paused };
  const blocked = rejectUiAction(props.ui, { kind: "start-recording" }, context);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {props.ui.recording ? (
            <Button tone="danger" onClick={() => props.onUi({ kind: "stop-recording" })}>
              <Square className="size-3 fill-current" aria-hidden />
              記録を停止
            </Button>
          ) : (
            <Button
              tone="danger"
              disabled={blocked !== undefined}
              onClick={() => props.onUi({ kind: "start-recording" })}
            >
              <Circle className="size-3 fill-current" aria-hidden />
              記録を開始
            </Button>
          )}
          {props.ui.recording && (
            <Badge tone="danger">
              <Circle className="size-2 animate-pulse fill-current" aria-hidden />
              記録中
            </Badge>
          )}
        </div>
        {blocked !== undefined && !props.ui.recording && (
          <p className="text-xs text-muted">{REJECTION_TEXT[blocked]}</p>
        )}
      </div>

      {props.steps.length === 0 ? (
        <EmptyState>記録を開始して対象ページをクリックすると、手順がここに積まれます。</EmptyState>
      ) : (
        <ol className="min-h-0 flex-1 overflow-auto">
          {props.steps.map((step, index) => (
            <li key={step.id} className="flex flex-col gap-0.5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted tabular-nums">{index + 1}</span>
                <code className="min-w-0 flex-1 truncate text-xs">
                  {step.action.kind === "click"
                    ? step.action.ref
                    : `座標 ${String(step.action.x)}, ${String(step.action.y)}`}
                </code>
                {step.action.kind === "clickPoint" && (
                  <Badge tone="warn">
                    <TriangleAlert className="size-3" aria-hidden />
                    未解決
                  </Badge>
                )}
              </div>
              {step.expect.length === 0 && <p className="pl-6 text-xs text-muted">期待状態なし</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
