# Implementation plan — Watch-a-view: queue-threshold alerts + digests

**Owner:** unassigned · **Lane:** `main` (dogfood) · **Status:** PLAN — awaiting go on Phase 0.
**Research:** `docs/todo/view-threshold-alerts-and-digests-GEMINI-RESEARCH-BRIEFING.md` (+ Gemini ruling, validated against the codebase audit 2026-08-09).
**Feature:** an operator can **watch** a saved view / queue and be alerted when its count crosses a threshold or an item ages past a bound, plus receive a **scheduled digest** — composing the existing notification engine.

---

## Locked decisions (from the validation pass — do not re-litigate in build)

| # | Decision | Rationale |
|---|---|---|
| **B — snapshot, not FK** | A monitor **snapshots** the view's `surface` + filter params at arm time. `source_view_id` is **informational only** (`ON DELETE SET NULL`), never an evaluation dependency. | Only option where the watch **survives** a personal view being renamed/deleted (P7). Matches how `saved_views` already persists params. |
| **Dedicated `view_monitors` table** | Trigger definitions + **runtime state** live in a new table; it **emits into the existing `notification_outbox` → `staff_inbox_items` → Ably** pipeline (and `assign-inbox-item`/`/api/tasks` for tasks). | View-monitors carry evaluation state (`breached`/`last_value`/`breached_at`) that event-subscriptions don't; `stock_alerts` is the internal precedent. "One pipeline" (P8) is about **delivery**, which is reused — not the trigger table. |
| **Hybrid evaluation, reuse counts** | 5-min cron; a mapped facet resolves via the **existing** `unshippedQueueCountsQuery` / `outbound-metrics`; only custom facet combos hit a bounded fallback query. Cap watches/org. | Neon CU-hours are a real budget; "raw arbitrary view SQL every 5 min per watch per org" would blow it (P6). |
| **Hysteresis mandatory** | Edge-trigger: fire once on crossing → `breached`; no re-fire until value drops below `recovery_value` **or** `cooldown_interval` expires; emit **recovery** on clear. | #1 alerting failure mode is fatigue (P2). |
| **`item_aging` is a `view_monitor` type, not the `sla` kind** | View-membership age = a periodic aggregate (`count where age > T`), **not** the existing entity-event-absence `sla` walker. | The existing `sla` subscription watches one record's event gap — a different evaluation. |
| **Configurable output** | Per-monitor `action_type`: `inbox_notification` **or** `throw_task`. | A 40-item queue needs a glance; an SLA breach needs an owner (P1). |
| **Digest = a monitor** | `threshold_type = scheduled_digest` + `cadence`. | Maximizes reuse; Jira/Salesforce subscription model. |
| **Personal-only MVP** | Owner = recipient (self-notify). Shared-to-role is the **sibling** "role/shift view assignment" project. | Ships fastest; no cross-staff assign permission needed yet. |

**Explicit non-goals (V1):** rate-of-change/derivative alerts · composite monitors (A AND B) · email/SMS delivery · escalation policies · a time-series store (run SQL counts on live tables).

**Ordering law:** expand → code → contract. The migration lands and is applied **first**; code that references the new columns comes **second** (`column-reference.guard.test.ts`).

---

## Phase 0 — Flag + schema + pure evaluator core

**Goal:** the durable state machine, gated, testable with zero DB/UI.

**Deliverables**
- [ ] Feature flag `isViewMonitors()` in `src/lib/feature-flags.ts` + a `FLAG_LIFECYCLE` entry (`bornAt: 2026-08-10`, disposition `rollout`, `plannedRemoval`, `area`), seeded **ON for the dogfood org only**.
- [ ] Migration `src/lib/migrations/2026-08-10_view_monitors.sql`: `view_monitors` table — `organization_id NOT NULL` + `enforce_tenant_isolation('view_monitors')`; owner `staff_id`; `source_view_id` (FK → `saved_views` `ON DELETE SET NULL`); snapshot `monitor_surface TEXT` + `monitor_params JSONB`; named-CHECK `threshold_type` (`count_above`·`count_below`·`item_aging`·`scheduled_digest`), `threshold_value NUMERIC`, `recovery_value NUMERIC NULL`, `cooldown_interval INTERVAL`, named-CHECK `action_type` (`inbox_notification`·`throw_task`), `cadence TEXT NULL`; state `monitor_state` (named-CHECK `armed`·`breached`, default `armed`), `last_value NUMERIC NULL`, `last_evaluated_at`/`breached_at`/`last_fired_at TIMESTAMPTZ NULL`; org-led index `(organization_id, staff_id)` + partial index on `monitor_state='breached'`. Idempotent (guarded `DO`-blocks), expand-only.
- [ ] Drizzle model for `view_monitors` added in the **same** change.
- [ ] Pure `evaluateViewMonitor(def, state, currentValue, now) → { fire?: 'breach' | 'recovery', nextState }` (`src/lib/monitors/evaluate.ts`) — Deps-free; edge-trigger + `recovery_value` hysteresis + `cooldown_interval`; handles `count_above`/`count_below`/`item_aging`.
- [ ] Unit tests (`node:test` + `tsx`): fires **once** on crossing; **silent** while breached; **recovery** on drop below `recovery_value`; **cooldown** suppresses re-fire; `item_aging` path; all pass under `TZ=UTC`.

**You can verify:** `npx tsx --test src/lib/monitors/evaluate.test.ts` enumerates and passes the hysteresis cases; the migration is applied (`\d view_monitors` shows the columns + CHECKs); `npm run verify` is green.

---

## Phase 1 — Value resolver (reuse existing counts, bounded cost)

**Goal:** compute a monitor's current value cheaply.

**Deliverables**
- [ ] `resolveMonitorValue(def, deps) → number` (`src/lib/monitors/resolve-value.ts`) — maps snapshotted `(monitor_surface, monitor_params)` → count / min-age via the **existing** `unshippedQueueCountsQuery` / `outbound-metrics.ts` for known outbound facets; a **bounded** fallback query for custom combos. Deps-injectable.
- [ ] `MAX_VIEW_MONITORS_PER_ORG` constant + enforcement at arm time.
- [ ] Parity test: a monitor over the **Pending** facet returns the same number `/api/orders/queue-counts` reports.

**You can verify:** the PR carries a short **cost note** (the mapped case issues the pre-existing count query — no new per-row scan) and the parity test passes; `neon-cost-reviewer` is clean on the evaluator.

---

## Phase 2 — Cron evaluator → delivery (fires end-to-end)

**Goal:** monitors actually fire, with hysteresis, into the inbox/tasks.

**Deliverables**
- [ ] `GET /api/cron/view-monitors` — `CRON_SECRET`-gated, **session-less service-org** per-tenant loop (mirrors `/api/cron/stock-alerts`); registered in `vercel.json` at `*/5 * * * *`.
- [ ] Per active monitor: `resolveMonitorValue` → `evaluateViewMonitor` → on **breach** emit to `notification_outbox` (`inbox_notification`) **or** `assign-inbox-item`/`/api/tasks` (`throw_task`), carrying a **dedupe key** (`view_monitor:{id}:{breachedAt}`); persist `monitor_state`/`last_value`/`breached_at`/`last_fired_at`/`last_evaluated_at`. On **recovery** emit a recovery event + reset to `armed`.
- [ ] Live fan-out via `publishInboxItem` unchanged.

**You can verify (live):** arm "Pending > N"; drive the queue over N → within one 5-min cycle **exactly one** inbox item (bell + Home → Inbox); hold above → **no** re-fire; drop below `recovery_value` → a **Recovered** item; back above → a **new** fire.

---

## Phase 3 — Arm UX on the Band-3 Bookmark control

**Goal:** operators create/manage watches from the just-shipped Views control.

**Deliverables**
- [ ] **"Watch this view…"** item in `WorkbenchViewsMenu` (`SavedViewsList`) → a config popover (threshold type · value · `recovery_value` · `action_type`), which **snapshots the view's current params** into a monitor (decision B). House flush ops chrome (`HeaderChromeMenu`), no new design language.
- [ ] `POST` / `GET` / `DELETE /api/view-monitors` — house route skeleton (`withAuth` + the surface's own view permission e.g. `dashboard.view`; Zod validate; domain helper; `recordAudit`; `after()`). Permission wired in `permission-registry.ts` + `route-permission-manifest.test.ts` (`new-route` skill / `permission-registry-guard`).
- [ ] A **"Watched"** management list (view / edit / delete active monitors).

**You can verify (live):** arm a watch from the Bookmark menu; then **delete the source saved view** — the monitor **still fires** (proves snapshot, not FK). Editing threshold/recovery persists.

---

## Phase 4 — Digest (scheduled monitor)

**Goal:** a scheduled queue summary.

**Deliverables**
- [ ] `threshold_type=scheduled_digest` + `cadence`; a daily cron leg compiles a **per-recipient** bundle — for each of the staffer's watched views: current count · Δ vs prior evaluation · oldest item — into **one** inbox item.
- [ ] Opt-in; scoped strictly to the recipient's own monitors.

**You can verify (live):** set a digest at a near-time cadence; receive **one** inbox item bundling your watched queues with counts + deltas.

---

## Phase 5 — Guards + E2E + ship-ready

**Goal:** lock the invariants; prove on the QA org.

**Deliverables**
- [ ] Guards: (a) evaluation reads snapshotted `monitor_params`, **never** joins `source_view_id` to resolve the value (snapshot invariant); (b) the evaluator **reuses** the existing count query for mapped facets; (c) hysteresis columns present + honored. Shrink-only where a ratchet applies.
- [ ] E2E on the **QA org** (`qa-desktop`, `QA_FIXTURE_*`): arm → drive count → assert **exactly one** `staff_inbox_items`; assert no re-fire while breached; assert recovery.
- [ ] `npm run verify` green; `neon-cost-reviewer` clean; flag ready to widen past dogfood.

**You can verify:** CI is green and the E2E + guard names appear in the PR; the E2E asserts against `QA_FIXTURE_*`, never dogfood row counts.

---

## Module map (compose these — do not fork)

| Concern | Module |
|---|---|
| Trigger table + state | **new** `view_monitors` (migration `2026-08-10`) + Drizzle model |
| Pure evaluator | **new** `src/lib/monitors/evaluate.ts` (+ test) |
| Value resolver | **new** `src/lib/monitors/resolve-value.ts` over `src/lib/dashboard/outbound-metrics.ts` · `unshippedQueueCountsQuery` (`@/lib/queries/dashboard-queries`) · `/api/orders/queue-counts` |
| Cron | **new** `src/app/api/cron/view-monitors/route.ts` (pattern: `src/app/api/cron/stock-alerts/**`) + `vercel.json` |
| Delivery (reuse) | `notification_outbox` + `staff_inbox_items` (`2026-07-28d`) · `publishInboxItem` (`src/lib/realtime/publish.ts`) · `assign-inbox-item.ts` · `/api/tasks` |
| Arm/manage API | **new** `src/app/api/view-monitors/route.ts` (+ permission registry + manifest test) |
| Arm UX | `src/components/saved-views/WorkbenchViewsMenu.tsx` · `SavedViewsList.tsx` · `src/hooks/useSavedViews.ts` |
| Flag | `src/lib/feature-flags.ts` + `src/lib/feature-flags-lifecycle.ts` |

---

## Cost budget (hold the line)

- 5-min interval; `MAX_VIEW_MONITORS_PER_ORG` cap; mapped facets reuse the pre-computed count query (zero new scans); fallback query is bounded + only for custom combos. Track evaluation CU-hours after Phase 2 rollout on the dogfood org before widening the flag. If cost regresses, move mapped-facet counts to an event-driven counter before broadening — do **not** raise the interval past 5 min silently.

---

## Sign-off gates

Each phase is independently verifiable above. Recommended checkpoints: **after Phase 0** (schema + core state machine correct), **after Phase 2** (it fires correctly, live, with hysteresis), and **after Phase 5** (guarded + E2E on QA). I will pause for your go before starting Phase 0, and again before widening the feature flag past the dogfood org.
