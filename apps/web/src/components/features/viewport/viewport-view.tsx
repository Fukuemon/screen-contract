import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Grid3x3, Hand, MousePointerClick } from "lucide-react";
import type {
  ElementDefView,
  ObservedElementView,
  PickedElementView,
} from "../../../gateways/workflow-server.js";
import {
  keyInput,
  pointerInput,
  scrollInput,
  toViewportPoint,
  type Point,
  type PointerPhase,
} from "../../../entities/input.js";
import type { PageInput } from "@screen-contract/api";
import { Badge } from "../../ui/badge.js";
import { Button } from "../../ui/button.js";
import { cn } from "../../../lib/cn.js";
import { ElementOverlay } from "./element-overlay.js";

export interface ViewportViewProps {
  readonly frame: string | undefined;
  /** 対象ページへ入力を届けてよいか。判定は `forwardsToPage` が持つ。 */
  readonly forwards: boolean;
  readonly mode: "view" | "operate";
  readonly canOperate: boolean;
  readonly elements: readonly ObservedElementView[];
  readonly badges: readonly string[];
  readonly definitions: readonly ElementDefView[];
  readonly picked: PickedElementView | undefined;
  readonly pickFailed: boolean;
  readonly onModeChange: (mode: "view" | "operate") => void;
  readonly onPageInput: (input: PageInput) => void;
  readonly onPick: (point: Point) => void;
  readonly onSize: (size: { width: number; height: number }) => void;
  readonly overlay: boolean;
  readonly onOverlayChange: (overlay: boolean) => void;
}

/**
 * live viewport。
 *
 * 選択モードのクリックは要素選択の座標 query であり、対象ページへ届けない
 * (web-editor feature)。
 */
export function ViewportView(props: ViewportViewProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  /**
   * ホイールを購読する枠。
   *
   * **ref ではなく state で持つ。** 映像が届くまでこの要素は存在せず、ref だと
   * 生えたことを effect が知らない。購読が張られないまま「たまにスクロール
   * できない」になる。
   */
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);

  const pointOf = useCallback((event: { clientX: number; clientY: number }): Point | undefined => {
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
    (event: ReactMouseEvent, phase: PointerPhase) => {
      const point = pointOf(event);
      if (point === undefined) {
        return;
      }
      if (!forwards) {
        if (phase === "down") {
          onPick(point);
        }
        return;
      }
      onPageInput(pointerInput(phase, point, event.button, event));
    },
    [forwards, onPageInput, onPick, pointOf],
  );

  // React の onWheel は passive で付くため preventDefault が効かず、外側の
  // スクロール領域が先に持っていく。非 passive で直接購読する。
  useEffect(() => {
    if (frame === null) {
      return undefined;
    }
    const onWheel = (event: WheelEvent): void => {
      const point = pointOf(event);
      if (point === undefined) {
        return;
      }
      event.preventDefault();
      onPageInput(scrollInput(point, { deltaX: event.deltaX, deltaY: event.deltaY }, event));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [frame, onPageInput, pointOf]);

  /**
   * キー入力を対象ページへ送る。
   *
   * **window で拾う。** 対象ページは映像であり、こちらの DOM には入力先が無い。
   * viewport がフォーカスを持っていても、キーは何にも入らない。
   *
   * 転送しない状態では拾わない。拾うと、画面側のショートカットまで奪う。
   */
  useEffect(() => {
    if (frame === null || !forwards) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      // URL 欄など、画面側の入力中は奪わない。
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        return;
      }
      const input = keyInput(event);
      if (input === undefined) {
        return;
      }
      // Tab と Enter は画面側の既定動作を持つ。対象へ送る以上は止める。
      event.preventDefault();
      onPageInput(input);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [forwards, frame, onPageInput]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line/40 px-3">
        <div className="flex gap-1" role="group" aria-label="モード">
          <Button pressed={props.mode === "view"} onClick={() => props.onModeChange("view")}>
            <MousePointerClick className="size-3.5" aria-hidden />
            選択
          </Button>
          <Button
            pressed={props.mode === "operate"}
            // **理由を結び付ける。** `disabled` はフォーカス順から外れるため、
            // 押せない理由がどこからも読めない。
            aria-disabled={!props.canOperate}
            title={props.canOperate ? undefined : "接続すると操作モードに入れます"}
            className={props.canOperate ? "" : "cursor-not-allowed opacity-40"}
            onClick={() => {
              if (props.canOperate) {
                props.onModeChange("operate");
              }
            }}
          >
            <Hand className="size-3.5" aria-hidden />
            操作
          </Button>
        </div>

        {/* 枠と番号は選択の手掛かりである。操作モードでは対象ページの上に
            重なるだけで邪魔になるため出さない。 */}
        <Button
          pressed={props.overlay}
          disabled={props.mode === "operate"}
          title={props.mode === "operate" ? "選択モードで表示できます" : undefined}
          onClick={() => props.onOverlayChange(!props.overlay)}
        >
          <Grid3x3 className="size-3.5" aria-hidden />
          要素の枠
        </Button>

        {/* 選択した要素は座標ではなく Locator で示す (ADR-0026)。 */}
        {props.mode === "view" && props.picked !== undefined && (
          <div className="ml-1 flex min-w-0 items-center gap-1.5 text-xs">
            <code className="shrink-0 text-accent">{props.picked.locator.role}</code>
            <span className="truncate text-muted">{props.picked.locator.name}</span>
            {!props.picked.unique && <Badge tone="warn">{props.picked.matches} 件で曖昧</Badge>}
          </div>
        )}
        {props.mode === "view" && props.pickFailed && (
          <span className="ml-1 text-xs text-muted">
            この位置に選択できる要素がありません (地の文は選べません)
          </span>
        )}

        {/* 選択の結果は非同期に返る。目で追っていない利用者へも届ける。 */}
        <p role="status" aria-atomic="true" className="sr-only">
          {props.picked !== undefined
            ? `${props.picked.locator.role} ${props.picked.locator.name} を選択しました${
                props.picked.unique ? "" : ` (${String(props.picked.matches)} 件に一致し、曖昧です)`
              }`
            : props.pickFailed
              ? "この位置に選択できる要素がありません"
              : ""}
        </p>

        {scale < 0.99 && (
          <span className="ml-auto shrink-0 font-mono text-xs text-muted tabular-nums">
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
          <div ref={setFrame} className="relative max-h-full max-w-full">
            {/*
              **`<button>` を名乗らない。** 座標を指す操作はキーボードで代替でき
              ないため、Tab で止まるのに Enter で何も起きない要素になる。フォーカス
              できるのに何も起きないより、ポインタ専用だと明示して代替を案内する。
              番号付けは右の「構成番号」パネルから完結する。
            */}
            <div
              role="application"
              aria-roledescription={forwards ? "対象ページの操作領域" : "要素の選択領域"}
              aria-describedby="viewport-hint"
              className={cn(
                "block rounded border border-line/60 shadow-2xl",
                forwards ? "cursor-crosshair" : "cursor-pointer",
              )}
              onMouseDown={(event) => send(event, "down")}
              onMouseUp={(event) => send(event, "up")}
              onMouseMove={(event) => {
                if (forwards) {
                  send(event, "move");
                }
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <img
                ref={imageRef}
                src={props.frame}
                alt="対象アプリの画面"
                draggable={false}
                className="block max-h-full max-w-full select-none"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  const next = { width: image.naturalWidth, height: image.naturalHeight };
                  setScale(image.getBoundingClientRect().width / image.naturalWidth);
                  setSize(next);
                  props.onSize(next);
                }}
              />
            </div>
            <p id="viewport-hint" className="sr-only">
              この領域はマウス操作専用です。要素の選択と番号の並べ替えは、右の
              「構成番号」パネルから行えます。
            </p>
            {props.overlay && props.mode === "view" && size !== undefined && (
              <ElementOverlay
                elements={props.elements}
                size={size}
                picked={props.picked?.locator}
                badges={props.badges}
                definitions={props.definitions}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
