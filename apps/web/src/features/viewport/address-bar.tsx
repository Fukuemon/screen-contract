import { useState } from "react";
import { Monitor, Play, Plug, Plus, RotateCw } from "lucide-react";
import { Button } from "../../shared/ui/button.js";
import { Menu, MenuItem } from "../../shared/ui/menu.js";
import { VIEWPORT_PRESETS } from "./target.js";

/**
 * アドレスバー (presentation)。
 *
 * **URL は自由に入力できる。** 列挙外の origin を入れたときは「対象へ追加」を
 * 促す — 列挙という安全装置は残しつつ、手で設定ファイルを編集させない
 * (ADR-0017)。
 *
 * 画面サイズはメニューへ畳む。常時並べると、画面の情報量が判断の邪魔になる。
 */

type RunStatus = "idle" | "paused" | "completed" | "failed";

export interface AddressBarProps {
  readonly origins: readonly string[];
  readonly currentUrl: string;
  readonly status: RunStatus;
  readonly viewportLabel: string;
  readonly onOpen: (url: string) => void;
  readonly onAddOrigin: (origin: string) => void;
  readonly onConnect: () => void;
  readonly onResume: () => void;
  readonly onViewport: (size: { readonly width: number; readonly height: number }) => void;
}

/** 入力から origin を取り出す。取り出せなければ undefined。 */
function originOf(raw: string): string | undefined {
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

export function AddressBar(props: AddressBarProps) {
  // 編集を始めるまでは server の値をそのまま出す。state へコピーすると、
  // 非同期で届いた値が画面へ出ない。
  const [edited, setEdited] = useState<string | undefined>(undefined);
  const value = edited ?? props.currentUrl;
  const setValue = setEdited;

  const origin = originOf(value);
  const needsAdd = origin !== undefined && !props.origins.includes(origin);
  const connected = props.status !== "idle";

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line/40 px-3">
      <Button
        tone={connected ? "default" : "primary"}
        onClick={connected ? props.onResume : props.onConnect}
        disabled={connected && props.status !== "paused"}
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

      <Button
        tone="ghost"
        size="icon"
        aria-label="開き直す"
        disabled={!connected}
        onClick={() => props.onOpen(value)}
      >
        <RotateCw className="size-4" aria-hidden />
      </Button>

      <label htmlFor="address" className="sr-only">
        対象の URL
      </label>
      <input
        id="address"
        value={value}
        list="allowed-origins"
        spellCheck={false}
        placeholder="http://127.0.0.1:5174/"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !needsAdd) {
            props.onOpen(value);
          }
        }}
        className="h-8 min-w-0 flex-1 rounded-md border border-line/60 bg-elevated px-2.5 font-mono text-xs text-ink placeholder:text-muted"
      />
      <datalist id="allowed-origins">
        {props.origins.map((allowed) => (
          <option key={allowed} value={`${allowed}/`} />
        ))}
      </datalist>

      {needsAdd ? (
        <Button tone="primary" onClick={() => props.onAddOrigin(origin)}>
          <Plus className="size-4" aria-hidden />
          この対象を許可
        </Button>
      ) : (
        <Button disabled={!connected} onClick={() => props.onOpen(value)}>
          開く
        </Button>
      )}

      <Menu label="画面サイズ" value={props.viewportLabel} disabled={!connected}>
        {(close) => (
          <>
            {VIEWPORT_PRESETS.map((preset) => (
              <MenuItem
                key={preset.id}
                onClick={() => {
                  props.onViewport(preset);
                  close();
                }}
              >
                <Monitor className="size-3.5 text-muted" aria-hidden />
                <span className="flex-1">{preset.label}</span>
                <span className="font-mono text-muted">
                  {preset.width}×{preset.height}
                </span>
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </div>
  );
}
