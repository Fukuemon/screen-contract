import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "./cn.js";

const badge = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        muted: "bg-line/50 text-muted",
        ok: "bg-ok/15 text-ok",
        danger: "bg-danger/15 text-danger",
        accent: "bg-accent/15 text-accent",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export interface BadgeProps extends VariantProps<typeof badge> {
  readonly children: ReactNode;
  readonly className?: string;
}

export function Badge({ tone, children, className }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}
