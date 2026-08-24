# Cycle Forge — agent instructions

**Status: mid-refactor.** The app is being rebuilt from a page-oriented SaaS into
a **Warehouse OS** — a HUD shell with sessions, tabs, tools and a tiling canvas.

The previous constitution (AGENTS.md, `.claude/rules/**`, `docs/rules/**`, the SoT
manifest, the design-law lint rules and the SoT PreToolUse hook) was **deleted on
2026-08-21** at the operator's instruction. It described the architecture being
replaced, so following it would actively fight the refactor. It is all recoverable
from git history if a specific rule turns out to be worth keeping.

**Do not re-add house laws, guards, ratchets, or SoT doctrine.** New invariants get
written only after the surface they govern exists in code, and only when asked.

## Where the plan lives

- [`docs/warehouse-os/`](docs/warehouse-os/) — the refactor spec, phases, and repo map.

## The few rules that survived (and why)

These are security / correctness / process, not design taste:

- **Never commit `.env`.** A PreToolUse hook in `.claude/settings.json` blocks
  writes to secret paths. Do not bypass it.
- **Never start, restart, or kill a dev server.** The operator owns `:3050` —
  attach to it, never spawn one. A broken dev server is a report, not a repair.
- **The operator manages commits.** Stage only files you changed (`git add -A`
  sweeps other sessions' work). Never `git stash`. Commit/push only when asked.
- **`orgId` comes from `ctx.organizationId`, never the request body.** Org-scoped
  writes go through `withTenantTransaction` (`src/lib/tenancy/db.ts`).
  `scripts/tenancy-guard.ts` is a live RLS-bypass check and stays.
- **Migrations land before the code that reads them** (expand → code → contract).
  A nullable `ADD COLUMN` is always safe to ship early; the reverse never is.
- **`npm run verify` before done** — lint · typecheck · unit. That is the whole
  automated gate set.

## Verify

```bash
npm run verify        # lint + typecheck + unit
npm run verify --fast # lint + typecheck (inner loop)
```
