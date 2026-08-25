import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

const button = cva(
  "inline-flex items-center gap-1.5 rounded-md border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      tone: {
        default: "border-line bg-panel hover:bg-line/40",
        primary: "border-accent bg-accent text-white hover:opacity-90",
        danger: "border-danger bg-danger text-white hover:opacity-90",
        ghost: "border-transparent hover:bg-line/40",
      },
      size: { sm: "h-7 px-2.5", md: "h-9 px-3.5", icon: "size-7 justify-center" },
      /** 押した状態を保つトグル。モード切替のように「今どちらか」を示す。 */
      pressed: { true: "border-accent bg-accent/10 text-accent", false: "" },
    },
    defaultVariants: { tone: "default", size: "sm", pressed: false },
  },
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">, VariantProps<typeof button> {
  readonly children?: ReactNode;
  readonly className?: string;
}

export function Button({ tone, size, pressed, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cn(button({ tone, size, pressed }), className)} {...rest} />
  );
}
