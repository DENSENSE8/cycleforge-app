# Validation — Gemini's "Cycle Forge Home: Triage & Subscriptions" plan

**Reviewed:** 2026-07-28 · plan at `~/.gemini/antigravity/brain/de45ca61-.../implementation_plan.md`
**Method:** every claim re-checked against `main` (files + line numbers below), then scored against
`polymorphic-tables.md`, `backend-patterns.md`, `contextual-display.md`, and the industry references
the briefing asked for.

**Verdict: ~55% complete. Sound instincts, correct pipeline shape, but it does not deliver the
headline requirement** ("subscribe to SKU X's unbox updates") and its schema has hard violations of
the house polymorphic contract. Do not execute Phases 1–2 as written.

---

## 1. Where Gemini is right — and my briefing was wrong

Both corrections in its D1 are **confirmed**. Credit where due:

| Claim | Verdict | Evidence |
|---|---|---|
| Real Home body is `MyDayWorkspace`, not a `features/home` shell | **Correct** | `src/features/my-day/MyDayWorkspace.tsx:80`, mounted at `src/features/home/HomeWorkspace.tsx:57` |
| "There is no per-staff channel today" is false | **Correct — my error** | `src/lib/realtime/channels.ts:137` `getInboxChannelName(orgId, staffId)` → `org:{orgId}:inbox:{staffId}`; `src/app/api/realtime/token/route.ts:95` grants `['subscribe','publish']` on the caller's own inbox channel |

**Consequence:** D4.6 is right — the realtime substrate needs **zero** new work. That removes a whole
risk area from the briefing. Good catch.

Also correct: deriving the event vocabulary from `ops_events.event_type` + `SIGNAL_KINDS` rather than
inventing a third registry (D4.2); mirroring the `entity_search_outbox` worker (D4.4); hardcoded SLA
evaluators for v1 (Open Questions) — that matches how Datadog Monitors and PagerDuty rulesets both
evolved (fixed conditions first, user-authored rules only after the vocabulary stabilized).

### 1.1 But its own correction is half-wrong

It concludes *"compose over `MyDayWorkspace` rather than rebuilding a new `features/home`."*
`src/app/page.tsx:3` mounts `HomeWorkspace` from `@/features/home`, which renders `<MyDayWorkspace/>`
**only for `mode === 'today'`** (`HomeWorkspace.tsx:57`). So `features/home` is the live shell and
owns the mode rail — which is exactly where a new "Inbox" tab has to be added
(`src/features/home/home-modes.ts`). `TaskInbox.tsx` being orphaned is a separate, true fact.

### 1.2 The fact it missed that breaks its Phase 3

**`/` is parked.** `src/app/page.tsx:26–29`: unless `isParkedSurfaceLive()` (`DOGFOOD_FULL_SURFACE`)
is set, bare `/` **redirects to `/dashboard`**. Only `?welcome=1` or an explicit `?mode=` reaches
Home. So Phase 3 "add Inbox mode to Home" ships a surface no one lands on. The un-park decision
(nav re-add + redirect removal) is a prerequisite the plan never names.

---

## 2. Critical — the plan does not deliver the headline use case

D4.1 defines three subscription types. **D4.3 models only one.**

| Taxonomy declared (D4.1) | Schema provided (D4.3) |
|---|---|
| Entity (many-to-one) — carton #4412 | ✅ `staff_subscriptions` |
| **Scope/Rule (one-to-many) — `SKU=LEN-T480-i5 AND event IN unbox.*`** | ❌ **none** |
| **SLA/latency — "delivered but not received in 24h"** | ❌ **none** |

The two missing kinds are the *entire* reason the request exists. `staff_subscriptions` as written
can only ever answer "who is watching this exact row id" — it structurally cannot express a
predicate. Everything downstream (D4.4's worker join, D5's `/api/subscriptions`, D7's phases)
therefore only implements ⅓ of the system, while the prose implies all three are covered.

**Fix:** one table with a discriminated shape, not three tables.

```
subscription_kind CHECK IN ('entity','rule','sla')
entity_type/entity_id   -- NOT NULL only when kind='entity'
match_event_keys TEXT[] -- notifiable event keys this sub cares about
match_sku TEXT          -- promoted queryable facts as REAL COLUMNS
match_platform TEXT     -- (polymorphic-tables.md: jsonb is for variant config only)
match_station TEXT
match_severity_min SMALLINT
sla_event_key TEXT      -- kind='sla': the arming event
sla_breach_after INTERVAL
sla_resolve_event_key TEXT
```

Promoting `match_*` to real columns (not a jsonb predicate blob) is what lets the fan-out worker do
one indexed join instead of evaluating N predicates in application code per event — and it is what
`polymorphic-tables.md` requires ("promote queryable business facts to real columns; keep only true
variant config in jsonb").

---

## 3. Schema defects vs `polymorphic-tables.md`

D4.3's DDL violates the contract in six places. This doc is a **hard rule**, not a style guide.

| # | Defect | Rule | Fix |
|---|---|---|---|
| 1 | `entity_id TEXT` | Contract: **BIGINT by default**; match parent PK type only when the parent is genuinely UUID | `BIGINT`. Its stated rationale ("like `ops_events`") is unverified — check the column; `entity_signals.entity_id` is `bigint`. TEXT also destroys index selectivity and lets a caller store anything. |
| 2 | **No parent-delete integrity, at all** | "Pick one, don't ship neither": real FK **or** a `TG_ARGV[0]`-dispatch trigger family, one `CREATE TRIGGER` per nameable parent | The CHECK names 6 parents (`order`, `receiving`, `serial_unit`, `shipment`, `repair`, `ops_plan_task`) with zero triggers. This is the **exact `work_assignments` bug the rules doc calls out by name** (5 enum values, 2 triggers, 3 silently dead for months). Also `staff_id INT NOT NULL` has no FK — `staff_messages` has `REFERENCES staff(id) ON DELETE CASCADE`; match it. |
| 3 | `SELECT enforce_tenant_isolation('staff_subscriptions');` | Must be `PERFORM` inside `DO $$ … IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='enforce_tenant_isolation') … END $$;` | Use the skeleton verbatim |
| 4 | No `CREATE TABLE IF NOT EXISTS`, no `BEGIN`/`COMMIT`, no `DO $$ … EXCEPTION WHEN duplicate_object` on the CHECK | Migrations are idempotent by contract | Use the canonical skeleton |
| 5 | `is_active BOOLEAN DEFAULT true` | — | **Design flaw, not just style.** Combined with D7 Phase 2's auto-subscribe, a boolean cannot distinguish *never subscribed* from *explicitly muted* — so the auto-subscriber will re-subscribe a user the moment they act on an entity they just muted. GitHub solves this with a three-state `subscribed / ignored / not-subscribed`; Jira with explicit watcher removal that blocks auto-add. Use `state CHECK IN ('subscribed','auto','muted')`. |
| 6 | No `reason` column | — | GitHub's `reason` (`assigned` / `mentioned` / `subscribed` / `state_change` / `manual`) is what makes an inbox row explainable and is the primary per-category mute axis. Cheap now, expensive to backfill. |

Correct: `organization_id UUID NOT NULL` with no DEFAULT, org-led indexes, named CHECK. Those parts follow the contract.

---

## 4. Critical — reusing `staff_messages` as the delivery ledger is unsound

D4.3 says "reuse and expand `staff_messages`… rather than creating a new ledger." I read the table
(`src/lib/migrations/2026-06-13_staff_messages.sql`). It cannot carry this load:

| Blocker | Evidence |
|---|---|
| `sender_id INTEGER NOT NULL REFERENCES staff(id)` | System notifications have **no sender**. Requires either nullable-ing a NOT NULL column or a synthetic system-staff row — neither is discussed. |
| `body TEXT NOT NULL` + `CHECK (length(btrim(body)) > 0)` | Forces **prerendered text at write time**. GitHub, Linear, and ActivityStreams 2.0 all store a structured `(actor, verb, object, target)` reference and render at read, so a row stays correct when the entity changes. A prerendered body goes stale the moment the carton is re-classified. |
| No entity anchor columns (only `context JSONB`) | Cannot index "all inbox rows for carton 4412" → **the collapse/dedupe in D4.4 is unimplementable** on this table. |
| **No dedupe / idempotency key** | At-least-once worker + no unique key = duplicate notifications on every retry. Violates the house `client_event_id` discipline (`backend-patterns.md`) and is the single most common outbox bug. PagerDuty's `dedup_key` exists for exactly this. |
| No snooze column | D4.8 promises "Snooze (hides for 24h)". `read_at` + `archived_at` cannot express it. |
| Unread and Done conflated | D2's own verdict is *"Separate Done from Unread/Active"* — that needs three states; this table has two. The plan contradicts itself. |
| Hot index is **not org-led** | `idx_staff_messages_recipient_inbox (recipient_id, created_at DESC)` — violates the org-led index rule for anything built on it. |
| Tenant posture is a **retrofit** | RLS came from the wave-2 *backstop* (`2026-06-27b_enforce_tenant_isolation_backstop_wave2.sql:57`), not tenant-from-birth. |

**Fix:** new `staff_inbox_items`, tenant-from-birth, org-led, with
`(organization_id, staff_id, subscription_id, entity_type, entity_id, event_key, reason,
collapse_key, dedup_key UNIQUE, state CHECK IN ('unread','read','done','snoozed'), snoozed_until,
occurred_at)`. Leave `staff_messages` as the human-DM store it was designed to be. Two different
jobs → sibling tables, not one overloaded table (`AGENTS.md`: two shapes for two genuinely different
jobs is correct).

---

## 5. Fan-out pipeline — right shape, four missing pieces

D4.4 is directionally correct (DB trigger → outbox → cron worker, mirroring
`entity_search_outbox`). Gaps:

1. **Mislabeled.** It says *"Fan-out on Read/Cron"* but describes inserting one row per recipient —
   that is **fan-out-on-write**. The label matters because the cost model is inverted. For 5–50 staff
   per tenant, fan-out-on-write is the right call (Linear/GitHub scale reasoning); just name it correctly.
2. **No claim window.** The reference implementation has `claimed_at` + `attempts` +
   `FOR UPDATE SKIP LOCKED` (`2026-07-04a_search_outbox_claim_window.sql:44`,
   `src/lib/search/search-outbox-worker.ts`). Without it, two cron overlaps double-deliver.
3. **"Only if the event type is flagged as notifiable" — where does the flag live?** A DB-side list
   drifts from the code SoT. The search outbox solves this with a documented header + a test pinning
   the DB list against the code list (`ops-events.test.ts` does the same for
   `OPS_EVENT_ENTITY_TYPES`). Require the same pinning test, or the vocabulary silently forks.
4. **No collapse key design.** "5 unbox events on 1 carton = 1 grouped notification" is aspirational
   until you name the key and window. Concretely: `collapse_key = {entity_type}:{entity_id}:{event_family}`,
   window ~60s, newest-wins with an `n×` count — the GitHub thread-collapse / PagerDuty `dedup_key`
   model. Note the worse case the plan doesn't model: a **rule** subscription on a SKU matches every
   line of a 200-line PO receive, so collapse must key on the *carton*, not the line.

---

## 6. Permissions — a real leak, mislabeled

D4.7 calls the worker check "read-time." **It is write-time** for the inbox row. If a staffer's
permission is revoked *after* delivery, the rows persist and stay visible — the exact leak the
section claims to prevent.

GitHub filters notifications at **render**, not only at fan-out. Fix: filter in **both** places —
worker as a cheap prefilter, and `GET /api/inbox` as the authoritative gate against
`src/lib/auth/permission-registry.ts`. Name the permission ids per entity type in the plan.

---

## 7. Information architecture (D3) — thin, and it breaks a shipped contract

Missing everything the briefing asked for: no `pickArchetype()` Q1→Q4 reasoning, **no Monitor
region anywhere** (the whole Home is declared Workbench, silently dropping the org-wide rollup /
"overall to-do list" the request names), no loading / error / no-permission states (only empty), no
mobile-floor or TV variant, no motion contract (which single region crossfades — `motion-crossfade.md`
requires exactly one), no density justification (all `ops`, unargued), and a one-line URL "contract"
rather than a param-ownership table.

**Breaking change not called out:** the shipped rail is
`HOME_MODE_ITEMS = today | tasks | collab | forge | brief` (`src/features/home/home-modes.ts`).
D3 proposes `Today | Inbox | Tasks | Collab` — dropping `forge` and `brief`. But `src/app/page.tsx`
deep-links `?mode=` explicitly so `/forge → /?mode=forge&view=live` lands, and
`HomeWorkspace.tsx` renders the forge console. Removing `forge` breaks a live redirect.

**Unresolved tension:** D2 rejects customizable views because "operators need muscle memory" — yet
the product requirement *is* per-staff subscriptions, which are per-user views. The resolution
(fixed tab set; user-defined subscriptions as *filters feeding* the fixed Inbox tab, with saved
subscription chips rather than saved tabs) is the right answer but the report never states it.

---

## 8. Industry comparison (D2) — the weakest section

Four products, no citations, no scoring, and it omits precisely the references that solve its own
open gaps:

| Missing reference | What it would have fixed |
|---|---|
| **PagerDuty / Opsgenie** | `dedup_key` + alert grouping windows → §5.4 collapse; escalation + routing rules → SLA design |
| **Novu / Knock / Courier** | The preference matrix (category × channel × frequency), digest windows, quiet hours — D4.5 has none of these |
| **ActivityStreams 2.0** | `(actor, verb, object, target)` — the exact ledger shape §4 shows is missing |
| **Slack batching / Jira watchers** | Batching windows; explicit watcher removal that survives auto-add (the §3 defect #5 bug) |

Notification-fatigue mitigations listed are only "debounce + unsubscribe." Industry standard adds:
per-category frequency, quiet hours, priority tiers (only SLA breaches may interrupt), and a
**default-off posture for rule subscriptions** (opt-in, since one bad rule floods an operator).

---

## 9. Backend / components / phasing

**D5** omits, all explicitly required by the briefing: permission-registry ids + matching
`route-permission-manifest.test.ts` rows, `after()` for side-effects, `Deps` injection for DB-free
tests, `clientEventId` idempotency on `POST /api/subscriptions`, and the 409 mapping.

**D6 has a category error.** "Inbox Row composes `ActivityInboxContext` + `TimelineSection`" —
`ActivityInboxContext` is a React context (`src/contexts/ActivityInboxContext.tsx`), not a row
primitive, and `TimelineSection` is the read-only history block, not an actionable row. Correct
composition: house one-row anatomy + `RowMetaColumns` + `CopyChip` family + `HoverTooltip`, or
`LedgerGrid` via `useGridSurface` if it is genuinely a grid. `EmptyState` does exist at
`src/design-system/primitives/EmptyState.tsx` (D3 names it without a path).

**D7 Phase 1 is not independently shippable** — DB + pipeline + APIs with no UI delivers zero user
value, and the briefing required Phase 1 to stand alone. Better cut: **Phase 1 = one entity type,
end-to-end** (subscribe toggle on cartons → outbox → worker → inbox list), behind a per-org flag via
`resolveForOrg()` (the repo's staged-rollout helper — the plan names no flag at all). Also missing:
per-phase rollback, the `/` un-park decision (§1.2), and an injectable clock in the SLA evaluator
`Deps` — without it the Phase 4 "time-travel simulation" E2E cannot be written.

---

## 10. What to send back to Gemini

Ranked. Items 1–4 are blocking.

1. **Model all three subscription kinds** in one discriminated table with promoted `match_*` columns
   — the SKU-rule case is the headline requirement and is currently unbuildable (§2).
2. **Fix the DDL** against `polymorphic-tables.md`: BIGINT `entity_id`, parent-delete trigger family
   (one per CHECK value) + `staff_id` FK, guarded `PERFORM enforce_tenant_isolation`, idempotent
   skeleton, three-state `state` instead of `is_active`, add `reason` (§3).
3. **New `staff_inbox_items` ledger** — do not overload `staff_messages`. Must carry
   `dedup_key UNIQUE`, `collapse_key`, structured entity anchor, and separate unread/done/snoozed (§4).
4. **Permission filter at read time too**, not only in the worker (§6).
5. Add claim window + attempts + `SKIP LOCKED`; a pinning test for the notifiable-event list; a
   concrete collapse key/window that keys on carton for bulk receives (§5).
6. Rebuild D3 with `pickArchetype()` per region, a Monitor rollup region, typed empty/loading/error
   states, motion target, mobile/TV variants — and reconcile with the shipped
   `today|tasks|collab|forge|brief` rail rather than silently dropping `forge` (§7).
7. Extend D2 with PagerDuty/Opsgenie, Novu/Knock, ActivityStreams 2.0, Slack batching — with
   citations — and add quiet hours + per-category frequency + default-off rule subs (§8).
8. Re-cut Phase 1 to one end-to-end vertical slice behind `resolveForOrg()`; add the `/` un-park
   prerequisite and an injectable clock (§9).

**Answer to its "User Review Required":** building in-house on the existing outbox + Ably is correct
here — the realtime half already exists (§1) and a vendor would duplicate the tenant boundary. The
one place buy wins is **email digest deliverability**; keep that seam swappable behind
`src/lib/email/send.ts` rather than adopting a full notification vendor.

**Answer to its Open Question:** hardcoded SLA evaluators for v1 is right — but ship the `kind='sla'`
rows in the table from day one so v2's user-authored rules are a UI change, not a migration.
