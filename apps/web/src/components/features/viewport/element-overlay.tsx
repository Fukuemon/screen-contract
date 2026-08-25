import type { ElementDefView, ObservedElementView } from "../../../gateways/workflow-server.js";
import { cn } from "../../../lib/cn.js";

/** バッジの寸法。番号が 2 桁でも収まる幅を取る。 */
const BADGE_WIDTH = 22;
const BADGE_HEIGHT = 18;

export interface ElementOverlayProps {
  readonly elements: readonly ObservedElementView[];
  /** viewport の論理サイズ。box は同じ座標系で来る。 */
  readonly size: { readonly width: number; readonly height: number };
  readonly picked: { readonly role: string; readonly name: string } | undefined;
  /** 構成番号順の要素 ID。番号を描くのはここに載る要素だけ (ADR-0005)。 */
  readonly badges: readonly string[];
  readonly definitions: readonly ElementDefView[];
}

/**
 * 観測できる要素の枠と、構成番号のバッジ。
 *
 * `--annotate` が返す box をそのまま描く。テキストノードは返らないため、
 * 段落や地の文には枠が出ない。
 */
export function ElementOverlay(props: ElementOverlayProps) {
  const numberOf = new Map(
    props.badges.map((id, index) => {
      const definition = props.definitions.find((element) => element.id === id);
      return [
        `${definition?.locator.role ?? ""}\u0000${definition?.locator.name ?? ""}`,
        index + 1,
      ];
    }),
  );

  return (
    <svg
      viewBox={`0 0 ${String(props.size.width)} ${String(props.size.height)}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      {props.elements.map((element) => {
        const selected = props.picked?.role === element.role && props.picked.name === element.name;
        const badge = numberOf.get(`${element.role}\u0000${element.name}`);
        return (
          <g key={`${element.role}\u0000${element.name}`}>
            <rect
              x={element.box.x}
              y={element.box.y}
              width={element.box.width}
              height={element.box.height}
              className={cn("fill-transparent", selected ? "stroke-accent" : "stroke-info/50")}
              strokeWidth={selected ? 3 : 1.5}
            />
            {badge !== undefined && (
              <>
                <rect
                  x={element.box.x}
                  y={Math.max(0, element.box.y - BADGE_HEIGHT)}
                  width={BADGE_WIDTH}
                  height={BADGE_HEIGHT}
                  className="fill-accent"
                />
                <text
                  x={element.box.x + BADGE_WIDTH / 2}
                  y={Math.max(0, element.box.y - BADGE_HEIGHT) + BADGE_HEIGHT - 5}
                  textAnchor="middle"
                  className="fill-bg text-[12px] font-bold"
                >
                  {badge}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
