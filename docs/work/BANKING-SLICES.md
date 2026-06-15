# Banking Vertical Work Plan

## Commit Protocol

Banking work should commit as it goes. Do not wait until several slices have
accumulated in one dirty worktree.

After each verified slice, or after a coherent independently useful sub-slice:

1. Run the slice's focused verification and any impacted workspace checks.
2. Update the relevant implementation tracker with status, verification, blockers,
   and the next slice.
3. Inspect `git status --short` and the diff before staging.
4. Stage only files owned by the banking slice; do not stage unrelated UI,
   Gmail, matching, or user-owned worktree changes.
5. Commit the verified unit with a concise conventional message, for example
   `feat(banking): add provider connection registry` or
   `test(banking): add provider sync fixture coverage`.
6. If a live-provider proof is blocked, commit the local/testable foundation only
   when it is independently useful and record the live prerequisite explicitly.

Use a separate docs checkpoint commit when tracking/docs updates are substantial
or when separating them makes history easier to review.

Current banking source slices live in
[`docs/work/VERTICAL-SLICES.md`](./VERTICAL-SLICES.md), especially the banking
provider adapter and real-provider slices. Future banking-specific slices should
inherit this commit protocol.
