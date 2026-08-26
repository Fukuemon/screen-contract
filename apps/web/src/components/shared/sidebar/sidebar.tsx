import type { ReactNode } from "react";
import { cn } from "../../../lib/cn.js";

export interface SidebarSectionProps {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}

/** サイドバーの区画。見出しと中身の境界を 1 箇所で決める。 */
export function SidebarSection(props: SidebarSectionProps) {
  return (
    <section aria-label={props.title} className="border-b border-line/40">
      <header className="flex h-8 items-center justify-between gap-2 px-3">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {props.title}
        </h2>
        {props.action}
      </header>
      <div className="pb-2">{props.children}</div>
    </section>
  );
}

export interface SidebarItemProps {
  readonly selected?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly trailing?: ReactNode;
}

/** サイドバーの 1 行。現在地を色と印の両方で示す。 */
export function SidebarItem(props: SidebarItemProps) {
  return (
    <div className="flex items-center gap-1 px-2">
      <button
        type="button"
        onClick={props.onClick}
        aria-current={props.selected === true ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-2 py-1.5",
          "text-left text-xs transition-colors duration-150 hover:bg-elevated",
          props.selected === true && "bg-elevated text-accent",
        )}
      >
        {props.children}
      </button>
      {props.trailing}
    </div>
  );
}
