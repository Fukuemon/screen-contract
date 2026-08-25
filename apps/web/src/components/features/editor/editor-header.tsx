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
  /** 応答待ちか。接続はブラウザの起動を伴い数秒かかる。 */
  readonly busy: boolean;
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
        <Button disabled={props.busy} onClick={props.onDisconnect}>
          <PlugZap className="size-4" aria-hidden />
          切断
        </Button>
      ) : (
        // **応答待ちを出す。** 出さないと「押したのに何も起きない」と読まれ、
        // もう一度押される。接続はブラウザの起動を伴い数秒かかる。
        <Button tone="primary" disabled={props.busy} onClick={props.onConnect}>
          <Plug className="size-4" aria-hidden />
          {props.busy ? "接続しています…" : "接続"}
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
          if (event.key === "Enter" && !props.needsAllow && props.connected) {
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
        // 未接続で押すと server の失敗メッセージが出る。先に接続を促す。
        <Button
          aria-disabled={!props.connected}
          title={props.connected ? undefined : "接続すると移動できます"}
          className={props.connected ? "" : "cursor-not-allowed opacity-40"}
          onClick={() => {
            if (props.connected) {
              props.onNavigate();
            }
          }}
        >
          移動
        </Button>
      )}

      {/* **run の内部語彙 (`paused`) を出さない。** 正常に繋がった状態を
          「一時停止中」と読ませると、色 (緑) と文字が矛盾する。 */}
      <Badge tone={props.connected ? "accent" : "muted"}>
        <span role="status" aria-atomic="true">
          {props.busy ? "接続しています…" : props.connected ? "接続中 — 操作できます" : "未接続"}
        </span>
      </Badge>
    </header>
  );
}
