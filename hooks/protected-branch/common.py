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


def current_branch() -> str:
    env_branch = os.environ.get("PROTECTED_BRANCH_GUARD_BRANCH")
    if env_branch:
        return env_branch

    result = subprocess.run(
        ["git", "branch", "--show-current"],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _repo_root() -> pathlib.Path | None:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=False,
        capture_output=True,
        text=True,
    )
    root = result.stdout.strip()
    return pathlib.Path(root) if root else None


def protected_branches() -> set[str]:
    """保護対象のブランチ名。設定ファイルがあればそちらを使う。"""
    root = _repo_root()
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


def is_protected_branch(branch: str) -> bool:
    return branch in protected_branches()
