# Morning guard sweep

## Spec

Weekday invariant sweep for Cycle Forge (`cycleforge-app`). Run from repo root
`/Users/icecube/repos/cycleforge-app` — never clone or install deps inside this
loop folder.

Checks (all must pass):
1. `pnpm audit-route-auth:check` — route permission manifest matches registry
2. `pnpm schema:drift-guard:check` — Drizzle/schema drift guard
3. `pnpm tenancy:guard:check` — tenancy guard exemptions
4. `pnpm test:ds-guards` — design-system + civil-date guard tests

**Notify:** silent when all four pass. On any failure, write `report.md` in this
folder and message the user with the failing check names + exit codes.

**Product front-matter** (only on failure reports):
- `type:` `alert` (single vocabulary word for this loop)
- `title:` human-readable failure summary
- `date:` `YYYY-MM-DD` (PST calendar day of the run)

## Current understanding

This loop is **workflow-only** (Node subprocess) — no coding agent, no LLM. The
workflow runs all four checks, writes `report.md` on failure, and returns
`message` + `state` for notify/charting.

**Baseline (2026-07-12 first run):** `main` is **not** all-green — 3/4 failed
(`audit-route-auth`, `tenancy-guard`, `ds-guards`); `schema-drift-guard` passed.
Typical failure causes: route-permissions manifest drift, tenancy exemption/violation
drift, or design-system / civil-date guard regressions.

**Noise to ignore in check output:** `.npmrc` `${MOTION_TOKEN}` replacement
warnings on every `pnpm` invocation — benign; workflow strips them from reports.

## Timeline

- **2026-07-12** — First exec run: 3/4 red; `report.md` written; workflow path
  validated (no agent fallback needed).