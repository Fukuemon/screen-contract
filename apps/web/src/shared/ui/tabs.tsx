import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * タブ。
 *
 * **一度に見せるものを 1 つに絞る** ための部品である。並べて全部出すと、
 * どこを見ればよいか判断できなくなる (progressive disclosure)。
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
  return (
    <div role="tablist" aria-label={props.label} className="flex h-10 shrink-0 items-stretch">
      {props.items.map((item) => {
        const selected = item.id === props.active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
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
