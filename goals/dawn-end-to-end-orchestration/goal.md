# Dawn End-to-End Implementation

Act as the implementing agent for building Dawn fully end-to-end in this workspace. Implement the vertical slices yourself in dependency order, keep the Cloudflare-first domain/app architecture intact, apply the zero-tech-debt posture from the accepted facts, and do not spawn or delegate to worker agents unless the user explicitly asks for that later.

Use `facts.md` as the shared understanding for scope, autonomy, architecture invariants, verification standards, and completion boundaries. Use `plan.md` as the execution plan and keep implementation progress tracked under `docs/work` as work lands.

Done means the full Dawn end-state scope from AGENTS.md, CONTEXT.md, CONTEXT-MAP.md, docs/PRD.md, docs/work/IMPLEMENTATION-PRD.md, and docs/work/VERTICAL-SLICES.md is implemented, relevant checks pass, docs and ADRs match the delivered system, verified commits or checkpoints exist for completed work, and no required slice remains incomplete.
