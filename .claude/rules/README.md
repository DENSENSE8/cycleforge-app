# Rules — two tiers

**Tier 1 — always-on (this directory).** Root `AGENTS.md` plus the cross-cutting
files beside this one. These load into *every* session, so they hold only what an
agent needs regardless of which surface it is touching: how to finish a task
(`verify.md`), how not to damage the tree (`workflow-safety.md`), server
correctness (`backend-patterns.md`), compose-don't-fork (`pattern-evolution.md`),
silent build traps (`build-gotchas.md`), and the house identity + its router
(`kinetic-ledger.md`).

**Tier 2 — on-demand ([`docs/rules/`](../../docs/rules/)).** Surface depth:
region contracts, the source-of-truth tables, the design system, and every
`display/*` recipe. **Read the one your task touches.** It is not loaded for you.

The `*.md` files in this directory that are three lines long are **pointers**, not
content — they exist so the ~526 references to `.claude/rules/…` in source
docblocks and `docs/` keep resolving. Follow them.

## Why the split (2026-08-19)

The corpus reached 10,462 always-on lines. Almost none of it applies to any given
task, and `kinetic-ledger.md` already declared the depth on-demand — the loader
just ignored that, because everything under `.claude/rules/**` is a project
instruction. Moving Tier 2 out makes the declared model real: **690 always-on
lines instead of 10,462, with nothing deleted.**

Adding a file here puts it in every future session's context. Prefer
[`docs/rules/`](../../docs/rules/) unless it is genuinely task-independent.
