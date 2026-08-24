# Data model — sessions, the event spine, and governance

**Written 2026-08-22.** The answer to three questions asked together: should a
session carry a polymorphic link to the lines it works, how many tables should
this end up as, and what is missing for AI governance.

Every number here was measured against the tree, not estimated.

---

## 1 · The polymorphic link — do not add it

> *"Would it be best to polymorphically link to the current context — the
> receiving lines and the ready-to-pack lines?"*

**No.** Three reasons, in order of how much they cost to ignore.

### 1.1 "Ready-to-pack lines" is not a table

It is a **status** and a nav mode, not an entity:

- [`src/lib/order-lifecycle.ts`](../../src/lib/order-lifecycle.ts) — `'TESTED' // passed tech scan — ready to pack`
- [`src/lib/sidebar-navigation.ts`](../../src/lib/sidebar-navigation.ts) — "Ready to Pack" is a child page of the testing station

So the two things named are not peers. `receiving_lines` is a table (with seven
satellites). Ready-to-pack is a stage an order passes through. There are no
ready-to-pack rows to point at.

### 1.2 The cardinality is wrong for a column

A receiving session works a whole PO — **N** `receiving_lines`. A pack session
packs **N** units. One `entity_id` on the session cannot hold N, and promoting it
to a junction table rebuilds something that already exists (§1.3).

### 1.3 The link already exists, twice

**`ops_events`** has carried the polymorphic subject since `2026-06-30`:

```sql
entity_type text NOT NULL,   -- 'receiving' | 'receiving_line' | 'serial_unit' | ...
entity_id   bigint NOT NULL
-- idx_ops_events_org_entity_time (organization_id, entity_type, entity_id, occurred_at DESC, id DESC)
```

and `2026-08-23b` added `session_id` + `session_type`. So *"what did this session
touch"* is already a query against facts, not a second assertion to keep in sync:

```sql
SELECT DISTINCT entity_type, entity_id
  FROM ops_events
 WHERE session_id = $1 AND organization_id = $2;
```

**`agent_mutation_affects`** (`2026-07-03o`) is the precedent for the other
shape — one container, N polymorphic targets — via `target_kind` + `target_ref`,
indexed in both directions, and explicitly *"refs may dangle after target
deletion by design."*

The repo has solved this twice. Neither answer was a column on the parent.

### 1.4 The external research points the same way

- [GitLab's database guidelines](https://docs.gitlab.com/development/database/polymorphic_associations.html)
  recommend against `entity_type`/`entity_id` on a parent outright: no foreign-key
  constraints are possible, the string type column wastes bytes per row, and the
  planner degrades once a query must filter on both columns.
- [Hashrocket](https://hashrocket.com/blog/posts/modeling-polymorphic-associations-in-a-relational-database)
  notes the exclusive-arc alternative (N nullable FKs + a CHECK) does buy real
  referential integrity but "gets cumbersome past three types" — there are
  **nine** `OPS_EVENT_ENTITY_TYPES`.
- The 2026 event-sourcing consensus
  ([postgresql-event-sourcing](https://github.com/eugene-khyst/postgresql-event-sourcing/blob/main/README.md),
  [TheCodeForge](https://thecodeforge.io/database/event-sourcing-databases/))
  is a single event log keyed by aggregate id + aggregate type with a JSONB
  payload — which is what `ops_events` already is.

**Polymorphism belongs on the event log, not on the parent entity.**

> **Caveat, stated honestly.** The WMS-specific literature on operational
> work-session modelling is thin; searches returned dimensional-modelling and
> data-warehouse material. The transferable guidance above comes from the
> polymorphic-association and event-sourcing literature.

---

## 2 · How many tables there are now

Measured across `src/lib/migrations/*.sql`:

| Group | Count | Examples |
|---|---|---|
| Session tables | **6** | `work_sessions`, `work_session_intervals`, `counter_sessions`, `picking_sessions`, `staff_sessions`, `station_scan_sessions` |
| Event tables | **~14** | `ops_events`, `inventory_events`, `fba_scan_events`, `mobile_scan_events`, `pack_verification_events`, `order_pack_placement_events`, `unit_pack_placement_events`, `shipment_tracking_events`, `warranty_claim_events`, `call_events`, `auth_events`, `stripe_events`, `zoho_webhook_events`, `ai_usage_events` |
| Audit tables | **~5** | `audit_logs`, `auth_audit`, `sku_pairing_audit`, `integration_credential_audit`, `agent_mutations` |
| **Total** | **31** | |

[`src/lib/operations/journey.ts`](../../src/lib/operations/journey.ts) is **699
lines** reading **13** of them. Law **A1** already names the metric: *the union
branch count is the progress bar.* 13 → 0.

`receiving_lines` additionally carries **seven** 1:1 satellites —
`receiving_line_facts` · `_putaway` · `_return` · `_testing` · `_unit` ·
`_views` · `_zoho`. That is the same one-table-per-stage instinct that produced
fourteen event tables, applied to a row instead of a log.

---

## 3 · ✅ RULED 2026-08-22 — `work_assignments` wins, the session wraps it

> The path is [`06-work-order-migration-path.md`](06-work-order-migration-path.md); the laws are **S10**, **S11**, **K12**. The section below is kept as the argument that produced the ruling.

### The fork, as it stood

**`work_sessions` and `work_assignments` are the same idea twice.**

| | `work_assignments` (baseline) | `work_sessions` (`2026-08-22b`) |
|---|---|---|
| adopters | **65 files** | 20 files |
| entity link | `entity_type` enum + `entity_id` | **none** |
| type safety | Postgres enums | `TEXT` + named CHECK |
| assignee | `assignee_staff_id` | `staff_id` + `claimed_by_staff_id` + lease |
| exclusivity | one active per (entity, work_type) | one **armed scan** per org |
| lifecycle | `started_at` / `completed_at` | `status` + `version` + intervals |

Both are *"a unit of work, held by a person, with a status and a start and an
end."* One is already polymorphic and live in 65 files; the proposal on the table
was to add polymorphism to the other one.

This is not a recommendation to make — it is a ruling. The three readings:

1. **They are different things.** An *assignment* is what a lead hands you; a
   *session* is you doing it. Then `work_sessions.id` should probably appear on
   `work_assignments`, and neither gets an entity column.
2. **`work_sessions` supersedes `work_assignments`.** Then the 65 adopters are a
   migration, and `work_assignments.entity_type/entity_id` is the thing to carry
   across — which would make §1's answer different.
3. **`work_assignments` was always the right table** and `work_sessions` is a
   younger duplicate. Then `2026-08-22b` and `2026-08-23e` are the ones to fold.

**Ruled: reading 1, with a rename.** They are different things — an assignment is what a lead hands you, a session is you doing it — and the session becomes a *titled* wrapper rather than a typed one, so `scan_type` stops being a vocabulary that only grows by migration.

---

## 4 · The shape to converge on

Five tables in the core; everything else collapses into #3. Updated after the 2026-08-22 ruling — see [`06-work-order-migration-path.md`](06-work-order-migration-path.md).

| | Table | Question it answers | Status |
|---|---|---|---|
| 1 | `work_sessions` | *Which work order this is, what it is called, what state it is in* — the titled wrapper | built (`2026-08-22b`); `title` lands in `2026-08-23g` |
| 1b | `work_assignments` | *Who owes which job on which thing* — N units under one wrapper | live in **65 files**; `work_session_id` lands in `2026-08-23g` |
| 2 | `work_session_intervals` | *When was it actually worked, and by whom* | built (`2026-08-23e`) |
| 3 | `ops_events` | *What happened, to which entity, inside which session* | built; **13 spines still to fold in** |
| 4 | `agent_mutations` + `_affects` | *What the AI proposed, what it touched, was it accepted* | built; two gaps closed by `2026-08-23f` |

`work_session_intervals` deserves its reputation — its header makes the argument
that two timestamp columns on the parent cannot work, because a lead resuming
someone else's parked session would attribute the whole duration to one person.
That is a report that credits the wrong human, and it is the right level of
paranoia for this layer.

---

## 5 · Governance — what was missing, and what now lands

The 2026 frameworks — [EU AI Act, NIST AI RMF 1.1 (March 2026), ISO/IEC
42001](https://zylos.ai/research/2026-05-01-ai-agent-governance-compliance-2026/)
— converge on one audit trail per agent action, captured at the agent's own hook,
carrying the intent behind each action. [Approval requests specifically should
not be valid indefinitely](https://anomity.ai/blog/how-to-audit-ai-agent-activity/).

Checked against what `agent_mutations` already holds:

| Required artefact | Column | |
|---|---|---|
| proposed action + parameters | `payload` | ✓ `2026-07-03o` |
| estimated impact / blast radius | `agent_mutation_affects` | ✓ `2026-07-03o` |
| rollback procedure | `extra_audit.inverse` | ✓ `2026-07-03o` |
| who acted; human-in-the-loop | `actor_kind`, `proposed_by_staff_id` | ✓ `2026-08-23a` |
| **reasoning trace** | — | ✗ **gap** |
| **approval expiry** | — | ✗ **gap** |

Two gaps, both column-shaped, both closed by
[`2026-08-23f_agent_mutations_governance_trace.sql`](../../src/lib/migrations/2026-08-23f_agent_mutations_governance_trace.sql):

- **`reasoning TEXT`** — a real column rather than an `extra_audit` key, so
  *"which high-risk actions have no recorded rationale"* is `IS NULL` instead of
  a jsonb probe that cannot distinguish absent from never-written.
- **`expires_at TIMESTAMPTZ`** — `NULL` means *no expiry*, never *expired*. There
  is deliberately **no new `status` value**: expiry is a function of the clock,
  derived as `status IN ('proposed','under_review') AND expires_at < now()`, so
  it cannot go stale between sweeps. A partial index makes that read cheap.

Pure expand (**D6**): two nullable columns, one partial index, no backfill, no
rewrite, nothing reading them yet.

---

## Sources

- [Polymorphic Associations — GitLab](https://docs.gitlab.com/development/database/polymorphic_associations.html)
- [Modeling Polymorphic Associations in a Relational Database — Hashrocket](https://hashrocket.com/blog/posts/modeling-polymorphic-associations-in-a-relational-database)
- [Database Design Patterns — Bytebase](https://www.bytebase.com/blog/database-design-patterns/)
- [postgresql-event-sourcing — GitHub](https://github.com/eugene-khyst/postgresql-event-sourcing/blob/main/README.md)
- [Event Sourcing with Databases: Design, Patterns & Production — TheCodeForge](https://thecodeforge.io/database/event-sourcing-databases/)
- [AI Agent Governance and Compliance in 2026 — Zylos Research](https://zylos.ai/research/2026-05-01-ai-agent-governance-compliance-2026/)
- [How to Audit AI Agent Activity: A CISO Implementation Guide (2026) — Anomity](https://anomity.ai/blog/how-to-audit-ai-agent-activity/)
