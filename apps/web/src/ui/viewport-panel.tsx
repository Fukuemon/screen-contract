import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { MousePointer2, Hand } from "lucide-react";
import { forwardsToPage, type UiState } from "../state/mode.js";
import { mouseInput, toViewportPoint, type MouseEventType } from "../state/input.js";
import type { ViewerState } from "../state/viewer.js";
import { cn } from "./parts/cn.js";

/**
 * live viewport。
 *
 * **選択モードのクリックは対象ページへ届けない。** 要素選択の座標 query で
 * あり、実ページ操作ではない (web-editor feature)。判定は `forwardsToPage` が
 * 持ち、ここは描画と座標の写像だけを行う。
 */

export interface ViewportPanelProps {
  readonly frame: string | undefined;
  readonly ui: UiState;
  readonly viewer: ViewerState;
  readonly onPageInput: (input: ReturnType<typeof mouseInput>) => void;
  readonly onPick: (point: { readonly x: number; readonly y: number }) => void;
}

export function ViewportPanel(props: ViewportPanelProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const forwards = forwardsToPage(props.ui, props.viewer);

  const pointOf = useCallback((event: ReactMouseEvent) => {
    const image = imageRef.current;
    // **viewport の論理サイズは画像の実寸から取る。** 別経路で受け取ると、
    // 表示している画像と食い違う瞬間ができる。
    if (image === null || image.naturalWidth === 0) {
      return undefined;
    }
    return toViewportPoint({ x: event.clientX, y: event.clientY }, image.getBoundingClientRect(), {
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  }, []);

  const send = useCallback(
    (event: ReactMouseEvent, eventType: MouseEventType) => {
      const point = pointOf(event);
      if (point === undefined) {
        return;
      }
      if (!forwards) {
        // 選択モードでは座標 query として扱い、対象ページへは送らない。
        if (eventType === "mousePressed") {
          props.onPick(point);
        }
        return;
      }
      props.onPageInput(mouseInput(eventType, point, event.button, event));
    },
    [forwards, pointOf, props],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs text-muted">
        {forwards ? <Hand className="size-3.5" /> : <MousePointer2 className="size-3.5" />}
        <span>
          {forwards ? "クリックが対象ページへ届きます" : "クリックは要素の選択に使います"}
        </span>
        {size !== undefined && (
          <span className="ml-auto tabular-nums">
            {size.width} × {size.height}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {props.frame === undefined ? (
          <p className="text-sm text-muted">
            「接続」を押すと対象アプリを開き、ここに映像が出ます。
          </p>
        ) : (
          <img
            ref={imageRef}
            src={props.frame}
            alt="対象アプリの画面"
            draggable={false}
            className={cn(
              "max-h-full max-w-full rounded border border-line shadow-sm select-none",
              forwards ? "cursor-crosshair" : "cursor-pointer",
            )}
            onMouseDown={(event) => send(event, "mousePressed")}
            onMouseUp={(event) => send(event, "mouseReleased")}
            onMouseMove={(event) => {
              if (forwards) {
                send(event, "mouseMoved");
              }
            }}
            onLoad={(event) => {
              const image = event.currentTarget;
              setSize({ width: image.naturalWidth, height: image.naturalHeight });
            }}
            onContextMenu={(event) => event.preventDefault()}
          />
        )}
      </div>
    </div>
  );
}
