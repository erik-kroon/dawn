# Grill Notes

- Done boundary: Full end-to-end implementation of all required Dawn/Stealth slices, with verified commits and updated docs. Milestone commits are allowed, but the goal is not complete while any required slice remains incomplete.
- Orchestrator autonomy: High autonomy inside the documented architecture. The orchestrator may create worktrees/branches, spawn Codex CLI workers, review and merge output, update ADRs/docs, and commit verified units without asking at every step. It should stop for user input only when a decision changes product scope, violates an architectural non-negotiable, needs credentials/external services, or risks overwriting user changes.
