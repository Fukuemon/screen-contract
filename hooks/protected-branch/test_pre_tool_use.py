#!/usr/bin/env python3
"""protected-branch ガードの回帰テスト。

ガードは「保護ブランチを直接変更させない」ためのものであり、
**保護ブランチを変更しない操作まで塞がない**ことが同じくらい重要である。
塞ぎすぎると、作業ブランチへ切り替えるためだけの往復が生まれ、
最終的にガードごと迂回される。両側を固定する。

実行: python3 hooks/protected-branch/test_pre_tool_use.py
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import tempfile

HOOK = pathlib.Path(__file__).with_name("pre_tool_use.py")

ALLOW = 0
DENY = 2

# 保護ブランチ上での Bash コマンド。(期待する終了コード, コマンド)
CASES: list[tuple[int, str]] = [
    # 読み取りは通す
    (ALLOW, "git status"),
    (ALLOW, "git branch --show-current"),
    (ALLOW, "git switch -c feature/9"),
    # 保護ブランチ自体を変える操作は塞ぐ
    (DENY, "git commit -m x"),
    (DENY, "git push"),
    (DENY, "git push origin develop"),
    (DENY, "git push origin feature/x"),
    # マージ済みブランチの後片付けは通す
    (ALLOW, "git branch -d feature/done"),
    (ALLOW, "git branch --delete feature/a feature/b"),
    (ALLOW, "git push origin --delete feature/done"),
    (ALLOW, "git push origin :feature/done"),
    (ALLOW, "git push --quiet origin --delete feature/x"),
    # 取り戻せない削除と、保護ブランチを宛先にした削除は塞ぐ
    (DENY, "git branch -D feature/unmerged"),
    (DENY, "git branch -d develop"),
    (DENY, "git branch -d main"),
    (DENY, "git push origin --delete develop"),
    (DENY, "git push origin :main"),
    (DENY, "git push origin --delete refs/heads/develop"),
    (DENY, "git push origin --delete --force feature/x"),
    # remote を省いた形は宛先が設定依存になるため塞ぐ
    (DENY, "git push --delete feature/x"),
    # global option を読み飛ばさないと subcommand を誤読する
    (DENY, "git -C /tmp/other commit -m x"),
    (DENY, "git --no-pager push origin develop"),
    (ALLOW, "git -C /tmp/other status"),
    # 引数なしの形は設定済みの上流をそのまま使う
    (ALLOW, "git pull --ff-only"),
    (ALLOW, "git pull --quiet --ff-only"),
    # --ff-only の無い pull は分岐時に commit を作るので塞ぐ
    (DENY, "git pull"),
    (DENY, "git pull origin develop"),
    (DENY, "git pull --rebase --ff-only"),
    (DENY, "git pull --ff-only --autostash"),
    # 作業ツリーを HEAD の内容へ戻す操作は通す
    (ALLOW, "git restore --source=HEAD hooks/"),
    (ALLOW, "git restore -s HEAD --worktree hooks/ scripts/"),
    (ALLOW, "git checkout HEAD -- hooks/"),
    # 復元元を省いた形は index が復元元になり、staged の内容が残るので塞ぐ
    (DENY, "git restore hooks/"),
    (DENY, "git checkout -- hooks/"),
    # 別 commit の内容を持ち込む形と index を触る形は塞ぐ
    (DENY, "git restore --source=HEAD~1 hooks/"),
    (DENY, "git restore --staged --source=HEAD hooks/"),
    (DENY, "git restore --source=HEAD"),
    (DENY, "git restore"),
    (DENY, "git checkout HEAD~1 -- hooks/"),
    (DENY, "git checkout --"),
    # ラッパー前置を剥がさないと素通りする
    (DENY, "rtk git commit -m x"),
]


def run(command: str, branch: str, cwd: pathlib.Path) -> int:
    env = {**os.environ, "PROTECTED_BRANCH_GUARD_BRANCH": branch}
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        text=True,
        capture_output=True,
        cwd=cwd,
        env=env,
    )
    return result.returncode


def run_tool(tool_name: str, branch: str, cwd: pathlib.Path) -> int:
    env = {**os.environ, "PROTECTED_BRANCH_GUARD_BRANCH": branch}
    payload = json.dumps({"tool_name": tool_name, "tool_input": {"file_path": "a.md"}})
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        text=True,
        capture_output=True,
        cwd=cwd,
        env=env,
    )
    return result.returncode


def run_in(
    command: str,
    cwd: pathlib.Path,
    tool_name: str = "Bash",
    file_path: pathlib.Path | None = None,
) -> int:
    """payload の cwd で判定させる (PROTECTED_BRANCH_GUARD_BRANCH を使わない)。"""
    env = {k: v for k, v in os.environ.items() if k != "PROTECTED_BRANCH_GUARD_BRANCH"}
    if tool_name == "Bash":
        tool_input: dict[str, str] = {"command": command}
    else:
        tool_input = {"file_path": str(file_path) if file_path else "a.md"}
    payload = json.dumps(
        {"tool_name": tool_name, "tool_input": tool_input, "cwd": str(cwd)}
    )
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        text=True,
        capture_output=True,
        env=env,
    )
    return result.returncode


def run_raw(payload: dict) -> int:
    """payload をそのまま渡す。表記ゆれの吸収を検査するために使う。"""
    env = {k: v for k, v in os.environ.items() if k != "PROTECTED_BRANCH_GUARD_BRANCH"}
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        env=env,
    )
    return result.returncode


def git(*args: str, cwd: pathlib.Path) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def pull_upstream_cases() -> list[str]:
    """取り込み元が設定済みの上流であることまで確かめる。

    `--ff-only` は早送りできなければ中止するだけで、取り込み元は制限しない。
    ここが壊れると `git pull --ff-only . feature` で保護ブランチを feature の
    commit へ直接早送りでき、PR を経由しない変更が通ってしまう。
    """
    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        origin = pathlib.Path(tmp) / "origin.git"
        git("init", "-q", "--bare", "-b", "develop", str(origin), cwd=pathlib.Path(tmp))

        root = pathlib.Path(tmp) / "repo"
        root.mkdir()
        git("init", "-q", "-b", "develop", cwd=root)
        git("-c", "user.email=t@example.com", "-c", "user.name=t",
            "commit", "-q", "--allow-empty", "-m", "init", cwd=root)
        git("remote", "add", "origin", str(origin), cwd=root)
        git("push", "-q", "-u", "origin", "develop", cwd=root)
        git("branch", "feature/x", cwd=root)

        checks = [
            (ALLOW, "git pull --ff-only"),
            (ALLOW, "git pull --ff-only origin"),
            (ALLOW, "git pull --ff-only origin develop"),
            (ALLOW, "git pull --ff-only origin refs/heads/develop"),
            # 上流以外からの取り込みは、早送りでも PR を経由しない変更になる
            (DENY, "git pull --ff-only . feature/x"),
            (DENY, "git pull --ff-only origin feature/x"),
            (DENY, "git pull --ff-only /tmp/elsewhere develop"),
            (DENY, "git pull --ff-only origin develop extra"),
        ]
        for expected, command in checks:
            actual = run_in(command, root)
            if actual != expected:
                failures.append(f"expect={expected} got={actual}  upstream: {command}")
    return failures


def worktree_cases() -> list[str]:
    """worktree ごとにブランチが違う repo で、cwd 基準の判定を固定する。

    ここが壊れると、作業ブランチの worktree にいても保護ブランチ扱いになり、
    commit が一切できなくなる。
    """
    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp) / "repo"
        root.mkdir()
        git("init", "-q", "-b", "develop", cwd=root)
        git("-c", "user.email=t@example.com", "-c", "user.name=t",
            "commit", "-q", "--allow-empty", "-m", "init", cwd=root)

        tree = pathlib.Path(tmp) / "wt"
        git("worktree", "add", "-q", "-b", "feature/x", str(tree), cwd=root)

        checks = [
            (DENY, root, "git commit -m x", "protected worktree"),
            (ALLOW, tree, "git commit -m x", "feature worktree"),
            (DENY, root, "git push origin develop", "protected worktree push"),
            (ALLOW, tree, "git push origin feature/x", "feature worktree push"),
        ]
        for expected, cwd, command, label in checks:
            actual = run_in(command, cwd)
            if actual != expected:
                failures.append(f"expect={expected} got={actual}  {label}: {command}")

        for expected, cwd, label in [(DENY, root, "protected"), (ALLOW, tree, "feature")]:
            actual = run_in("", cwd, tool_name="Edit")
            if actual != expected:
                failures.append(f"expect={expected} got={actual}  Edit in {label} worktree")

        # 編集先が属する作業ツリーで判定する。session の cwd は保護ブランチのままでも、
        # 作業ブランチの worktree にあるファイルは編集できる。
        edit_checks = [
            (DENY, root / "a.md", "protected worktree file"),
            (ALLOW, tree / "a.md", "feature worktree file"),
            # 未作成のファイルも親ディレクトリで判定できる
            (ALLOW, tree / "sub" / "new.md", "feature worktree new file"),
        ]
        for expected, target, label in edit_checks:
            actual = run_in("", root, tool_name="Edit", file_path=target)
            if actual != expected:
                failures.append(f"expect={expected} got={actual}  Edit {label}")

        # 編集先 path の表記ゆれを吸収する。1 形だけ見ると path を取り落とし、
        # session の cwd (= 作業ブランチ) で判定して保護ブランチ上の編集が素通りする。
        # 認識する形は hooks/lib/tool_use_input.sh と揃える。
        protected_file = str(root / "a.md")
        shapes = [
            ({"tool_name": "Edit", "tool_input": {"file_path": protected_file}}, "tool_input.file_path"),
            ({"tool_name": "Edit", "tool_input": {"filePath": protected_file}}, "tool_input.filePath"),
            ({"tool_name": "Edit", "tool_input": {"path": protected_file}}, "tool_input.path"),
            ({"tool_name": "Edit", "toolInput": {"filePath": protected_file}}, "toolInput.filePath"),
            ({"tool_name": "Edit", "file_path": protected_file}, "top-level file_path"),
            ({"tool_name": "Edit", "filePath": protected_file}, "top-level filePath"),
        ]
        for payload, label in shapes:
            # session の cwd は作業ブランチの worktree。path を取れなければ ALLOW に落ちる。
            actual = run_raw({**payload, "cwd": str(tree)})
            if actual != DENY:
                failures.append(f"expect={DENY} got={actual}  Edit via {label}")

        git("worktree", "remove", "--force", str(tree), cwd=root)
    return failures


def main() -> int:
    failures: list[str] = []

    # 保護対象は repo ルートの .protected-branches で上書きできる。
    # テンプレ repo 自身は保護を外しているため、既定が効く空ディレクトリで走らせる。
    with tempfile.TemporaryDirectory() as tmp:
        cwd = pathlib.Path(tmp)

        for expected, command in CASES:
            actual = run(command, "develop", cwd)
            if actual != expected:
                failures.append(f"expect={expected} got={actual}  {command}")

        for tool_name in ("Edit", "Write", "MultiEdit"):
            actual = run_tool(tool_name, "develop", cwd)
            if actual != DENY:
                failures.append(f"expect={DENY} got={actual}  {tool_name} on protected branch")

        # 非保護ブランチでは何も塞がない
        for command in ("git commit -m x", "git push origin develop", "git branch -D x"):
            actual = run(command, "feature/4", cwd)
            if actual != ALLOW:
                failures.append(f"expect={ALLOW} got={actual}  unprotected: {command}")

        for tool_name in ("Edit", "Write"):
            actual = run_tool(tool_name, "feature/4", cwd)
            if actual != ALLOW:
                failures.append(f"expect={ALLOW} got={actual}  unprotected: {tool_name}")

    failures.extend(pull_upstream_cases())
    failures.extend(worktree_cases())

    for line in failures:
        print(f"NG {line}")
    if failures:
        print(f"{len(failures)} case(s) failed")
        return 1
    print("protected-branch guard: all cases passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
