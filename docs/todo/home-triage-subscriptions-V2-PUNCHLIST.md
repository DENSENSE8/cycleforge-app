# v2 validation — punch list

**Verdict: design is APPROVED. The DDL is not.** All four v1 blockers are conceptually resolved.
What remains is executional — but **three defects are new regressions introduced in v2**, and one is a
cross-tenant correctness bug. Fix the punch list below and this is executable; no third full round needed.

---

## Resolved in v2 — do not revisit

| v1 blocker | Status |
|---|---|
| Only 1 of 3 subscription kinds modeled | **Fixed** — single discriminated table, real `match_*` columns |
| `staff_messages` reused as ledger | **Fixed** — dedicated `staff_inbox_items`, ActivityStreams shape, dedup + collapse + 4-state triage |
| Permission leak (write-time only) | **Fixed** — dual gate, worker prefilter + authoritative `GET /api/inbox` |
| Fan-out mislabeled, no claim window | **Fixed** — named fan-out-on-write, `FOR UPDATE SKIP LOCKED`, pinning test, concrete `collapse_key` keyed on carton |
| Phase 1 not shippable | **Fixed** — Phase 0 un-park + Phase 1 one entity type end-to-end behind `resolveForOrg()` |
| D3 thin / `forge` dropped | **Fixed** — `pickArchetype()` reasoning, Monitor region named, `forge`+`brief` retained, motion + typed states + param ownership |
| D2 tension (fixed tabs vs per-user views) | **Fixed** — fixed tabs, subscriptions as **filter chips on the Inbox tab** |

---

## P0 — correctness bugs, fix before any migration is written

### 1. `dedup_key TEXT UNIQUE NOT NULL` is a global unique → cross-tenant bug
`polymorphic-tables.md` rule 4 is explicit: *"Every unique or partial-unique index leads with
`organization_id` … never a global unique on the polymorphic key alone."*

This isn't only a style violation. Two orgs generating the same `dedup_key` (likely — it will be
built from `entity_type:entity_id:event_key`, and ids collide across tenants) means **org B's
notification is silently swallowed** by org A's row. Silent data loss across a tenant boundary.

**Fix:** `CREATE UNIQUE INDEX ux_staff_inbox_items_dedup ON staff_inbox_items (organization_id, staff_id, dedup_key);`
and drop the inline `UNIQUE`.

### 2. The `entity_type` discriminator lost its CHECK — regression from v1
v1 had `CHECK (entity_type IN ('order','receiving','serial_unit','shipment','repair','ops_plan_task'))`.
v2's `staff_subscriptions` has `entity_type TEXT` bare, and `staff_inbox_items.entity_type` likewise.
Rule 1: *"**Never** ship a discriminator as unconstrained free text"* — and it must be a **named**
constraint so it can be guarded and altered later:

```sql
DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_entity_type_chk
    CHECK (entity_type IS NULL OR entity_type IN (...));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
Same for `staff_inbox_items`. Derive the value list from `OPS_EVENT_ENTITY_TYPES` (`src/lib/ops-events.ts`)
and pin it with a test, exactly as `ops-events.test.ts` pins that CHECK today.

### 3. Parent-delete integrity is still a comment, not DDL
v2 replaced the missing triggers with `-- Triggers … must be defined here` plus one example. The
contract requires **one `CREATE TRIGGER` per value the discriminator can name**, sharing one
`TG_ARGV[0]`-dispatch function — and the rules doc calls out by name what happens when you ship
partial coverage (`work_assignments`: 5 values, 2 triggers, 3 silently dead for months). Write all of
them, or explicitly document per value why it is skipped, in the migration comment. `staff_inbox_items`
needs the same treatment — it carries the same polymorphic pair.

### 4. `staff_inbox_items` has no `enforce_tenant_isolation()` call
It is a trailing comment (`-- enforce_tenant_isolation, indexes …`). Tenant-from-birth is rule 7 and
must be a real guarded `DO $$ … PERFORM …` block **in the same migration that creates the table**.
The changelog claims the polymorphic rules are satisfied; this table does not satisfy them.

---

## P1 — functional gaps that make the headline feature slow or unbuildable

### 5. Rule subscriptions have no matching index — the join you designed for can't happen
D4.3's whole justification for real columns was *"efficient indexed joins in the fan-out worker."*
But the only index shipped is
`(organization_id, subscription_kind, entity_type, entity_id)` — which serves the **entity** case
only. Matching `SKU = LEN-T480-i5` against every rule subscription per event is a seq scan.

**Fix:** add the predicate indexes, partial on kind:
```sql
CREATE INDEX IF NOT EXISTS idx_staff_subs_rule_sku ON staff_subscriptions (organization_id, match_sku)
  WHERE subscription_kind = 'rule' AND state <> 'muted';
CREATE INDEX IF NOT EXISTS idx_staff_subs_rule_events ON staff_subscriptions USING GIN (match_event_keys)
  WHERE subscription_kind = 'rule';
```
Then **show the actual worker match query** in D4.4 — right now D4.4 describes only the collapse step
and never says how a rule subscription is selected for an event. That is the SKU-unbox use case.

### 6. Duplicate-subscription unique index was dropped — regression
v1 had `UNIQUE (organization_id, staff_id, entity_type, entity_id)`. v2 has none, so one staffer can
accumulate N rows for the same carton and receive N notifications per event. Restore it as a partial
unique for the entity kind:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_subs_entity
  ON staff_subscriptions (organization_id, staff_id, entity_type, entity_id)
  WHERE subscription_kind = 'entity';
```

### 7. `notification_outbox` is referenced but never defined
D4.4 step 1 writes to it; no schema, no `attempts`/`claimed_at`/`processed_at` columns, no partial
unique on pending. Mirror `entity_search_outbox` + `2026-07-04a_search_outbox_claim_window.sql` and
show the DDL.

### 8. `/api/subscriptions` is still entity-shaped
It's described as a `POST`/`DELETE` **toggle**. A toggle verb cannot create a rule subscription with
six predicate fields, or an SLA subscription with arm/disarm/interval. Split the contract: toggle for
`kind='entity'`, full create/update for `rule` and `sla`, with the Zod schema per kind and the
404/409 mapping (`backend-patterns.md`).

### 9. Still missing after two asks: permission-registry wiring
The briefing and the revision prompt both required the new `permission-registry.ts` ids **and** the
matching `route-permission-manifest.test.ts` rows. Still absent in D5. Without them the
`audit-route-auth` gate in `npm run verify` fails and the phase can't land.

---

## P2 — smaller, fix in review

- `CREATE INDEX` without `IF NOT EXISTS` (both tables) — breaks migration idempotency on re-run.
- `DO $$ BEGIN CREATE TABLE IF NOT EXISTS … EXCEPTION WHEN duplicate_object` — the guard belongs on
  the `ALTER TABLE … ADD CONSTRAINT`, not around `CREATE TABLE IF NOT EXISTS` (which is already idempotent).
  No `BEGIN`/`COMMIT` wrapper on either migration.
- `created_at TIMESTAMPTZ DEFAULT NOW()` → house form is `NOT NULL DEFAULT now()`; add `updated_at` per the skeleton.
- `staff_inbox_items.occurred_at DEFAULT NOW()` — should carry the **event's** timestamp, not insert time,
  or the timeline ordering drifts from `ops_events`.
- Collapse needs storage: add `collapse_count INT NOT NULL DEFAULT 1` + `last_event_at` so the "n×" roll-up
  the design promises can actually render.
- **D4.6 Realtime vanished** in v2 (numbering jumps D4.5 → D4.7). Restore it — the "no new token work
  required" finding is the plan's best de-risking result and shouldn't be lost.
- Typed states list 3 (`Ready`/`Error`/`Not Authorized`); the briefing asked for 4 — **first-use** and
  **no-results** are different empties with different CTAs (`workbench.md`).
- **The Monitor region has no home.** D3 asserts Home is "Workbench + Monitor" but the Monitor rollup
  appears in no tab and no layout slot. Say where it lives — a strip above the tabs, or its own tab.
- D2 still has **no citations and no scored matrix**, asked for twice.
- No per-phase rollback in D7, asked for once.
- The changelog overstates: it claims "fixing all 6 `polymorphic-tables.md` violations" while dropping
  the discriminator CHECK, leaving triggers as prose, and adding a global unique. Ask for accuracy —
  an overstated changelog is how these get merged unreviewed.

---

## Sequencing objection — Phase 0

Un-parking `/` **before** the Inbox exists ships a half-built Home to every staffer, and the
`DOGFOOD_FULL_SURFACE` gate is what's protecting you today. Invert it: keep `/` parked, build Phase 1
behind `resolveForOrg()`, and un-park as the **last** step of Phase 1 once the Inbox tab renders.
Phase 0 then becomes "nav + redirect removal, flag-gated" rather than a prerequisite.

---

## Answers to its two escalations

**User Review (real columns for predicates):** **Approved.** It is what `polymorphic-tables.md`
requires ("promote queryable business facts to real columns; keep only true variant config in jsonb"),
and it is what makes P1 #5's indexed match possible. Keep a `match_extra JSONB` escape hatch for
genuinely variant config only — not for anything the worker filters on.

**Open Question (`match_event_keys` — exact strings vs wildcard tree):** its recommendation — exact
string arrays for v1, wildcard expansion in the app layer before insert — is **right**, and matches
how PagerDuty and Datadog both handle event routing. One amendment: expand wildcards at
**subscription write time and re-expand on vocabulary change**, otherwise a rule created as
`receiving.*` silently misses any event key added later. Add that re-expansion to the pinning test
that already guards the notifiable-event list.
