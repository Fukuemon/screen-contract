import { useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import { panelId, tabId } from "./tab-ids.js";

/**
 * タブ。
 *
 * **一度に見せるものを 1 つに絞る** ための部品である。並べて全部出すと、
 * どこを見ればよいか判断できなくなる (progressive disclosure)。
 *
 * `role="tablist"` を名乗ると、読み上げは矢印キーで移動できることと、Tab 1 回で
 * パネルへ抜けられることを前提に案内する。**名乗る以上は実装する。** 名乗って
 * いるのに効かないと、案内された操作が空振りする。
 */

interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  /** 件数などの補足。0 のときは出さない (無い情報を数字で埋めない)。 */
  readonly count?: number | undefined;
  readonly badge?: ReactNode;
}

export interface TabsProps<T extends string> {
  readonly items: readonly TabItem<T>[];
  readonly active: T;
  readonly onChange: (id: T) => void;
  readonly label: string;
}

export function Tabs<T extends string>(props: TabsProps<T>) {
  const list = useRef<HTMLDivElement | null>(null);

  /** 矢印キーで移動する。移動先へフォーカスも移す。 */
  const move = (from: number, delta: number): void => {
    const { items, onChange } = props;
    const next = items[(from + delta + items.length) % items.length];
    if (next === undefined) {
      return;
    }
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#${tabId(next.id)}`)?.focus();
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={props.label}
      className="flex h-10 shrink-0 items-stretch"
    >
      {props.items.map((item, index) => {
        const selected = item.id === props.active;
        return (
          <button
            key={item.id}
            id={tabId(item.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(item.id)}
            // **選択中だけ Tab 順に入れる (roving tabindex)。** 全部入れると、
            // パネルへ着くまでにタブの数だけ Tab を押すことになる。
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => {
              const delta =
                event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : undefined;
              if (delta !== undefined) {
                event.preventDefault();
                move(index, delta);
              }
            }}
            onClick={() => props.onChange(item.id)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 border-b-2 px-3 text-sm transition-colors duration-150",
              // **現在地を色だけで示さない。** 下線でも示す。
              selected ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className="font-mono text-xs text-muted tabular-nums">{item.count}</span>
            )}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}
