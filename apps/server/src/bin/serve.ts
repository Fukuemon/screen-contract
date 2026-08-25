#!/usr/bin/env node
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { runServer } from "../run-server.js";

/** Workflow Server のプロセス入口。判断は runServer にあり、ここは環境を渡すだけ。 */
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const webRoot = fileURLToPath(new URL("../../../web/dist/client/", import.meta.url));

const result = await runServer({
  home: homedir(),
  webRoot,
  xdgStateHome: process.env["XDG_STATE_HOME"],
  cwd: process.cwd(),
  forbiddenRoots: [repoRoot],
});

process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
