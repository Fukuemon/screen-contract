#!/usr/bin/env node
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { runServer } from "../run-server.js";

/** Workflow Server のプロセス入口。判断は runServer にあり、ここは環境を渡すだけ。 */
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const webRoot = fileURLToPath(new URL("../../../web/dist/client/", import.meta.url));

/**
 * 開発時は Vite dev server の前に立つ。
 *
 * **同一 origin を崩さない。** Vite の origin から開いた画面は、Origin 検査と
 * トークンの埋め込みのどちらも通らず動かない (context/infrastructure.md)。
 */
const webDevOrigin = process.env["SCREEN_CONTRACT_DEV_ORIGIN"];

const result = await runServer({
  home: homedir(),
  webRoot,
  webDevOrigin,
  xdgStateHome: process.env["XDG_STATE_HOME"],
  cwd: process.cwd(),
  forbiddenRoots: [repoRoot],
});

process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
