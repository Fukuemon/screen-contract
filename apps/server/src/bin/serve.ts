#!/usr/bin/env node
import { compose } from "../compose.js";

/**
 * Workflow Server のプロセス入口。
 *
 * **まだ listen しない。** HTTP / WebSocket の framework が未確定である
 * ([context/toolchain.md](../../../../context/toolchain.md))。
 * 127.0.0.1 への bind、ローカルトークンの要求、Origin 検査は、listen の実装と
 * 同時に入れる (ADR-0021 / context/infrastructure.md)。
 *
 * 未実装のまま成功終了しない。0 を返すと、起動したつもりの利用者と
 * 起動を待つ検査の両方が気付けない。
 */
function main(): void {
  const app = compose();
  const surfaces = Object.keys(app).join(" / ");
  process.stderr.write(
    `screen-contract-server: ${surfaces} を組み立てました。listen は未実装です。\n`,
  );
  process.exitCode = 1;
}

main();
