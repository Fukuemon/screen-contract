import type { ObservedElementView } from "../../../gateways/workflow-server.js";
import { cn } from "../../../lib/cn.js";

export interface ElementOverlayProps {
  readonly elements: readonly ObservedElementView[];
  /** viewport の論理サイズ。box は同じ座標系で来る。 */
  readonly size: { readonly width: number; readonly height: number };
  /** 選択中の要素。`role` と `name` が一致するものを強調する。 */
  readonly picked: { readonly role: string; readonly name: string } | undefined;
}

/**
 * 観測できる要素の枠と番号。
 *
 * `--annotate` が返す box をそのまま描く。テキストノードは返らないため、
 * 段落や地の文には枠が出ない。
 */
export function ElementOverlay(props: ElementOverlayProps) {
  return (
    <svg
      viewBox={`0 0 ${String(props.size.width)} ${String(props.size.height)}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      {props.elements.map((element, index) => {
        const selected = props.picked?.role === element.role && props.picked.name === element.name;
        return (
          <g key={`${element.role}-${element.name}-${String(index)}`}>
            <rect
              x={element.box.x}
              y={element.box.y}
              width={element.box.width}
              height={element.box.height}
              className={cn("fill-transparent", selected ? "stroke-accent" : "stroke-info/50")}
              strokeWidth={selected ? 3 : 1.5}
            />
            <rect
              x={element.box.x}
              y={Math.max(0, element.box.y - 18)}
              width={22}
              height={18}
              className={selected ? "fill-accent" : "fill-info/80"}
            />
            <text
              x={element.box.x + 11}
              y={Math.max(0, element.box.y - 18) + 13}
              textAnchor="middle"
              className="fill-bg text-[12px] font-bold"
            >
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
