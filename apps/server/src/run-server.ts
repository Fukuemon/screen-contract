import { join } from "node:path";
import {
  createAgentBrowserPort,
  isChromeAvailable,
  resolveChromeInstall,
} from "@screen-contract/adapter-browser";
import { createAllowedOrigins, createViewport } from "@screen-contract/app";
import { StartupAbort } from "./startup/abort.js";
import { runStartupChecks } from "./startup/checks.js";
import { loadProductConfig } from "./startup/config.js";
import { listen, type RunningServer } from "./runtime/listen.js";
import {
  createAuthProfileStore,
  createKeystore,
  createOriginsConfig,
} from "@screen-contract/adapter-store";
import { parseAuthProfileName } from "@screen-contract/core-execution";
import { resolveStateDir } from "./startup/state-dir.js";

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

    // **具象は 1 つだけ作る。** 2 つ作ると、home の解決元まで食い違い、
    // テストが差し替えた側と実際に動く側がずれる (ADR-0023)。
    const browser = createAgentBrowserPort({
      home: env.home,
      // **復号は保管側が担い、復号した状態は app を通らない** (ADR-0022)。
      // adapter 同士は直接依存できないため、合成ルートが関数として渡す。
      resolveStorageState: (auth) =>
        Promise.resolve(auth.kind === "anonymous" ? undefined : authProfiles.load(auth.name)),
    });

    const server = await listen({
      browser,
      stateDir,
      webRoot: env.webRoot,
      allowedOrigins: createAllowedOrigins({
        config: createOriginsConfig(join(env.cwd, PRODUCT_CONFIG_NAME)),
        initial: allowedOrigins,
        // 障害と重要な変更の一次観測点は標準出力である
        // (context/infrastructure.md)。
        onAdded: (origin) =>
          console.error(`screen-contract-server: 実行してよい対象へ ${origin} を足しました`),
      }),
      authProfiles,
      setActiveProfile: (name) => {
        activeProfile = name;
      },
      // **列挙した origin の先頭を開く。** 列挙外へ open しない (ADR-0017)。
      // 列挙が空なら起動時検査で中止しているため、ここには必ず 1 件ある。
      entryUrl: allowedOrigins[0] as string,
      viewport: createViewport({
        browser,
        entryUrl: allowedOrigins[0] as string,
        // 誰として実行しているかを Port へ渡す。匿名を名乗ったまま認証状態を
        // 注入すると、認証済みの結果が匿名の Baseline へ混ざる (ADR-0022)。
        auth: () =>
          activeProfile === undefined
            ? { kind: "anonymous" }
            : { kind: "profile", name: parseAuthProfileName(activeProfile) },
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
