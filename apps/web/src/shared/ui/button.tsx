import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn.js";

/**
 * ボタン。
 *
 * **押せる要素には必ず `cursor-pointer` と可視のフォーカスリングを付ける。**
 * 状態の変化は 150ms で繋ぐ — 0ms だと押したことが分からない。
 */
const button = cva(
  [
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border",
    "text-sm font-medium transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-40",
  ],
  {
    variants: {
      tone: {
        default: "border-line/60 bg-elevated text-ink hover:bg-line/40",
        primary: "border-accent bg-accent text-on-accent hover:brightness-110",
        danger: "border-danger bg-danger text-white hover:brightness-110",
        ghost: "border-transparent text-muted hover:bg-elevated hover:text-ink",
      },
      /** 触れる最小の大きさを 44px 相当に保つ。小さくすると押し間違える。 */
      size: { sm: "h-8 px-3", md: "h-11 px-4", icon: "size-8" },
      /** 押した状態を保つトグル。今どちらかを示す。 */
      pressed: { true: "border-accent bg-accent/15 text-accent", false: "" },
    },
    defaultVariants: { tone: "default", size: "sm", pressed: false },
  },
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">, VariantProps<typeof button> {
  readonly className?: string;
}

export function Button({ tone, size, pressed, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cn(button({ tone, size, pressed }), className)} {...rest} />
  );
}
