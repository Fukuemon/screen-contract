import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { OriginsConfigPort } from "@screen-contract/app";

/**
 * プロダクト設定ファイルの読み書き。
 *
 * **列挙の追加を記録に残す先である** (ADR-0017)。設定は secret ではないため、
 * レビューできる場所に平文で置く (context/infrastructure.md)。
 */
export function createOriginsConfig(path: string): OriginsConfigPort {
  return {
    read(): Record<string, unknown> {
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        // 配列や null を展開すると、書き戻しで設定が壊れる。
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    },

    write(config: Record<string, unknown>): void {
      // 一時ファイルへ書いてから置き換える。途中で落ちても壊れた設定を残さない。
      const temporary = `${path}.${String(process.pid)}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      try {
        renameSync(temporary, path);
      } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
      }
    },
  };
}
