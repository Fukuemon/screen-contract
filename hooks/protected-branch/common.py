from __future__ import annotations

import os
import pathlib
import subprocess

DEFAULT_PROTECTED_BRANCHES = {"main", "master", "develop"}

# repo ルートに置くと保護対象を上書きできる。1 行 1 ブランチ、`#` 以降はコメント。
# 空ファイル (コメントだけ) を置けば保護を外せる。
#
# 外せるようにしているのは、単独メンテの repo で PR の往復が実益より
# 手間になる場合があるため。既定は据え置きで、外すのは明示的な選択にする。
CONFIG_FILENAME = ".protected-branches"


def _usable_cwd(cwd: str | None) -> str | None:
    """subprocess に渡せる作業ディレクトリだけを返す。

    存在しない path を渡すと subprocess が例外を投げ、hook が異常終了して
    ガードごと無効になる。判定できないときは None に落として呼び出し元の
    既定 (プロセスの cwd) に委ねる。
    """
    if not cwd or not os.path.isdir(cwd):
        return None
    return cwd


def current_branch(cwd: str | None = None) -> str:
    """判定対象のブランチ。cwd を渡すとその作業ツリーのブランチを見る。

    git worktree を使うと、同じ repo でも作業ツリーごとにブランチが違う。
    常に repo ルート (= メイン worktree) で判定すると、作業ブランチの
    worktree にいても保護ブランチとみなされ、commit が一切できなくなる。
    """
    env_branch = os.environ.get("PROTECTED_BRANCH_GUARD_BRANCH")
    if env_branch:
        return env_branch

    result = subprocess.run(
        ["git", "branch", "--show-current"],
        check=False,
        capture_output=True,
        text=True,
        cwd=_usable_cwd(cwd),
    )
    return result.stdout.strip()


def _repo_root(cwd: str | None = None) -> pathlib.Path | None:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=False,
        capture_output=True,
        text=True,
        cwd=_usable_cwd(cwd),
    )
    root = result.stdout.strip()
    return pathlib.Path(root) if root else None


def protected_branches(cwd: str | None = None) -> set[str]:
    """保護対象のブランチ名。設定ファイルがあればそちらを使う。"""
    root = _repo_root(cwd)
    if root is None:
        return set(DEFAULT_PROTECTED_BRANCHES)

    config = root / CONFIG_FILENAME
    if not config.is_file():
        return set(DEFAULT_PROTECTED_BRANCHES)

    names = set()
    for raw in config.read_text(encoding="utf-8").splitlines():
        name = raw.split("#", 1)[0].strip()
        if name:
            names.add(name)
    return names


def is_protected_branch(branch: str, cwd: str | None = None) -> bool:
    return branch in protected_branches(cwd)


def _git_config(key: str, cwd: str | None) -> str:
    result = subprocess.run(
        ["git", "config", "--get", key],
        check=False,
        capture_output=True,
        text=True,
        cwd=_usable_cwd(cwd),
    )
    return result.stdout.strip()


def upstream_of(branch: str, cwd: str | None = None) -> tuple[str, str] | None:
    """branch に設定された上流。(remote, ref) を返す。未設定なら None。

    ref は `refs/heads/<name>` 形式。`git rev-parse @{upstream}` の出力を
    分解する方法は取らない。`origin/feature/x` のようにブランチ名へ `/` が
    入ると remote 名との境界を決められないためである。
    """
    remote = _git_config(f"branch.{branch}.remote", cwd)
    merge = _git_config(f"branch.{branch}.merge", cwd)
    if not remote or not merge:
        return None
    return remote, merge
