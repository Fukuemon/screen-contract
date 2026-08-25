import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Hand, MousePointerClick } from "lucide-react";
import { cn } from "../../shared/ui/cn.js";
import { mouseInput, toViewportPoint, type MouseEventType, type Point } from "./input.js";

/**
 * live viewport の描画 (presentation)。
 *
 * **状態も通信も持たない。** 判断は `mode.ts` の純粋関数にあり、通信は
 * container が行う。
 *
 * **選択モードのクリックは対象ページへ届けない。** 要素選択の座標 query で
 * あり、実ページ操作ではない (web-editor feature)。
 */

export interface ViewportViewProps {
  readonly frame: string | undefined;
  /** 対象ページへ入力を届けてよいか。判定は `forwardsToPage` が持つ。 */
  readonly forwards: boolean;
  readonly onPageInput: (input: ReturnType<typeof mouseInput>) => void;
  readonly onPick: (point: Point) => void;
  /** 表示の縮尺。等倍でないときは利用者へ伝える。 */
  readonly onSize?: ((size: { width: number; height: number }) => void) | undefined;
}

export function ViewportView(props: ViewportViewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);
  const [scale, setScale] = useState(1);

  const pointOf = useCallback((event: ReactMouseEvent): Point | undefined => {
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
      if (!props.forwards) {
        // 選択モードでは座標 query として扱い、対象ページへは送らない。
        if (eventType === "mousePressed") {
          props.onPick(point);
        }
        return;
      }
      props.onPageInput(mouseInput(eventType, point, event.button, event));
    },
    [pointOf, props],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line/40 px-3 text-xs text-muted">
        {props.forwards ? (
          <Hand className="size-4" aria-hidden />
        ) : (
          <MousePointerClick className="size-4" aria-hidden />
        )}
        <span>
          {props.forwards
            ? "クリックが対象ページへ届きます"
            : "クリックした要素の Locator を調べます"}
        </span>
        {size !== undefined && (
          <span className="ml-auto font-mono tabular-nums">
            {size.width} × {size.height}
            {scale < 0.99 && <span className="ml-1.5">({Math.round(scale * 100)}%)</span>}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {props.frame === undefined ? (
          <p className="max-w-sm text-center text-sm text-muted">
            「接続」を押すと対象アプリを開き、ここに映像が出ます。
          </p>
        ) : (
          <img
            ref={imageRef}
            src={props.frame}
            alt="対象アプリの画面"
            draggable={false}
            className={cn(
              "max-h-full max-w-full rounded border border-line/60 shadow-lg select-none",
              props.forwards ? "cursor-crosshair" : "cursor-pointer",
            )}
            onMouseDown={(event) => send(event, "mousePressed")}
            onMouseUp={(event) => send(event, "mouseReleased")}
            onMouseMove={(event) => {
              if (props.forwards) {
                send(event, "mouseMoved");
              }
            }}
            onLoad={(event) => {
              const image = event.currentTarget;
              const next = { width: image.naturalWidth, height: image.naturalHeight };
              setSize(next);
              // 等倍でないことを伝える。伝えないと、座標がずれて見えたときに
              // 縮尺のせいか実装のせいかを切り分けられない。
              setScale(image.getBoundingClientRect().width / image.naturalWidth);
              props.onSize?.(next);
            }}
            onContextMenu={(event) => event.preventDefault()}
          />
        )}
      </div>
    </div>
  );
}
