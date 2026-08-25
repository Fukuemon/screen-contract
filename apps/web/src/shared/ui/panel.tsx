import type { ReactNode } from "react";
import { cn } from "./cn.js";

export interface PanelProps {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/** 情報パネル。見出しと中身の境界を 1 箇所で決める。 */
export function Panel({ title, action, children, className }: PanelProps) {
  return (
    <section className={cn("flex min-h-0 flex-col", className)} aria-label={title}>
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line/40 px-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** 中身が空のときの案内。**何をすれば埋まるか**まで書く。 */
export function EmptyState({ children }: { readonly children: ReactNode }) {
  return <p className="px-3 py-4 text-sm text-muted">{children}</p>;
}
