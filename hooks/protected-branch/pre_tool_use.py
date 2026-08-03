#!/usr/bin/env python3

from __future__ import annotations

import json
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

    branch = current_branch()
    if not is_protected_branch(branch):
        return 0

    if tool_name in EDIT_TOOLS:
        return deny(
            f"Direct file edits are blocked on protected branch '{branch}'. "
            "Switch to a work branch first, for example: git switch -c feature/<issue-number>"
        )

    subcommand = argv[1] if len(argv) > 1 else ""
    args = argv[2:]

    if subcommand in READONLY_GIT:
        return 0

    if subcommand == "branch":
        if is_readonly_branch_command(args):
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

    if subcommand in MUTATING_GIT:
        return deny(
            f"Mutating git command is blocked on protected branch '{branch}': {command}. "
            "Create or switch to a work branch first."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
