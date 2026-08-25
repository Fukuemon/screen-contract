import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ClipboardCheck, Circle } from "lucide-react";
import { AuthView } from "../features/auth/auth-view.js";
import { useAuthProfiles } from "../features/auth/use-auth-profiles.js";
import { forwardsToPage, rejectUiAction, type UiAction } from "../features/recording/mode.js";
import { RecordingView } from "../features/recording/recording-view.js";
import { AddressBar } from "../features/viewport/address-bar.js";
import { useStream } from "../features/viewport/use-stream.js";
import { useViewportRun } from "../features/viewport/use-viewport-run.js";
import { VIEWPORT_PRESETS } from "../features/viewport/target.js";
import { ViewportView } from "../features/viewport/viewport-view.js";
import { useApiClient } from "../shared/api/use-api-client.js";
import { Badge } from "../shared/ui/badge.js";
import { Tabs } from "../shared/ui/tabs.js";

export const Route = createFileRoute("/")({ component: EditorRoute });

type PanelId = "record" | "auth" | "run";

const STEP_LABEL = {
  pending: "未実行",
  running: "実行中",
  skipped: "省略",
  executed: "実行",
  failed: "失敗",
} as const;

const STEP_TONE = {
  pending: "muted",
  running: "info",
  skipped: "muted",
  executed: "accent",
  failed: "danger",
} as const;

/** エディタ画面。状態と通信をここに集め、描画は view へ委ねる。 */
function EditorRoute() {
  const { client, error: clientError } = useApiClient();
  const viewport = useViewportRun(client);
  const stream = useStream("current");
  const auth = useAuthProfiles(client);
  const [panel, setPanel] = useState<PanelId>("record");
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);

  const snapshot = viewport.snapshot;
  const status = snapshot?.status ?? "idle";
  const paused = status === "paused";
  const ui = { mode: snapshot?.mode ?? "view", recording: snapshot?.recording ?? false } as const;
  const error = clientError ?? viewport.error ?? stream.error ?? auth.error;

  const mode = ui.mode;
  const recording = ui.recording;
  const dispatch = viewport.run;
  const onUi = useCallback(
    (action: UiAction) => {
      // 判定の正本は core の純粋関数にある。
      if (rejectUiAction({ mode, recording }, action, { paused }) !== undefined) {
        return;
      }
      switch (action.kind) {
        case "set-mode":
          dispatch((api) => api.setMode(action.mode));
          return;
        case "start-recording":
          dispatch((api) => api.setRecording(true));
          return;
        case "stop-recording":
          dispatch((api) => api.setRecording(false));
      }
    },
    [dispatch, mode, paused, recording],
  );

  const preset = VIEWPORT_PRESETS.find(
    (candidate) => candidate.width === size?.width && candidate.height === size.height,
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line/40 px-4">
        <span className="text-sm font-semibold">screen-contract</span>
        <span className="text-xs text-muted">画面を操作して仕様書を書く</span>
        <Link
          to="/approvals"
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-elevated hover:text-ink"
        >
          <ClipboardCheck className="size-4" aria-hidden />
          承認
        </Link>
      </header>

      <AddressBar
        origins={viewport.origins}
        currentUrl={snapshot?.entryUrl ?? ""}
        status={status}
        viewportLabel={preset?.label ?? (size === undefined ? "画面サイズ" : `${size.width}px`)}
        onOpen={(url) => viewport.run((api) => api.navigate(url))}
        onAddOrigin={viewport.addOrigin}
        onConnect={() => viewport.run((api) => api.startRun())}
        onResume={() => viewport.run((api) => api.resumeRun())}
        onViewport={(next) => {
          setSize(next);
          viewport.run((api) => api.setViewport(next));
        }}
      />

      <div className="flex min-h-0 flex-1">
        <ViewportView
          frame={stream.frame}
          forwards={forwardsToPage(ui, { paused })}
          mode={ui.mode}
          canOperate={paused}
          picked={viewport.picked}
          onModeChange={(mode) => onUi({ kind: "set-mode", mode })}
          onPageInput={(input) => stream.sendInput(input)}
          onPick={(point) => viewport.pick(point)}
          onSize={setSize}
        />

        <aside className="flex w-80 shrink-0 flex-col border-l border-line/40">
          <Tabs
            label="パネル"
            active={panel}
            onChange={setPanel}
            items={[
              {
                id: "record",
                label: "記録",
                count: snapshot?.steps.length,
                badge: ui.recording ? (
                  <Circle className="size-2 animate-pulse fill-danger text-danger" aria-hidden />
                ) : undefined,
              },
              { id: "auth", label: "ログイン", count: auth.profiles.length },
              { id: "run", label: "実行" },
            ]}
          />

          <div className="min-h-0 flex-1 overflow-auto border-t border-line/40">
            {panel === "record" && (
              <RecordingView ui={ui} paused={paused} steps={snapshot?.steps ?? []} onUi={onUi} />
            )}
            {panel === "auth" && (
              <AuthView
                profiles={auth.profiles}
                active={auth.active}
                canSave={status !== "idle"}
                onSave={auth.save}
                onUse={auth.use}
                onRemove={auth.remove}
              />
            )}
            {panel === "run" && (
              <ol className="py-1">
                {(snapshot?.events ?? []).length === 0 ? (
                  <li className="px-3 py-4 text-sm text-muted">まだ実行していません。</li>
                ) : (
                  (snapshot?.steps ?? []).map((step, index) => (
                    <li key={step.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="font-mono text-xs text-muted tabular-nums">{index + 1}</span>
                      <Badge tone={STEP_TONE.executed}>{STEP_LABEL.executed}</Badge>
                    </li>
                  ))
                )}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {error !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-t border-line/40 bg-danger/10 px-4 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
