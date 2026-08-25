import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** class の衝突を後勝ちで解決する。条件分岐で色を上書きする箇所が多いため。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
