import { closeSync, fstatSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { StartupAbort } from "./abort.js";

/**
 * secret を含むローカル状態の置き場を解決し、作成し、検証する。
 *
 * `XDG_STATE_HOME` の値を信用しない (context/infrastructure.md)。環境変数は
 * 利用者が設定でき、`XDG_STATE_HOME=$PWD/.state` のような値を置かれると、
 * 配置規則を守ったまま secret がリポジトリ配下へ落ちる。
 */

export function resolveStateDir(xdgStateHome: string | undefined, home: string): string {
  const base =
    xdgStateHome !== undefined && xdgStateHome !== ""
      ? xdgStateHome
      : join(home, ".local", "state");
  // 正規化はするが、絶対化はしない。`resolve` は相対パスを実行ディレクトリ起点で
  // 絶対化してしまい、契約が防ごうとした「実行ディレクトリ次第で置き場が変わる」を
  // こちらで作り込むことになる。相対のまま渡し、ensureStateDir に弾かせる。
  return normalize(join(base, "screen-contract"));
}

export interface StateDirInput {
  readonly stateDir: string;
  /** リポジトリと worktree のルート。ここの配下は置き場にできない。 */
  readonly forbiddenRoots: readonly string[];
}

/**
 * 置き場を 0700 で用意し、検証して**解決済みのパスを返す**。
 *
 * 戻り値を使わせることで、検証したパスと書き込むパスの乖離を防ぐ。未解決の
 * パスを使い回すと、検査の後に symlink を張り替えられたときに別の場所へ書く。
 */
export function ensureStateDir(input: StateDirInput): string {
  const { stateDir, forbiddenRoots } = input;

  if (!isAbsolute(stateDir)) {
    throw new StartupAbort(
      "状態の置き場が絶対パスではありません",
      "XDG_STATE_HOME に絶対パスを設定するか、環境変数を外してください",
    );
  }

  try {
    // 初回起動では存在しない。作ってから検査する。mode は umask に削られるため、
    // 作成後に権限を確かめる (下の fstat) 側を正とする。
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  } catch {
    throw new StartupAbort(
      "状態の置き場を作成できません",
      "XDG_STATE_HOME が指す場所の権限を確認してください",
    );
  }

  // 文字列の検査だけでは symlink で外へ出られる。解決後のパスで判定する。
  let resolved: string;
  try {
    resolved = realpathSync(stateDir);
  } catch {
    throw new StartupAbort(
      "状態の置き場を解決できません",
      "XDG_STATE_HOME が指す場所を確認してください",
    );
  }

  for (const root of forbiddenRoots) {
    let resolvedRoot: string;
    try {
      resolvedRoot = realpathSync(root);
    } catch {
      // 存在しない worktree は禁止対象として意味を持たない。
      continue;
    }
    if (resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}/`)) {
      throw new StartupAbort(
        "状態の置き場がリポジトリの配下にあります",
        "XDG_STATE_HOME をリポジトリの外へ向けてください (secret が commit の対象に入ります)",
      );
    }
  }

  // path ではなく開いた fd を検査する。realpath と stat の間に張り替えられても、
  // 見ているのは同じディレクトリである。
  const fd = openSync(resolved, "r");
  let mode: number;
  try {
    mode = fstatSync(fd).mode & 0o777;
  } finally {
    closeSync(fd);
  }
  if (mode !== 0o700) {
    throw new StartupAbort(
      "状態の置き場の権限が 0700 ではありません",
      "同じマシンの他利用者が読めます。chmod 700 で絞ってください",
    );
  }

  return resolved;
}
