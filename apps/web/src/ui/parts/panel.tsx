import type { ReactNode } from "react";
import { cn } from "./cn.js";

export interface PanelProps {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/** 右側の情報パネル。見出しと中身の境界を 1 箇所で決める。 */
export function Panel({ title, action, children, className }: PanelProps) {
  return (
    <section className={cn("flex min-h-0 flex-col border-line", className)} aria-label={title}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}
