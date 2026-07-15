---
type: contract
name: verifier
trigger: post-generation (before a ticket flips to `deployed` / a branch merges)
status: active
date: 2026-07-15
---

# Contract — `verifier`

The **independent, read-only check** that a generated change actually does what
its ticket says — run by a *different* role than the one that wrote the code. The
generator never grades its own work. Formalizes the ad-hoc "hunters → refute-by-
default" pass (see `docs/todo/agentic-loop-master-plan.md` run report) into a
standing step.

## Goal
Confirm a change satisfies its ticket's stated spec, or reject it — before it is
marked `deployed`/`resolution_commit` or merged. Done when every confirmed change
passes and every unconfirmed one is sent back as a new generation pass (not fixed
here).

## Trigger
After any generation pass (`forge.sh`, an agent implementing a `master-plan.mdx`
ticket, or a `claude-fix-issue` run), before flipping the ticket to `deployed`.

## Workflow
1. **Read the spec** — the ticket + its plan doc + the manifest's `### VERIFY`
   line. The spec, not the diff, is the oracle.
2. **Run the named verify command(s)** deterministically (`npm run test:*`, etc.).
3. **Run the relevant guards** — `test:ds-guards`, `audit-route-auth:enforce`,
   `schema:drift-guard:check`, and (DB) `tenancy:canary:check`.
4. **DB-touching verify runs on a Neon CoW branch** (`forge-verify-branch.mjs`,
   `assertNotProductionUrl`) — never production `DATABASE_URL`.
5. **Adversarial pass for correctness claims** — spawn N independent skeptics,
   each prompted to **REFUTE**, defaulting to `refuted=true` when uncertain. Kill
   the claim on a majority refute. Give each a distinct lens (correctness /
   security / does-it-reproduce) when a claim can fail more than one way.

## Boundaries / anti-goals
- **Read-only.** The verifier NEVER edits code, "fixes" the bug, or amends the
  change. A failure becomes a *new generation pass*, keeping generator and
  verifier cleanly separate.
- Never point production `DATABASE_URL` at verification — branch only.
- Hard-safety (tenant scoping, status machine, secrets, search waist, `db:push`,
  force-push) is out of bounds regardless — hooks + CI enforce it.

## Generator / verifier
- **Generator (separate role/session):** Architect plan → Coder
  (`.cycle_forge_ops/prompts/`), or an implementing agent.
- **Verifier (this contract):** read-only; the spec-driven checks + refute pass
  above. Distinct model/session from the generator so the check is independent.

## Backlog
`master-plan.mdx` tickets in `in-progress` awaiting verify; `user_reported_issues`
rows not yet `deployed`.

## Notify
- **Pass:** flip the ticket to `deployed` + `resolution_commit`; delete the Neon
  branch. Publish `issue.resolved` where a `user_reported_issues` row is linked.
- **Fail:** keep the branch (TTL + max attempts), report which claims were
  refuted and by which lens, and **do not** mark `deployed`. Re-queue as a
  generation pass.

## Timeline
- 2026-07-15 — Contract authored (P2). Practice already used ad-hoc (agentic-loop
  master-plan adversarial pass: 18 confirmed defects fixed, 2 postures kept).
