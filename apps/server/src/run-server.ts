import { join } from "node:path";
import {
  createAgentBrowserPort,
  isChromeAvailable,
  resolveChromeInstall,
} from "@screen-contract/adapter-browser";
import { createAllowedOrigins } from "./viewport/allowed-origins.js";
import { StartupAbort } from "./startup/abort.js";
import { runStartupChecks } from "./startup/checks.js";
import { loadProductConfig } from "./startup/config.js";
import { listen, type RunningServer } from "./runtime/listen.js";
import { createAuthProfileStore, createKeystore } from "@screen-contract/adapter-store";
import { resolveStateDir } from "./startup/state-dir.js";
import { createViewport } from "./viewport/viewport.js";

/**
 * 起動の本体。終了コードと出力を戻り値にして、プロセスを起こさずに検証できる形にする。
 *
 * 利用者と自動検査が観測するのは stderr の 1 行と終了コードである。`main()` の
 * 中に閉じ込めると、中止の分岐が消えてもテストが緑のままになる。
 */
export interface ServerEnv {
  readonly home: string;
  /** Web UI のビルド成果物。無ければ配信しない。 */
  readonly webRoot?: string | undefined;
  readonly xdgStateHome: string | undefined;
  readonly cwd: string;
  /** リポジトリと worktree のルート。置き場がここの配下なら中止する。 */
  readonly forbiddenRoots: readonly string[];
}

export interface ServerResult {
  readonly exitCode: number;
  readonly stderr: string;
  /** 起動できたときだけ入る。呼び出し側が終了させるために持つ。 */
  readonly server?: RunningServer | undefined;
}

const PRODUCT_CONFIG_NAME = "screen-contract.config.json";

export async function runServer(env: ServerEnv): Promise<ServerResult> {
  let stateDir: string;
  let allowedOrigins: readonly string[];
  try {
    const chrome = resolveChromeInstall(env.home);
    allowedOrigins = loadProductConfig(join(env.cwd, PRODUCT_CONFIG_NAME)).allowedOrigins;
    stateDir = runStartupChecks({
      stateDir: resolveStateDir(env.xdgStateHome, env.home),
      forbiddenRoots: env.forbiddenRoots,
      isBrowserAvailable: () => isChromeAvailable(chrome.executablePath),
      allowedOrigins,
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

  // ポートは OS に割り当てさせる。トークンと接続先ファイルは listen の後に
  // 確定する (待受アドレスが決まらないと接続先を書けない)。
  try {
    // いま使う認証プロファイル。viewport がセッションを開くときに読む。
    let activeProfile: string | undefined;
    const authProfiles = createAuthProfileStore({ stateDir, keystore: createKeystore() });

    const server = await listen({
      stateDir,
      webRoot: env.webRoot,
      allowedOrigins: createAllowedOrigins({
        configPath: join(env.cwd, PRODUCT_CONFIG_NAME),
        initial: allowedOrigins,
      }),
      authProfiles,
      setActiveProfile: (name) => {
        activeProfile = name;
      },
      // **列挙した origin の先頭を開く。** 列挙外へ open しない (ADR-0017)。
      // 列挙が空なら起動時検査で中止しているため、ここには必ず 1 件ある。
      entryUrl: allowedOrigins[0] as string,
      viewport: createViewport({
        browser: createAgentBrowserPort({ home: env.home }),
        entryUrl: allowedOrigins[0] as string,
        storageState: () =>
          Promise.resolve(
            activeProfile === undefined ? undefined : (authProfiles.load(activeProfile) as never),
          ),
      }),
    });
    return {
      exitCode: 0,
      stderr: `screen-contract-server: http://127.0.0.1:${server.port} で待ち受けています\n`,
      server,
    };
  } catch {
    // 例外の中身を出さない。listen の失敗にはトークンと接続先のパスが載りうる。
    return { exitCode: 1, stderr: "screen-contract-server: 待ち受けを開始できませんでした\n" };
  }
}
