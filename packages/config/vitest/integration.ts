import { defineConfig } from "vitest/config";

/**
 * 統合テストの共通設定。agent-browser を実起動する層を対象にする (context/testing.md)。
 *
 * 直実行と pre-push でだけ通す。root の `test` からは base.ts 側で除外している。
 */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
