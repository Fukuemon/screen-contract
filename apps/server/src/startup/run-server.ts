import { join } from "node:path";
import { isChromeAvailable, resolveChromeInstall } from "@screen-contract/adapter-browser";
import { compose } from "../compose.js";
import { StartupAbort } from "./abort.js";
import { runStartupChecks } from "./checks.js";
import { loadProductConfig } from "./config.js";
import { resolveStateDir } from "./state-dir.js";

/**
 * 起動の本体。終了コードと出力を戻り値にして、プロセスを起こさずに検証できる形にする。
 *
 * 利用者と自動検査が観測するのは stderr の 1 行と終了コードである。`main()` の
 * 中に閉じ込めると、中止の分岐が消えてもテストが緑のままになる。
 */
export interface ServerEnv {
  readonly home: string;
  readonly xdgStateHome: string | undefined;
  readonly cwd: string;
  /** リポジトリと worktree のルート。置き場がここの配下なら中止する。 */
  readonly forbiddenRoots: readonly string[];
}

export interface ServerResult {
  readonly exitCode: number;
  readonly stderr: string;
}

const PRODUCT_CONFIG_NAME = "screen-contract.config.json";

export function runServer(env: ServerEnv): ServerResult {
  try {
    const chrome = resolveChromeInstall(env.home);
    runStartupChecks({
      stateDir: resolveStateDir(env.xdgStateHome, env.home),
      forbiddenRoots: env.forbiddenRoots,
      isBrowserAvailable: () => isChromeAvailable(chrome.executablePath),
      allowedOrigins: loadProductConfig(join(env.cwd, PRODUCT_CONFIG_NAME)).allowedOrigins,
      browserInstallCommand: "pnpm browser:install",
      productConfigName: PRODUCT_CONFIG_NAME,
    });
  } catch (error) {
    if (error instanceof StartupAbort) {
      return { exitCode: 1, stderr: `screen-contract-server: ${error.message}\n` };
    }
    // 想定外の失敗も message と stack を出さない。起動時に読むファイルは
    // secret を含み、出力は端末とログに残る。
    return {
      exitCode: 1,
      stderr: "screen-contract-server: 起動時の検査で想定外の失敗が起きました\n",
    };
  }

  // 検査を通ったが、まだ listen しない。framework は Hono に確定しているが
  // (ADR-0024)、まだ組み込んでいない。**未確定だから保留しているのではない。**
  // 127.0.0.1 への bind、トークンの要求、Origin 検査、接続先ファイルの書き出し
  // (startRuntimeFile) は listen と同時に入れる。ポートを OS に割り当てさせる
  // 以上、待受アドレスが決まらないと接続先を書けないためである。
  //
  // 未実装のまま成功終了しない。0 を返すと、起動したつもりの利用者と
  // 起動を待つ検査の両方が気付けない。
  const surfaces = Object.keys(compose()).join(" / ");
  return {
    exitCode: 1,
    stderr: `screen-contract-server: ${surfaces} を組み立てました。listen は未実装です。\n`,
  };
}
