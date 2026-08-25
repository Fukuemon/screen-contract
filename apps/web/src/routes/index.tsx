import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { AuthView } from "../features/auth/auth-view.js";
import type { UiAction } from "../features/recording/mode.js";
import { RecordingView } from "../features/recording/recording-view.js";
import { TargetBar } from "../features/viewport/target-bar.js";
import { useWorkflowServer } from "../features/viewport/use-workflow-server.js";
import { ViewportView } from "../features/viewport/viewport-view.js";
import { forwardsToPage } from "../features/recording/mode.js";
import { reduceViewerAll } from "../features/viewport/viewer.js";
import { Badge } from "../shared/ui/badge.js";
import { Panel } from "../shared/ui/panel.js";

export const Route = createFileRoute("/")({ component: EditorRoute });

const STEP_TONE = {
  pending: "muted",
  running: "info",
  skipped: "muted",
  executed: "accent",
  failed: "danger",
} as const;

const STEP_LABEL = {
  pending: "未実行",
  running: "実行中",
  skipped: "満たしていたので省略",
  executed: "実行",
  failed: "失敗",
} as const;

/**
 * エディタ画面 (container)。
 *
 * **状態と通信をここに集め、描画は view へ委ねる。** 判断は feature の純粋
 * 関数にあり、この層は繋ぐだけである。
 */
function EditorRoute() {
  const server = useWorkflowServer();
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);

  const snapshot = server.snapshot;
  const status = snapshot?.status ?? "idle";
  const paused = status === "paused";
  const ui = { mode: snapshot?.mode ?? "view", recording: snapshot?.recording ?? false } as const;
  const viewer = snapshot === undefined ? undefined : reduceViewerAll(snapshot.events);

  const onUi = useCallback(
    (action: UiAction) => {
      switch (action.kind) {
        case "set-mode":
          server.run((api) => api.setMode(action.mode));
          return;
        case "start-recording":
          server.run((api) => api.setRecording(true));
          return;
        case "stop-recording":
          server.run((api) => api.setRecording(false));
      }
    },
    [server],
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line/40 px-4">
        <span className="text-sm font-semibold">screen-contract</span>
        <span className="text-xs text-muted">画面を操作して仕様書を書く</span>
        <Link
          to="/approvals"
          className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line/60 bg-elevated px-3 text-sm transition-colors duration-150 hover:bg-line/40"
        >
          <ClipboardCheck className="size-4" aria-hidden />
          承認
        </Link>
      </header>

      {status === "idle" && (
        <p className="shrink-0 border-b border-line/40 bg-accent/5 px-4 py-2 text-sm leading-relaxed text-muted">
          <strong className="text-ink">使い方</strong>: 「接続」で対象アプリを開く →
          「操作モード」へ切り替える → 「記録を開始」して画面を操作する →
          記録した手順を承認すると、画面仕様書の正本になります。
        </p>
      )}

      <TargetBar
        origins={server.origins}
        currentUrl={snapshot?.entryUrl ?? ""}
        status={status}
        viewportSize={size}
        onOpen={(url) => server.run((api) => api.navigate(url))}
        onConnect={() => server.run((api) => api.startRun())}
        onResume={() => server.run((api) => api.resumeRun())}
        onViewport={(next) => {
          setSize(next);
          server.run((api) => api.setViewport(next));
        }}
      />

      <div className="flex min-h-0 flex-1">
        <ViewportView
          frame={server.frame}
          forwards={forwardsToPage(ui, { paused })}
          onPageInput={(input) => server.sendInput(input)}
          onPick={(point) => server.pick(point)}
          onSize={setSize}
        />

        <aside className="flex w-96 shrink-0 flex-col border-l border-line/40">
          <RecordingView
            ui={ui}
            paused={paused}
            steps={snapshot?.steps ?? []}
            picked={
              server.picked === undefined
                ? undefined
                : {
                    locator: server.picked.locator,
                    unique: server.picked.unique,
                    matches: server.picked.matches,
                  }
            }
            onUi={onUi}
          />

          <AuthView
            profiles={server.profiles}
            active={server.activeProfile}
            canSave={status !== "idle"}
            onSave={(name) =>
              server.call(async (api) => {
                server.setProfiles(await api.saveAuthProfile(name));
              })
            }
            onUse={(name) =>
              server.call(async (api) => {
                await api.useAuthProfile(name);
                server.setActiveProfile(name);
              })
            }
            onRemove={(name) =>
              server.call(async (api) => {
                server.setProfiles(await api.removeAuthProfile(name));
                if (server.activeProfile === name) {
                  server.setActiveProfile(undefined);
                }
              })
            }
          />

          <Panel title="実行" className="max-h-48 shrink-0 overflow-auto">
            {viewer === undefined || viewer.steps.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">まだ実行していません。</p>
            ) : (
              <ol className="divide-y divide-line/30">
                {viewer.steps.map((step, index) => (
                  <li key={index} className="flex items-center gap-2 px-3 py-2">
                    <span className="font-mono text-xs text-muted tabular-nums">{index + 1}</span>
                    <Badge tone={STEP_TONE[step]}>{STEP_LABEL[step]}</Badge>
                  </li>
                ))}
              </ol>
            )}
            {viewer?.failureReason !== undefined && (
              <p role="alert" className="px-3 pb-3 text-xs text-danger">
                {viewer.failureReason}
              </p>
            )}
          </Panel>
        </aside>
      </div>

      {server.error !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-t border-line/40 bg-danger/10 px-4 py-2 text-sm text-danger"
        >
          {server.error}
        </p>
      )}
    </div>
  );
}
