import { useState } from "react";
import { Monitor, Play, Plug, RefreshCw } from "lucide-react";
import { Badge } from "../../shared/ui/badge.js";
import { Button } from "../../shared/ui/button.js";
import { buildTargetUrl, VIEWPORT_PRESETS, type TargetRejection } from "./target.js";

/**
 * 対象と viewport の切り替え (presentation)。
 *
 * **origin は列挙したものから選ぶ。** 実行してよい origin をプロダクト設定で
 * 列挙する規則は変えない (ADR-0017)。
 */

const REJECTION_TEXT: Readonly<Record<TargetRejection, string>> = {
  "unknown-origin": "実行してよい対象として列挙されていません。",
  "bad-path": "パスを解釈できません。",
  "empty-origin": "対象を選んでください。",
};

export interface TargetBarProps {
  readonly origins: readonly string[];
  readonly currentUrl: string;
  readonly status: "idle" | "paused" | "completed" | "failed";
  readonly viewportSize: { readonly width: number; readonly height: number } | undefined;
  readonly onOpen: (url: string) => void;
  readonly onConnect: () => void;
  readonly onResume: () => void;
  readonly onViewport: (size: { readonly width: number; readonly height: number }) => void;
}

const STATUS: Readonly<
  Record<
    TargetBarProps["status"],
    { readonly label: string; readonly tone: "muted" | "accent" | "info" | "danger" }
  >
> = {
  idle: { label: "未接続", tone: "muted" },
  paused: { label: "一時停止中", tone: "accent" },
  completed: { label: "再生中", tone: "info" },
  failed: { label: "失敗", tone: "danger" },
};

export function TargetBar(props: TargetBarProps) {
  const [origin, setOrigin] = useState(props.origins[0] ?? "");
  const [path, setPath] = useState("/");
  const [rejection, setRejection] = useState<TargetRejection | undefined>(undefined);
  const status = STATUS[props.status];

  function open(): void {
    const result = buildTargetUrl({ origin, path }, props.origins);
    if ("rejection" in result) {
      setRejection(result.rejection);
      return;
    }
    setRejection(undefined);
    props.onOpen(result.url);
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-line/40 px-4 py-2">
      <div className="flex items-center gap-2">
        {/* ラベルを見える形で置く。placeholder だけだと入力後に何の欄か分からない。 */}
        <label htmlFor="target-origin" className="text-xs text-muted">
          対象
        </label>
        <select
          id="target-origin"
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          className="h-8 cursor-pointer rounded-md border border-line/60 bg-elevated px-2 font-mono text-xs text-ink"
        >
          {props.origins.length === 0 && <option value="">(列挙がありません)</option>}
          {props.origins.map((allowed) => (
            <option key={allowed} value={allowed}>
              {allowed}
            </option>
          ))}
        </select>

        <label htmlFor="target-path" className="sr-only">
          パス
        </label>
        <input
          id="target-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              open();
            }
          }}
          className="h-8 flex-1 rounded-md border border-line/60 bg-elevated px-2 font-mono text-xs text-ink"
        />

        <Button onClick={open} disabled={props.status === "idle"}>
          開く
        </Button>

        <div className="ml-2 flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Button tone="primary" onClick={props.onConnect} disabled={props.status !== "idle"}>
            <Plug className="size-4" aria-hidden />
            接続
          </Button>
          <Button onClick={props.onResume} disabled={props.status !== "paused"}>
            <Play className="size-4" aria-hidden />
            再開
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Monitor className="size-4 text-muted" aria-hidden />
        <span className="text-xs text-muted">画面サイズ</span>
        <div className="flex gap-1" role="group" aria-label="画面サイズ">
          {VIEWPORT_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              pressed={
                props.viewportSize?.width === preset.width &&
                props.viewportSize.height === preset.height
              }
              disabled={props.status === "idle"}
              onClick={() => props.onViewport(preset)}
            >
              {preset.label}
              <span className="font-mono text-[11px] text-muted">{preset.width}</span>
            </Button>
          ))}
        </div>
        <Button
          tone="ghost"
          size="icon"
          aria-label="開き直す"
          disabled={props.status === "idle"}
          onClick={() => props.onOpen(props.currentUrl)}
        >
          <RefreshCw className="size-4" aria-hidden />
        </Button>
      </div>

      {rejection !== undefined && (
        <p role="alert" className="text-xs text-danger">
          {REJECTION_TEXT[rejection]}
        </p>
      )}
    </div>
  );
}
