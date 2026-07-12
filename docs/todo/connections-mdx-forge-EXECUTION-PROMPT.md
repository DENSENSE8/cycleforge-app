# EXECUTION PROMPT — Connections → MDX Forge + org `ops_plans`

> Paste everything below the line into a fresh Claude Code / Cursor session at the repo root
> (`/Users/icecube/repos/cycleforge-app`). Prefer a focused Phase-1 run (MDX fold + verify) unless
> the human expands scope to Phase 2. Stop at every **HUMAN GATE**.

---

ultracode

# Mission

Execute `docs/todo/connections-mdx-forge-plan.md` in this Cycle Forge codebase.

You are folding the **master-connections** Now→Change inventory into the live agentic
`master-plan.mdx` so it appears on `/forge` (Operations ▸ Plans live), projects into
**org-scoped `ops_plans` / phases / tasks**, and stays compatible with Hermes for **product**
tickets on dogfood org `#1` — while **other orgs** only get adoption checklists via existing
`ops_plans` templates (never per-tenant automated app-code updates).

**Product framing:** Cycle Forge is a sellable multi-tenant B2B warehouse/fulfillment SaaS.
USAV is dogfood (`USAV_ORG_ID` …001). QA is `QA_ORG_ID` …002. Never frame as a 5-person
internal tool. Vendor names (Zoho, …) are connectors behind facades.

**This run’s default scope: Phase 1 only**

1. Extract every HTML `data-check-id` from
   `docs/master-connections-and-refactor/staff-connections-planning.html`.
2. Append `CONN-*` `<TicketStatus />` sections to `./master-plan.mdx` (one `##` per topic).
3. Update hub README + `docs/todo/README.md` index.
4. Verify bridge projection under forge org (USAV) and that QA does not get dogfood MDX seed.

**Phase 2** (`connections_gap_adoption` template + optional `conn-adopt:*` upsert) is **out of
scope unless the human explicitly expands the run** — still read §5 so you do not invent a
parallel goals schema.

# Read first (in this order, before writing)

1. `docs/todo/connections-mdx-forge-plan.md` — **SoT** for this run. Memorize §1 locks, §2 map,
   §4 inventory + MDX shape, §4.5 verify, §4.6 out of scope.
2. `docs/todo/agentic-loop-master-plan.md` §-2 — TicketStatus enum, CRDT shape, forge-org gate
   (do not re-litigate).
3. `CLAUDE.md` + `.claude/rules/source-of-truth.md` + `.claude/rules/backend-patterns.md` +
   `.claude/rules/build-gotchas.md` + `.claude/rules/contextual-display.md` (plan region =
   **Monitor** — do not blend archetypes).
4. Live contracts (extend, don’t fork):
   - `master-plan.mdx` (append — do not wipe ALP / roadmap tickets)
   - `src/lib/master-plan/ticket-status.ts`
   - `src/lib/master-plan/ops-plans-bridge.ts` + `ops-plans-bridge-constants.ts`
   - `src/lib/master-plan/server-doc.ts` (`isForgePlanOrg`)
   - `src/components/forge/MasterPlanView.tsx`
   - `src/lib/ops-plans/templates.ts` (read for Phase 2 awareness)
5. Source inventory:
   - `docs/master-connections-and-refactor/staff-connections-planning.html`
   - `docs/master-connections-and-refactor/staff/*.md`
   - `docs/master-connections-and-refactor/master-index-plan.md`
   - `docs/master-connections-and-refactor/README.md`
6. Skills when triggered: `domain-unit-test` if you touch parsers; `org-scope` if you touch
   bridge/template seed; do **not** invent migrations for goals.

# Current reality (do not invent alternate history)

| Concern | Status |
|---|---|
| Agentic CRDT + `/forge` live console + ops-plans bridge | **SHIPPED** (ALP 0–6) |
| `ops_plans` / phases / tasks / links + RLS | **SHIPPED** (2026-07-08c/d) |
| `ops_goals` table | **DOES NOT EXIST** — do not create |
| Connections HTML interactive planning view | **LIVE file**, not yet in `master-plan.mdx` |
| Staff `01`–`08` Markdown plans | **Already written** — keep as narrative SoT |
| `PLAN_TEMPLATES` | Only `inventory_accuracy_cycle_count` today |
| Forge org seed | USAV `#1` only; QA `#2` empty CRDT room by design |

# Hard invariants (violating any is a failed run)

- **Work on `main` only.** Never create/switch branches. Never `git stash`. Never commit/push
  unless the human explicitly asks — leave the tree for GitHub Desktop.
- **Never commit `.env`.**
- **TicketStatus statuses ONLY:** `pending` \| `in-progress` \| `deployed`. Never invent
  `done` / `blocked` / checkbox status in the tag.
- **Ticket IDs:** `CONN-{html-check-id}` 1:1 with HTML `data-check-id` (see plan §4.2).
- **Do not wipe** existing ALP / roadmap tickets in `master-plan.mdx`.
- **Do not** change `MASTER_PLAN_OPS_TITLE` (`Agentic Loop — Master Plan`) or
  `MASTER_PLAN_TASK_KEY_PREFIX` (`master-plan:`).
- **Do not** widen `isForgePlanOrg` / seed dogfood MDX into QA or customer orgs.
- **Do not** create `ops_goals` or any new goals schema — use `ops_plans*`.
- **orgId** from auth `ctx` / forge gate only — never from request body.
- **Display:** `/forge` plan region stays Monitor; no Staff|Tech dual-mode UI rebuild in Phase 1.
- **Dates:** only via `src/utils/date.ts` if you touch any day buckets (unlikely this run).
- Prefer **short** Now→Change prose in MDX; deep detail stays in staff/tech MD via `href`.

# Authority / scope

You may freely:

1. Edit `master-plan.mdx` to append Connections sections + `CONN-*` chips.
2. Update `docs/master-connections-and-refactor/README.md` (and optionally `staff/INDEX.md`).
3. Index the plan in `docs/todo/README.md`.
4. Add an optional extractor script under `.cycle_forge_ops/scripts/` if it reduces error rate
   (not required if you fold carefully by hand).
5. Run existing unit tests for `ticket-status` / `ops-plans-bridge` / `segments`.
6. Call `GET /api/forge/master-plan` (when env allows) to confirm bridge projection.

You may **not** without an explicit human expand:

1. Implement Hermes code for all `CONN-*` tickets.
2. Phase 2 template / `conn-adopt:*` automation.
3. Delete `staff-connections-planning.html` before Phase 1 verify is green (deprecate in README only).
4. New migrations, new CRDT documents, or a second sync daemon.
5. Rewrite Operations Plans UI or invent `<NowChange />` components.

# Execution sequence (Phase 1)

## Step A — Inventory

1. Parse all unique `data-check-id` values from the HTML (expect ~74).
2. Confirm the set matches plan §4.2; if HTML drifted, trust **HTML** and update the plan doc’s
   inventory table in the same change.
3. Map each id → staff/tech `href` using plan §2.1 tab table.

## Step B — Author MDX

1. Open `master-plan.mdx`. Preserve the header comment + existing ALP / roadmap sections.
2. Append topic sections with headings exactly like:
   - `## Connections — Start`
   - `## Connections — 01 Big picture`
   - `## Connections — 02 Locations`
   - `## Connections — 03 Tickets`
   - `## Connections — 04 Journey`
   - `## Connections — 05 Zoho`
   - `## Connections — 06 Pickup`
   - `## Connections — 07 Pages`
   - `## Connections — 08 Roadmap`
   - `## Connections — Technical`
3. Under each heading, for every check-id in that topic:
   - 1–2 lines: **Now:** … **Change:** … (staff-facing, concise)
   - One self-closing tag:
     `<TicketStatus status="pending" ticketId="CONN-{check-id}" href="…" />`
4. Only use `status="deployed"` when you have clear evidence the gap already shipped in code;
   otherwise leave `pending`. Prefer over-pending to false-deployed.
5. Do **not** put one `##` per ticket — that floods `ops_plan_phases`.

## Step C — Hub docs

1. Update `docs/master-connections-and-refactor/README.md`:
   - Live viewing = `/forge` → Operations ▸ Plans (bridged master plan).
   - HTML = deprecated mirror of the same inventory.
   - Still link staff MD + technical index for 1-on-1s / implementation detail.
2. Add this plan + execution prompt to `docs/todo/README.md` open-plans list.
3. Optional: one pointer line in `staff/INDEX.md`.

## Step D — Verify

1. `node --test` (or project equivalent) for:
   - `src/lib/master-plan/ticket-status.test.ts`
   - `src/lib/master-plan/ops-plans-bridge.test.ts`
   - `src/lib/master-plan/segments.test.ts`
   Add a small fixture assertion if useful: sample MDX with two `CONN-*` tags scans cleanly.
2. If daemon/env available: save `master-plan.mdx`, ensure sync, open `/forge` or Ops Plans live.
3. Confirm forge-org bridge: tasks with `client_event_id` like `master-plan:CONN-start-stories`.
4. Confirm tenancy posture: no code path that seeds dogfood MDX into non-forge orgs.

## HUMAN GATE — after Phase 1

Stop and report:

- Count of `CONN-*` tickets appended
- Any check-ids skipped / already `deployed` with rationale
- Verify results (tests + whether live bridge was exercised)
- Explicit ask: expand to Phase 2 template?

Do **not** start Phase 2 or Hermes ticket implementation unless the human says so.

# Phase 2 notes (only if expanded)

1. Add `connections_gap_adoption` to `src/lib/ops-plans/templates.ts` with station-mapped
   **human** adoption tasks (config/training wording — not “implement recordUnitEvent”).
2. Ensure `from-template` still stamps `organization_id` from `ctx` only.
3. Optional later: on `deployed`, upsert `client_event_id = conn-adopt:{ticketId}` for non-forge
   orgs — never reuse `master-plan:` prefix for adoption rows.
4. Unit-test template shape; do not auto-run Hermes for adoption tasks.

# Adversarial checks (before declaring done)

- [ ] Grep `master-plan.mdx` for invalid TicketStatus values
- [ ] Every HTML `data-check-id` has exactly one `CONN-{id}` (or documented skip)
- [ ] Existing `ALP-*` / roadmap tickets still present
- [ ] No new `ops_goals` / goals migration
- [ ] No `USAV_ORG_ID` fallback introduced in new code
- [ ] README no longer treats HTML as the primary live view
- [ ] Plan §7 Phase 1 checkboxes can be marked with evidence

# Deliverable summary (end of run)

Write a short run report (in chat is enough unless human asks for a file):

1. What changed (paths)
2. Ticket count + section list
3. Verify evidence
4. Remaining Phase 2 / Hermes work
5. Any HTML↔MD drift found

Get the contracts right: **one product MDX**, **org goals = `ops_plans`**, **dogfood codes,
everyone else adopts**.
