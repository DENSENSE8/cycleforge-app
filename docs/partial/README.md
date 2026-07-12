# PARTIAL — started, work remaining

Plans where some phases shipped and real work remains. Completed plans were deleted 2026-07-10
(history lives in git). Trust each doc's verified status banner + `Remaining work — handoff`
section over any older checkbox.

> 👉 **[`HUMAN-TODO.md`](HUMAN-TODO.md)** — single aggregated checklist of everything left that needs a *person*
> (credentials, your data, a running app, or a coordinated deploy). Start there.
> **2026-07-11:** org-login-gate code is done — human add+verify lives in **HUMAN-TODO §J**
> ([`../todo/org-login-gate-EXECUTION-PROMPT.md`](../todo/org-login-gate-EXECUTION-PROMPT.md)).
> Owner-gated migration/env-flip leftovers: [`../todo/README.md`](../todo/README.md).

| Doc | What remains |
|---|---|
| [`relational-backend-reuse-plan.md`](relational-backend-reuse-plan.md) | §3/§5/§6/§7 buildable phases; `recordUnitEvent` retrofit = REDESIGN (bypasses `transition()`); 2/3 raw TSN writers left |
| [`sku-reconciliation-plan.md`](sku-reconciliation-plan.md) | Step B suffix semantics (owner decision); Step A/E union-seed + FK (migration-coupled) |
| [`identity-layer-plan.md`](identity-layer-plan.md) | Owner design decisions: account merge, session collapse, SSO storage — then build |
| [`receiving-scans-stn-link-plan.md`](receiving-scans-stn-link-plan.md) | S5 key design decision; S6 legacy-column drop (deploy-coupled) |
| [`nas-receiving-write-tunnel-plan.md`](nas-receiving-write-tunnel-plan.md) | Code-complete; owner infra: office-Mac agent + Caddy + Vercel env |
| [`dead-code-triage.md`](dead-code-triage.md) | Living triage log; risky knip backlog waves |
| [`DEAD_CODE_CLEANUP_PLAN.md`](DEAD_CODE_CLEANUP_PLAN.md) | Living tracker; Phase 3 waves + Phase 5 detection (deferred) |

Deleted-but-noted residuals (door-classification B2/B3 design calls, tier0 checklist owner items)
are folded into `HUMAN-TODO.md` / the todo index — do not resurrect the deleted docs.
