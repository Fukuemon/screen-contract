import { defineConfig } from "vitest/config";

/**
 * unit test の共通設定。ソースと同居した `*.test.ts` を対象にする (context/testing.md)。
 *
 * 統合テストは agent-browser を実起動するため root の `test` から外す。
 * 実行時間が桁違いで、commit のたびに通せないためである。
 * 振り分けはファイル名の規約 (`*.integration.test.ts`) で行い、
 * ディレクトリを分けない (テスト対象のソースと離れると参照が追いにくくなるため)。
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.integration.test.{ts,tsx}"],
  },
});
