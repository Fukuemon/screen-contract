#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import shlex
import sys

from common import current_branch, is_protected_branch

EDIT_TOOLS = {"Edit", "Write", "MultiEdit"}
WRAPPERS = {"rtk"}
READONLY_GIT = {
    "status",
    "diff",
    "log",
    "show",
    "rev-parse",
    "remote",
    "ls-files",
    "fetch",
}
MUTATING_GIT = {
    "add",
    "am",
    "apply",
    "cherry-pick",
    "clean",
    "commit",
    "merge",
    "mv",
    "pull",
    "push",
    "rebase",
    "reset",
    "restore",
    "revert",
    "rm",
    "stash",
    "tag",
}
BRANCH_FLAGS = {
    "-c",
    "-C",
    "-d",
    "-D",
    "-f",
    "-m",
    "-M",
    "--copy",
    "--create-reflog",
    "--delete",
    "--force",
    "--move",
}
BRANCH_FLAGS_WITH_VALUE = {
    "--column",
    "--format",
    "--points-at",
    "--sort",
}
CHECKOUT_FLAGS = {
    "--detach",
    "--force",
    "--guess",
    "--merge",
    "--no-guess",
    "--progress",
    "--quiet",
    "-f",
    "-m",
    "-q",
}
CHECKOUT_FLAGS_WITH_VALUE = {
    "--conflict",
    "--orphan",
    "-B",
    "-b",
}
# git 本体の global option。subcommand の手前に置けるため、読み飛ばさないと
# `git -C <path> commit` の subcommand を `-C` と誤読してガードが素通りする。
GIT_GLOBAL_FLAGS = {
    "--bare",
    "--literal-pathspecs",
    "--no-optional-locks",
    "--no-pager",
    "--no-replace-objects",
    "--paginate",
    "-p",
}
GIT_GLOBAL_FLAGS_WITH_VALUE = {
    "--exec-path",
    "--git-dir",
    "--namespace",
    "--work-tree",
    "-C",
    "-c",
}
# push に付けても宛先と結果が変わらない修飾だけを許す。
# `--force` / `--force-with-lease` / `--mirror` / `--no-verify` は含めない。
PUSH_SAFE_FLAGS = {
    "--dry-run",
    "--porcelain",
    "--quiet",
    "--verbose",
    "-n",
    "-q",
    "-v",
}


def strip_wrappers(argv: list[str]) -> list[str]:
    """`rtk git commit ...` のようなラッパー前置を剥がして素の argv にする。

    RTK (bash 出力圧縮プロキシ) は `git ...` を `rtk git ...` に書き換えるため、
    前置を剥がさないと protected branch ガードが素通りする。
    """
    while argv and argv[0] in WRAPPERS:
        argv = argv[1:]
    return argv


def deny(reason: str) -> int:
    print(reason, file=sys.stderr)
    return 2


def parse_payload() -> dict[str, object]:
    raw = sys.stdin.read()
    try:
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


def is_readonly_branch_command(args: list[str]) -> bool:
    if not args:
        return True

    index = 0
    while index < len(args):
        arg = args[index]

        if arg in BRANCH_FLAGS or arg == "--":
            return False
        if arg in {"--show-current", "--all", "--remotes", "--verbose", "--ignore-case", "--no-color"}:
            index += 1
            continue
        if arg in {"-a", "-r", "-v", "-vv"}:
            index += 1
            continue
        if arg in {"--list", "-l"}:
            index += 1
            while index < len(args) and not args[index].startswith("-"):
                index += 1
            continue
        if arg in BRANCH_FLAGS_WITH_VALUE:
            if index + 1 >= len(args):
                return False
            index += 2
            continue
        if arg.startswith("-"):
            return False

        return False

    return True


def nearest_existing_dir(path: str) -> str | None:
    """path を含む、実在する最も近いディレクトリ。

    新規作成の Write では path 自体がまだ無いため、親を遡って探す。
    """
    current = os.path.dirname(os.path.abspath(path))
    while current and current != os.path.dirname(current):
        if os.path.isdir(current):
            return current
        current = os.path.dirname(current)
    return None


def resolve_edit_path(payload: dict[str, object], tool_input: dict[str, object]) -> str:
    """編集先の path。payload の表記ゆれを吸収する。

    呼び出し元によって snake_case と camelCase、tool_input 内と top-level が
    混在する。1 形だけ見ると path を取り落とし、session の cwd で判定して
    しまうため、保護ブランチ上のファイルへの編集が素通りする。
    認識する形は hooks/lib/tool_use_input.sh と揃える。
    """
    candidates = [
        tool_input.get("file_path"),
        tool_input.get("filePath"),
        tool_input.get("path"),
        payload.get("file_path"),
        payload.get("filePath"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate:
            return candidate
    return ""


def split_git_command(argv: list[str]) -> tuple[str, list[str]]:
    """global option を読み飛ばして (subcommand, args) を返す。

    `git -C <path> push` のように subcommand の手前へ option を置けるため、
    argv[1] をそのまま subcommand とみなすとガードが素通りする。
    なお `-C` で別 repo を指しても、判定に使うブランチは
    CLAUDE_PROJECT_DIR のものである。厳しい側に倒れるので許容する。
    """
    index = 1
    while index < len(argv):
        arg = argv[index]
        if arg in GIT_GLOBAL_FLAGS:
            index += 1
            continue
        if arg in GIT_GLOBAL_FLAGS_WITH_VALUE:
            index += 2
            continue
        if arg.startswith("--") and arg.split("=", 1)[0] in GIT_GLOBAL_FLAGS_WITH_VALUE:
            index += 1
            continue
        return arg, argv[index + 1 :]
    return "", []


def is_allowed_branch_delete(args: list[str], branch: str, cwd: str | None) -> bool:
    """マージ済みブランチの後片付けを許すか。

    保護ブランチ上でも、**別の**ブランチを消す操作は保護ブランチを変更しない。
    PR マージ後の後片付けがガードで止まると、作業ブランチへ切り替えるためだけの
    無意味な往復が生まれる。

    許すのは安全側の `-d` / `--delete` だけとする。`-D` は未マージでも消すため、
    取り戻せない削除になる。
    """
    safe_delete = {"-d", "--delete"}
    if not any(arg in safe_delete for arg in args):
        return False

    targets: list[str] = []
    for arg in args:
        if arg in safe_delete:
            continue
        if arg.startswith("-"):
            return False
        targets.append(arg)

    if not targets:
        return False
    return all(
        target != branch and not is_protected_branch(target, cwd) for target in targets
    )


def is_allowed_push_delete(args: list[str], cwd: str | None) -> bool:
    """リモートの作業ブランチ削除を許すか。

    `git push origin --delete <branch>` と `git push origin :<branch>` に限る。
    保護ブランチを宛先にした削除と、`--force` 系の修飾は許さない。
    """
    saw_delete = False
    positionals: list[str] = []

    for arg in args:
        if arg in {"--delete", "-d"}:
            saw_delete = True
            continue
        if arg in PUSH_SAFE_FLAGS:
            continue
        if arg.startswith("-"):
            return False
        positionals.append(arg)

    # 宛先 remote と ref が最低 1 つずつ必要。remote を省いた形は許さない。
    if len(positionals) < 2:
        return False
    refs = positionals[1:]

    if not saw_delete:
        # refspec 形式は左辺が空 (`:<ref>`) のときだけ削除になる。
        if not all(ref.startswith(":") for ref in refs):
            return False
    elif any(ref.startswith(":") for ref in refs):
        return False

    names = [ref.lstrip(":") for ref in refs]
    if not all(names):
        return False
    return all(
        not is_protected_branch(name.removeprefix("refs/heads/"), cwd) for name in names
    )


def is_allowed_checkout_command(args: list[str]) -> bool:
    if not args or "--" in args:
        return False

    index = 0
    saw_explicit_branch_mode = False
    positional_count = 0

    while index < len(args):
        arg = args[index]

        if arg in CHECKOUT_FLAGS:
            if arg == "--detach":
                saw_explicit_branch_mode = True
            index += 1
            continue
        if arg in CHECKOUT_FLAGS_WITH_VALUE:
            if index + 1 >= len(args):
                return False
            saw_explicit_branch_mode = True
            index += 2
            continue
        if arg.startswith("-"):
            return False

        positional_count += 1
        index += 1

    if not saw_explicit_branch_mode:
        return False

    return positional_count <= 1


def main() -> int:
    payload = parse_payload()
    tool_name = payload.get("tool_name") or payload.get("toolName") or payload.get("tool")
    tool_input = payload.get("tool_input") or payload.get("toolInput") or {}
    if not isinstance(tool_input, dict):
        tool_input = {}

    command = (
        tool_input.get("command")
        or tool_input.get("cmd")
        or payload.get("command")
        or ""
    )

    if tool_name not in EDIT_TOOLS and tool_name != "Bash":
        return 0

    if tool_name == "Bash":
        try:
            argv = shlex.split(command)
        except ValueError:
            argv = []

        argv = strip_wrappers(argv)

        if not argv or argv[0] != "git":
            return 0
    else:
        argv = []

    # 判定は **コマンドが実際に走る作業ツリー** で行う。
    # git worktree では作業ツリーごとにブランチが違うため、常に
    # CLAUDE_PROJECT_DIR で判定すると作業ブランチの worktree でも
    # 保護ブランチとみなされ、commit が一切できなくなる。
    # cwd が repo の外なら判定できないので、従来どおりプロセスの cwd に委ねる。
    cwd = payload.get("cwd")
    if not isinstance(cwd, str):
        cwd = None

    # ファイル編集は **編集先が属する作業ツリー** で判定する。
    # session の cwd で判定すると、作業ブランチの worktree にあるファイルや
    # 別 repo のファイルまで巻き添えで塞がる。
    if tool_name in EDIT_TOOLS:
        file_path = resolve_edit_path(payload, tool_input)
        if file_path:
            # 相対パスは payload の cwd を基準に解く。hook 自身の cwd で解くと
            # 別 repo を指してしまう。
            if not os.path.isabs(file_path) and cwd:
                file_path = os.path.join(cwd, file_path)
            cwd = nearest_existing_dir(file_path) or cwd

    branch = current_branch(cwd)
    if not branch:
        cwd = None
        branch = current_branch()

    if not is_protected_branch(branch, cwd):
        return 0

    if tool_name in EDIT_TOOLS:
        return deny(
            f"Direct file edits are blocked on protected branch '{branch}'. "
            "Switch to a work branch first, for example: git switch -c feature/<issue-number>"
        )

    subcommand, args = split_git_command(argv)

    if subcommand in READONLY_GIT:
        return 0

    if subcommand == "branch":
        if is_readonly_branch_command(args):
            return 0
        if is_allowed_branch_delete(args, branch, cwd):
            return 0
        return deny(
            f"Mutating git branch command is blocked on protected branch '{branch}': {command}"
        )

    if subcommand == "switch":
        return 0

    if subcommand == "checkout":
        if is_allowed_checkout_command(args):
            return 0
        return deny(
            f"Ambiguous or path-based checkout is blocked on protected branch '{branch}': {command}. "
            "Use git switch for branch changes."
        )

    if subcommand == "worktree":
        if args and args[0] == "add" and "-b" in args:
            return 0
        return deny(
            f"Git worktree mutation is blocked on protected branch '{branch}': {command}"
        )

    if subcommand == "push" and is_allowed_push_delete(args, cwd):
        return 0

    if subcommand in MUTATING_GIT:
        return deny(
            f"Mutating git command is blocked on protected branch '{branch}': {command}. "
            "Create or switch to a work branch first."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
