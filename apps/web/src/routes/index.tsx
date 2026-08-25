import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Circle, ClipboardCheck, Monitor, Play, Plug, Plus } from "lucide-react";
import { AuthView } from "../components/features/auth/auth-view.js";
import { BadgesView } from "../components/features/badges/badges-view.js";
import { LogPanel, type ConsoleMessage } from "../components/features/logs/log-panel.js";
import { RecordingView } from "../components/features/recording/recording-view.js";
import { ViewportView } from "../components/features/viewport/viewport-view.js";
import { SidebarItem, SidebarSection } from "../components/shared/sidebar/sidebar.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Tabs } from "../components/ui/tabs.js";
import { forwardsToPage, rejectUiAction, type UiAction } from "../entities/mode.js";
import { VIEWPORT_PRESETS } from "../entities/target.js";
import { useAuthProfiles } from "../gateways/use-auth-profiles.js";
import { useStream } from "../gateways/use-stream.js";
import { useViewportRun } from "../gateways/use-viewport-run.js";
import { useWorkflowServer } from "../gateways/use-workflow-server.js";
import type { ObservedElementView } from "../gateways/workflow-server.js";

export const Route = createFileRoute("/")({ component: EditorRoute });

type PanelId = "badges" | "record" | "auth" | "logs";

/** エディタ画面。状態と通信をここに集め、描画は view へ委ねる。 */
function EditorRoute() {
  const { client, error: clientError } = useWorkflowServer();
  const viewport = useViewportRun(client);
  const stream = useStream("current");
  const auth = useAuthProfiles(client);

  const [panel, setPanel] = useState<PanelId>("badges");
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const [draftUrl, setDraftUrl] = useState<string | undefined>(undefined);
  const [elements, setElements] = useState<readonly ObservedElementView[]>([]);
  const [messages, setMessages] = useState<readonly ConsoleMessage[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const snapshot = viewport.snapshot;
  const status = snapshot?.status ?? "idle";
  const paused = status === "paused";
  const connected = status !== "idle";
  const mode = snapshot?.mode ?? "view";
  const recording = snapshot?.recording ?? false;
  const url = draftUrl ?? snapshot?.entryUrl ?? "";
  const shownError = error ?? clientError ?? viewport.error ?? stream.error ?? auth.error;

  const [overlay, setOverlay] = useState(false);

  /**
   * 枠に使う要素を取り直す。
   *
   * **フレームごとに取り直さない。** 取得は `--annotate` の CLI 呼び出しで
   * 1 回 70ms ほどかかり、フレームは連続で届く。取得が積み上がって遅れ、
   * 失敗すると一覧が消える。
   */
  const refreshElements = useCallback(() => {
    if (client === undefined) {
      return;
    }
    void client
      .observeElements()
      .then(setElements)
      .catch((cause: Error) => setError(cause.message));
  }, [client]);

  useEffect(() => {
    if (overlay && connected) {
      refreshElements();
    }
  }, [connected, overlay, refreshElements]);

  const refreshLogs = useCallback(() => {
    if (client === undefined) {
      return;
    }
    void client
      .consoleMessages()
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [client]);

  const dispatch = viewport.run;
  const onUi = useCallback(
    (action: UiAction) => {
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

  const origin = originOf(url);
  const needsAllow = origin !== undefined && !viewport.origins.includes(origin);

  return (
    <div className="flex h-dvh">
      <nav aria-label="サイドバー" className="flex w-64 shrink-0 flex-col border-r border-line/40">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/40 px-3">
          <span className="text-sm font-semibold">screen-contract</span>
        </div>

        <SidebarSection title="対象">
          {viewport.origins.length === 0 ? (
            <p className="px-3 text-xs text-muted">まだ登録がありません。</p>
          ) : (
            viewport.origins.map((allowed) => (
              <SidebarItem
                key={allowed}
                selected={origin === allowed}
                onClick={() => setDraftUrl(`${allowed}/`)}
              >
                <span className="truncate font-mono">{allowed.replace(/^https?:\/\//, "")}</span>
              </SidebarItem>
            ))
          )}
        </SidebarSection>

        <SidebarSection title="画面サイズ">
          {VIEWPORT_PRESETS.map((preset) => (
            <SidebarItem
              key={preset.id}
              selected={size?.width === preset.width && size.height === preset.height}
              onClick={() => {
                setSize(preset);
                viewport.run((api) => api.setViewport(preset));
              }}
            >
              <Monitor className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="flex-1">{preset.label}</span>
              <span className="font-mono text-muted">{preset.width}</span>
            </SidebarItem>
          ))}
        </SidebarSection>

        <div className="mt-auto border-t border-line/40 p-2">
          <Link
            to="/approvals"
            className="flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm text-muted transition-colors duration-150 hover:bg-elevated hover:text-ink"
          >
            <ClipboardCheck className="size-4" aria-hidden />
            承認
          </Link>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line/40 px-3">
          <Button
            tone={connected ? "default" : "primary"}
            onClick={() =>
              connected
                ? viewport.run((api) => api.resumeRun())
                : viewport.run((api) => api.startRun())
            }
            disabled={connected && !paused}
          >
            {connected ? (
              <>
                <Play className="size-4" aria-hidden />
                再開
              </>
            ) : (
              <>
                <Plug className="size-4" aria-hidden />
                接続
              </>
            )}
          </Button>

          <label htmlFor="address" className="sr-only">
            対象の URL
          </label>
          <input
            id="address"
            value={url}
            spellCheck={false}
            placeholder="http://127.0.0.1:5174/"
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !needsAllow && connected) {
                viewport.run((api) => api.navigate(url));
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-line/60 bg-elevated px-2.5 font-mono text-xs text-ink placeholder:text-muted"
          />

          {needsAllow ? (
            <Button tone="primary" onClick={() => viewport.addOrigin(origin)}>
              <Plus className="size-4" aria-hidden />
              この対象を許可
            </Button>
          ) : (
            <Button disabled={!connected} onClick={() => viewport.run((api) => api.navigate(url))}>
              移動
            </Button>
          )}

          <Badge tone={paused ? "accent" : connected ? "info" : "muted"}>
            {paused ? "一時停止中" : connected ? "再生中" : "未接続"}
          </Badge>
        </header>

        <div className="flex min-h-0 flex-1">
          <ViewportView
            frame={stream.frame}
            forwards={forwardsToPage({ mode, recording }, { paused })}
            mode={mode}
            canOperate={paused}
            elements={elements}
            badges={snapshot?.badges ?? []}
            definitions={snapshot?.newElements ?? []}
            picked={viewport.picked}
            pickFailed={viewport.pickFailed}
            onModeChange={(next) => onUi({ kind: "set-mode", mode: next })}
            onPageInput={(input) => stream.sendInput(input)}
            onPick={(point) => viewport.pick(point)}
            onSize={setSize}
            overlay={overlay}
            onOverlayChange={(next) => {
              setOverlay(next);
              if (next) {
                refreshElements();
              }
            }}
          />

          <aside className="flex w-80 shrink-0 flex-col border-l border-line/40">
            <Tabs
              label="パネル"
              active={panel}
              onChange={setPanel}
              items={[
                { id: "badges", label: "構成番号", count: snapshot?.badges.length },
                {
                  id: "record",
                  label: "記録",
                  count: snapshot?.steps.length,
                  badge: recording ? (
                    <Circle className="size-2 animate-pulse fill-danger text-danger" aria-hidden />
                  ) : undefined,
                },
                { id: "auth", label: "ログイン", count: auth.profiles.length },
                { id: "logs", label: "ログ", count: messages.length },
              ]}
            />
            <div className="min-h-0 flex-1 overflow-auto border-t border-line/40">
              {panel === "badges" && (
                <BadgesView
                  badges={snapshot?.badges ?? []}
                  elements={snapshot?.newElements ?? []}
                  picked={viewport.picked?.locator}
                  onAdd={(locator) => viewport.run((api) => api.addBadge(locator))}
                  onRemove={(id) => viewport.run((api) => api.removeBadge(id))}
                  onMove={(id, to) => viewport.run((api) => api.moveBadge(id, to))}
                />
              )}
              {panel === "record" && (
                <RecordingView
                  ui={{ mode, recording }}
                  paused={paused}
                  steps={snapshot?.steps ?? []}
                  onUi={onUi}
                />
              )}
              {panel === "auth" && (
                <AuthView
                  profiles={auth.profiles}
                  active={auth.active}
                  canSave={connected}
                  onSave={(name) => auth.save(name)}
                  onUse={(name) => auth.use(name)}
                  onRemove={(name) => auth.remove(name)}
                />
              )}
              {panel === "logs" && (
                <LogPanel
                  messages={messages}
                  onRefresh={refreshLogs}
                  onClear={() => setMessages([])}
                />
              )}
            </div>
          </aside>
        </div>

        {shownError !== undefined && (
          <p
            role="alert"
            className="shrink-0 border-t border-line/40 bg-danger/10 px-4 py-2 text-sm text-danger"
          >
            {shownError}
          </p>
        )}
      </div>
    </div>
  );
}

/** 入力から origin を取り出す。取り出せなければ undefined。 */
function originOf(raw: string): string | undefined {
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}
