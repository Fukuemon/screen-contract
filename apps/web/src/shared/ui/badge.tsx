import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "./cn.js";

const badge = cva(
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        muted: "bg-elevated text-muted",
        accent: "bg-accent/15 text-accent",
        danger: "bg-danger/15 text-danger",
        warn: "bg-warn/15 text-warn",
        info: "bg-info/15 text-info",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export interface BadgeProps extends VariantProps<typeof badge> {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * 状態の表示。
 *
 * **色だけで意味を伝えない。** 必ず文字を伴わせる (色覚特性で読めなくなる)。
 */
export function Badge({ tone, children, className }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}
