import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn.js";

/**
 * 押すと開く小さなメニュー。
 *
 * 常時見せる必要のない選択肢を畳む。畳まないと、画面の情報量が判断の邪魔に
 * なる。**キーボードで閉じられる** (Escape) ようにする。
 */

export interface MenuProps {
  readonly label: string;
  readonly value: string;
  readonly children: (close: () => void) => ReactNode;
  readonly disabled?: boolean;
}

export function Menu(props: MenuProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onClick = (event: MouseEvent): void => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line/60 bg-elevated px-2.5",
          "text-xs transition-colors duration-150 hover:bg-line/40 disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {props.value}
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-44 rounded-md border border-line/60 bg-elevated p-1 shadow-xl"
        >
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem(props: {
  readonly onClick: () => void;
  readonly selected?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
        "transition-colors duration-150 hover:bg-line/40",
        props.selected === true && "text-accent",
      )}
    >
      {props.children}
    </button>
  );
}
