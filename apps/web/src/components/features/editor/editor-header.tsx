import { Plug, PlugZap, Plus } from "lucide-react";
import { Badge } from "../../ui/badge.js";
import { Button } from "../../ui/button.js";

/**
 * 対象の接続と移動。
 *
 * **接続の反対は「切断」であり「再開」ではない。** run を終端まで走らせると
 * `paused` を離れ、操作モードと記録がどちらも使えなくなる (ADR-0002)。戻る
 * 経路を持たないと、そこで行き止まりになる。
 */
export interface EditorHeaderProps {
  readonly connected: boolean;
  readonly paused: boolean;
  readonly url: string;
  /** 列挙外の origin を指しているか。指していれば移動の代わりに許可を促す。 */
  readonly needsAllow: boolean;
  readonly onUrlChange: (url: string) => void;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onNavigate: () => void;
  readonly onAllow: () => void;
}

export function EditorHeader(props: EditorHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line/40 px-3">
      {props.connected ? (
        <Button onClick={props.onDisconnect}>
          <PlugZap className="size-4" aria-hidden />
          切断
        </Button>
      ) : (
        <Button tone="primary" onClick={props.onConnect}>
          <Plug className="size-4" aria-hidden />
          接続
        </Button>
      )}

      <label htmlFor="address" className="sr-only">
        対象の URL
      </label>
      <input
        id="address"
        value={props.url}
        spellCheck={false}
        placeholder="http://127.0.0.1:5174/"
        onChange={(event) => props.onUrlChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !props.needsAllow) {
            props.onNavigate();
          }
        }}
        className="h-8 min-w-0 flex-1 rounded-md border border-line/60 bg-elevated px-2.5 font-mono text-xs text-ink placeholder:text-muted"
      />

      {props.needsAllow ? (
        <Button tone="primary" onClick={props.onAllow}>
          <Plus className="size-4" aria-hidden />
          この対象を許可
        </Button>
      ) : (
        <Button onClick={props.onNavigate}>移動</Button>
      )}

      <Badge tone={props.paused ? "accent" : props.connected ? "info" : "muted"}>
        {props.paused ? "一時停止中" : props.connected ? "実行中" : "未接続"}
      </Badge>
    </header>
  );
}
