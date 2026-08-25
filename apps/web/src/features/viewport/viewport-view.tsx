import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Hand, MousePointerClick } from "lucide-react";
import type { PickedElementView } from "../../shared/api/client.js";
import { Badge } from "../../shared/ui/badge.js";
import { Button } from "../../shared/ui/button.js";
import { cn } from "../../shared/ui/cn.js";
import { mouseInput, toViewportPoint, type MouseEventType, type Point } from "./input.js";

export interface ViewportViewProps {
  readonly frame: string | undefined;
  /** 対象ページへ入力を届けてよいか。判定は `forwardsToPage` が持つ。 */
  readonly forwards: boolean;
  readonly mode: "view" | "operate";
  readonly canOperate: boolean;
  readonly picked: PickedElementView | undefined;
  readonly onModeChange: (mode: "view" | "operate") => void;
  readonly onPageInput: (input: ReturnType<typeof mouseInput>) => void;
  readonly onPick: (point: Point) => void;
  readonly onSize: (size: { width: number; height: number }) => void;
}

/**
 * live viewport。
 *
 * 選択モードのクリックは要素選択の座標 query であり、対象ページへ届けない
 * (web-editor feature)。
 */
export function ViewportView(props: ViewportViewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);

  const pointOf = useCallback((event: ReactMouseEvent): Point | undefined => {
    const image = imageRef.current;
    // 論理サイズは画像の実寸から取る。別経路だと表示中の画像と食い違う。
    if (image === null || image.naturalWidth === 0) {
      return undefined;
    }
    return toViewportPoint({ x: event.clientX, y: event.clientY }, image.getBoundingClientRect(), {
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  }, []);

  const { forwards, onPick, onPageInput } = props;
  const send = useCallback(
    (event: ReactMouseEvent, eventType: MouseEventType) => {
      const point = pointOf(event);
      if (point === undefined) {
        return;
      }
      if (!forwards) {
        if (eventType === "mousePressed") {
          onPick(point);
        }
        return;
      }
      onPageInput(mouseInput(eventType, point, event.button, event));
    },
    [forwards, onPageInput, onPick, pointOf],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line/40 px-3">
        <div className="flex gap-1" role="group" aria-label="モード">
          <Button
            pressed={props.mode === "view"}
            onClick={() => props.onModeChange("view")}
            aria-label="選択モード"
          >
            <MousePointerClick className="size-3.5" aria-hidden />
            選択
          </Button>
          <Button
            pressed={props.mode === "operate"}
            disabled={!props.canOperate}
            onClick={() => props.onModeChange("operate")}
            aria-label="操作モード"
          >
            <Hand className="size-3.5" aria-hidden />
            操作
          </Button>
        </div>

        {/* 選択した要素は座標ではなく Locator で示す (ADR-0026)。 */}
        {props.picked !== undefined && !props.forwards && (
          <div className="ml-2 flex min-w-0 items-center gap-1.5 text-xs">
            <code className="text-accent">{props.picked.locator.role}</code>
            <span className="truncate text-muted">{props.picked.locator.name}</span>
            {!props.picked.unique && <Badge tone="warn">{props.picked.matches} 件で曖昧</Badge>}
          </div>
        )}

        {scale < 0.99 && (
          <span className="ml-auto font-mono text-xs text-muted tabular-nums">
            {Math.round(scale * 100)}%
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-bg p-6">
        {props.frame === undefined ? (
          <p className="max-w-xs text-center text-sm leading-relaxed text-muted">
            「接続」を押すと対象アプリを開き、ここに映像が出ます。
          </p>
        ) : (
          // 画像そのものではなく button で受ける。キーボードからも辿れる。
          <button
            type="button"
            aria-label={forwards ? "対象ページを操作する" : "要素を選択する"}
            className={cn(
              "max-h-full max-w-full rounded border border-line/60 shadow-2xl",
              forwards ? "cursor-crosshair" : "cursor-pointer",
            )}
            onMouseDown={(event) => send(event, "mousePressed")}
            onMouseUp={(event) => send(event, "mouseReleased")}
            onMouseMove={(event) => {
              if (forwards) {
                send(event, "mouseMoved");
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <img
              ref={imageRef}
              src={props.frame}
              alt="対象アプリの画面"
              draggable={false}
              className="max-h-full max-w-full select-none"
              onLoad={(event) => {
                const image = event.currentTarget;
                setScale(image.getBoundingClientRect().width / image.naturalWidth);
                props.onSize({ width: image.naturalWidth, height: image.naturalHeight });
              }}
            />
          </button>
        )}
      </div>
    </div>
  );
}
