import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Circle, ClipboardCheck, Monitor } from "lucide-react";
import { AuthView } from "../components/features/auth/auth-view.js";
import { BadgesView } from "../components/features/badges/badges-view.js";
import { EditorHeader } from "../components/features/editor/editor-header.js";
import { useEditor } from "../components/features/editor/use-editor.js";
import { LogPanel } from "../components/features/logs/log-panel.js";
import { RecordingView } from "../components/features/recording/recording-view.js";
import { TargetList } from "../components/features/targets/target-list.js";
import { ViewportView } from "../components/features/viewport/viewport-view.js";
import { SidebarItem, SidebarSection } from "../components/shared/sidebar/sidebar.js";
import { panelId, tabId } from "../components/ui/tab-ids.js";
import { Tabs } from "../components/ui/tabs.js";
import { isValidViewport, VIEWPORT_PRESETS } from "../entities/target.js";

export const Route = createFileRoute("/")({ component: EditorRoute });

type PanelId = "badges" | "record" | "auth" | "logs";

/** エディタ画面。状態と通信は `useEditor` に集め、ここは組み立てだけを行う。 */
function EditorRoute() {
  const editor = useEditor();
  const [panel, setPanel] = useState<PanelId>("badges");
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);

  const { connected, origin, snapshot, viewport } = editor;
  const needsAllow = origin !== undefined && !editor.origins.includes(origin);

  return (
    <div className="flex h-dvh">
      <nav aria-label="サイドバー" className="flex w-64 shrink-0 flex-col border-r border-line/40">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/40 px-3">
          <span className="text-sm font-semibold">screen-contract</span>
        </div>

        <TargetList origins={editor.origins} current={origin} onSelect={editor.selectTarget} />

        <SidebarSection title="画面サイズ">
          {VIEWPORT_PRESETS.map((preset) => (
            <SidebarItem
              key={preset.id}
              selected={size?.width === preset.width && size.height === preset.height}
              onClick={() => {
                // 対象へ渡す前に寸法を検める。桁外れは実行基盤側で失敗する。
                if (!isValidViewport(preset)) {
                  return;
                }
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
        <EditorHeader
          connected={connected}
          busy={editor.busy}
          url={editor.url}
          needsAllow={needsAllow}
          onUrlChange={editor.setUrl}
          onConnect={() => viewport.run((api) => api.startRun(editor.url))}
          onDisconnect={() => viewport.run((api) => api.stopRun())}
          onNavigate={() => editor.navigateTo(editor.url)}
          onAllow={() => {
            if (origin !== undefined) {
              viewport.addOrigin(origin);
            }
          }}
        />

        <div className="flex min-h-0 flex-1">
          <ViewportView
            frame={editor.frame}
            forwards={editor.forwards}
            mode={editor.mode}
            canOperate={editor.connected}
            elements={editor.elements}
            badges={snapshot?.badges ?? []}
            definitions={snapshot?.newElements ?? []}
            picked={viewport.picked}
            pickFailed={viewport.pickFailed}
            onModeChange={(next) => editor.onUi({ kind: "set-mode", mode: next })}
            onPageInput={editor.sendInput}
            onPick={(point) => viewport.pick(point)}
            onSize={setSize}
            overlay={editor.overlay}
            onOverlayChange={(next) => {
              editor.setOverlay(next);
              if (next) {
                editor.refreshElements();
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
                  badge: editor.recording ? (
                    <Circle className="size-2 animate-pulse fill-danger text-danger" aria-hidden />
                  ) : undefined,
                },
                { id: "auth", label: "ログイン", count: editor.auth.profiles.length },
                { id: "logs", label: "ログ", count: editor.messages.length },
              ]}
            />
            <div
              id={panelId(panel)}
              role="tabpanel"
              aria-labelledby={tabId(panel)}
              tabIndex={0}
              className="min-h-0 flex-1 overflow-auto border-t border-line/40"
            >
              {panel === "badges" && (
                <BadgesView
                  badges={snapshot?.badges ?? []}
                  elements={snapshot?.newElements ?? []}
                  stateUrl={snapshot?.stateUrl ?? ""}
                  picked={viewport.picked?.locator}
                  onAdd={(locator) => viewport.run((api) => api.addBadge(locator))}
                  onRemove={(id) => viewport.run((api) => api.removeBadge(id))}
                  onMove={(id, to) => viewport.run((api) => api.moveBadge(id, to))}
                />
              )}
              {panel === "record" && (
                <RecordingView
                  ui={{ mode: editor.mode, recording: editor.recording }}
                  paused={editor.connected}
                  steps={snapshot?.steps ?? []}
                  elements={snapshot?.newElements ?? []}
                  onUi={editor.onUi}
                  onClear={editor.clearSteps}
                />
              )}
              {panel === "auth" && (
                <AuthView
                  profiles={editor.auth.profiles}
                  active={editor.auth.active}
                  canSave={connected}
                  onSave={(name) => editor.auth.save(name)}
                  onUse={(name) => editor.auth.use(name)}
                  onRemove={(name) => editor.auth.remove(name)}
                />
              )}
              {panel === "logs" && (
                <LogPanel
                  messages={editor.messages}
                  onRefresh={editor.refreshLogs}
                  onClear={editor.clearLogs}
                />
              )}
            </div>
          </aside>
        </div>

        {/* **黙って進まない。** 入ったつもりで未ログインの画面を撮ると、その
            差分が仕様の変更として記録される (ADR-0022)。 */}
        {(snapshot?.warnings ?? []).map((warning) => (
          <p
            key={warning}
            role="status"
            className="shrink-0 border-t border-warn/50 bg-warn/10 px-4 py-2 text-sm text-warn"
          >
            {warning}
          </p>
        ))}

        {editor.error !== undefined && (
          <p
            role="alert"
            className="shrink-0 border-t border-danger/50 bg-danger/10 px-4 py-2 text-sm text-danger-fg"
          >
            {editor.error}
          </p>
        )}
      </div>
    </div>
  );
}
