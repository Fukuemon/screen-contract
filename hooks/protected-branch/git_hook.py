#!/usr/bin/env python3

from __future__ import annotations

import sys

from common import current_branch, is_protected_branch


def main() -> int:
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "hook"
    branch = current_branch()

    if not is_protected_branch(branch):
        return 0

    print(f"{hook_name} blocked: protected branch '{branch}'.", file=sys.stderr)
    print("Create or switch to a work branch first.", file=sys.stderr)
    print("Recommended: git switch -c feature/<issue-number>", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
