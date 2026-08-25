import { StartupAbort } from "./abort.js";
import { isProcessAlive, readRuntimeFile } from "./runtime-file.js";
import { ensureStateDir } from "./state-dir.js";

/**
 * 起動時に確かめること (context/infrastructure.md)。
 *
 * 置き場の検証を最初に行う。ここを通さないと、以降のファイル操作が
 * リポジトリ配下や他利用者から読める場所へ secret を置きうる。
 */
export interface StartupCheckInput {
  readonly stateDir: string;
  /** リポジトリと worktree のルート。ここの配下は置き場にできない。 */
  readonly forbiddenRoots: readonly string[];
  /** ブラウザ本体が使えるか。定義は adapter/browser が持つ。 */
  readonly isBrowserAvailable: () => boolean;
  /** 実行してよい origin。既定は空で、空なら実行できない。 */
  readonly allowedOrigins: readonly string[];
  /** ブラウザ本体の導入コマンド。案内文へ出す。 */
  readonly browserInstallCommand: string;
  /** プロダクト設定の名前。案内文へ出す。 */
  readonly productConfigName: string;
}

/** 検証を通った置き場を返す。以降のファイル操作はこの戻り値だけを使う。 */
export function runStartupChecks(input: StartupCheckInput): string {
  const stateDir = ensureStateDir({
    stateDir: input.stateDir,
    forbiddenRoots: input.forbiddenRoots,
  });

  if (!input.isBrowserAvailable()) {
    throw new StartupAbort(
      "ブラウザ本体が見つかりません",
      `${input.browserInstallCommand} を実行してください`,
    );
  }

  if (input.allowedOrigins.length === 0) {
    throw new StartupAbort(
      "実行してよい origin が 1 つも列挙されていません",
      `${input.productConfigName} の allowedOrigins へ対象を追記してください`,
    );
  }

  const existing = readRuntimeFile(stateDir);
  if (existing !== undefined && isProcessAlive(existing.pid)) {
    throw new StartupAbort(
      "常駐サーバが二重起動です",
      `既存のプロセス (PID ${String(existing.pid)}) を停止してください`,
    );
  }

  return stateDir;
}
