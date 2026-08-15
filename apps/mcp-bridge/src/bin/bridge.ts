#!/usr/bin/env node
import { createBridge } from "../index.js";

/**
 * MCP ブリッジのプロセス入口。**AI エージェントが stdio で起動する** (ADR-0021)。
 *
 * まだ転送しない。Workflow Server の endpoint 解決と HTTP framework の実装が
 * 揃ってから実装する (context/infrastructure.md)。
 *
 * 未実装のまま成功終了しない。0 を返すと、エージェント側からは「起動したが
 * 何も返さないサーバ」に見え、原因の切り分けができない。
 */
function main(): void {
  try {
    createBridge();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`screen-contract-mcp-bridge: ${reason}\n`);
    process.stderr.write(
      "転送は未実装です。経緯は context/infrastructure.md を参照してください。\n",
    );
    process.exitCode = 1;
  }
}

main();
