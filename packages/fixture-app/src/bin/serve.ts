#!/usr/bin/env node
import { startFixtureApp } from "../index.js";

/**
 * fixture 対象アプリを単体で起動する。手動確認で使う。
 *
 * ポートを固定できるようにする。プロダクト設定の `allowedOrigins` へ書く
 * origin が起動のたびに変わると、確認手順が組めない。
 */
const port = Number(process.env["FIXTURE_PORT"] ?? "5174");
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  process.stderr.write("FIXTURE_PORT が不正です\n");
  process.exitCode = 1;
} else {
  const app = await startFixtureApp({ port });
  process.stdout.write(`${app.origin}\n`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
}
