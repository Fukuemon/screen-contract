import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

/**
 * ボタン。
 *
 * **押せる要素には必ず `cursor-pointer` と可視のフォーカスリングを付ける。**
 * 状態の変化は 150ms で繋ぐ — 0ms だと押したことが分からない。
 */
const button = cva(
  [
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border",
    "text-sm font-medium whitespace-nowrap transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-40",
  ],
  {
    variants: {
      tone: {
        default: "border-line/60 bg-elevated text-ink hover:bg-line/40",
        primary: "border-accent bg-accent text-on-accent hover:brightness-110",
        // 面には濃い側を使う。`--color-danger` に白文字を載せると 3.76:1 で
        // WCAG の 4.5:1 に届かない。最も読めてほしいラベルが最も読めなくなる。
        danger: "border-danger-solid bg-danger-solid text-white hover:brightness-110",
        ghost: "border-transparent text-muted hover:bg-elevated hover:text-ink",
      },
      /**
       * デスクトップ専用のため WCAG 2.5.8 の 24px を下限とし、既定を 32px と
       * する。`md` (44px) は 2.5.5 (AAA) 相当で、主要な導線に使う。
       */
      size: { sm: "h-8 px-3", md: "h-11 px-4", icon: "size-8" },
      /** 押した状態を保つトグル。今どちらかを示す。 */
      pressed: {
        // hover でも押した状態を保つ。消えると選択中に見えなくなる。
        true: "border-accent bg-accent/15 text-accent hover:bg-accent/25",
        false: "",
      },
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
    <button
      type="button"
      // **見た目とアクセシビリティを片方だけにしない。** 押した状態が色だけだと、
      // いま選択モードなのか操作モードなのかが読み上げから分からない。
      aria-pressed={pressed === true ? true : undefined}
      className={cn(button({ tone, size, pressed }), className)}
      {...rest}
    />
  );
}
