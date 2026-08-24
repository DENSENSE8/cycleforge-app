# The work order session — migration path

**Operator ruling, 2026-08-22.** `work_assignments` wins. The session becomes a
**titled wrapper** around N assignments, and the bench vocabulary stops being a
schema fact.

Laws: **S10** (a session is titled, not typed) · **S11** (`work_assignments` is
the unit; the session wraps N) · **K12** (operator vocabulary is data).
Supersedes the earlier reading recorded as open question O10.

---

## The shape

```
work_sessions            THE WORK ORDER SESSION — the wrapper
  title        TEXT      "Unbox" · "Goods-in" · "Pallet 4471"   ← data, renameable
  surface_key  TEXT      SURFACE_REGISTRY key                    ← code, pinned
  status · version · armed · claim lease · state JSONB

     └── work_assignments        THE UNITS — N of them
           work_session_id       → the wrapper
           entity_type/entity_id → what is being worked
           work_type             → which job
           assignee_staff_id · status · assigned_at/started_at/completed_at

     └── work_session_intervals  WHEN it was worked, per person
```

Two fields that must never be conflated:

| | answers | kind | changes how |
|---|---|---|---|
| `title` | *what do I call this?* | **data** | an operator renames it, at 3pm, no deploy |
| `surface_key` | *what renders and validates it?* | **code** | a release |

`surface_key` already exists on `work_sessions` and is already documented as
*"a SURFACE_REGISTRY key — CODE, not a table."* The dispatcher was built; only
the human name was missing.

---

## Why `work_assignments` won

Not seniority — direction and adoption:

- **65 files** read `work_assignments`; **20** read `work_sessions`.
- `2026-08-08b` states in its own header that it *"turns work_assignments into a
  row that can carry a throwable task"* — widened `entity_id` to BIGINT, added
  `FOLLOW_UP` / `SUPPORT_TICKET`, restored a single canonical `assignee_staff_id`
  in place of the tester/packer slots. That was **two weeks before**
  `work_sessions` was created.
- Merging them would have deleted the layer that lets **two people work one work
  order** — the exact thing a wrapper plus N units exists to express.

## Why the vocabulary stops being an enum

Measured, on `work_assignments`' own three enums — **six `ALTER TYPE` migrations**
to add vocabulary:

| value | added by |
|---|---|
| `SKU_STOCK`, `STOCK_REPLENISH`, `OPEN` | baseline |
| `FOLLOW_UP`, `SUPPORT_TICKET` | `2026-08-08a` |

And each needs **two files**, because PostgreSQL refuses a new enum label used in
the transaction that added it — `2026-08-08b`'s header says exactly this.

Two more independent arrivals at the same conclusion already exist in the repo:
`2026-08-23b` refused a CHECK on `ops_events.session_type` because *"a CHECK here
would mean a migration every time a bench is added"*, and
`docs/todo/schema-wide-polymorphic-refactor-plan.md` names
`work_assignments.entity_type` as the *"precedent for don't do this for a
tenant-extensible axis."*

---

## The path

### Phase 1 — EXPAND ✅ written, not applied

[`2026-08-23g_work_order_session_expand.sql`](../../src/lib/migrations/2026-08-23g_work_order_session_expand.sql)

- `work_sessions.title TEXT` — nullable, no default, no CHECK
- `work_assignments.work_session_id BIGINT` — FK → `work_sessions(id)` `ON DELETE SET NULL`
- One partial index for *"the units inside this session"*

Deliberately untouched: `scan_type` and its CHECK (**S7**), the armed-scan
partial unique index (**S1**), and all three enums. Those are Phase 3.

Every one of the 65 files keeps compiling and behaving identically — a column
nobody selects cannot change a result. Apply with `/db-migrate`.

### Phase 2 — CODE

Nothing here is a migration. In rough dependency order:

1. **Session creation writes `title`.** Seed it from the surface's display label
   so nothing renders blank, then let the operator rename it in place — the beam's
   session chip is already a button that opens the session popover with a rename
   field, so the UI exists.
2. **Backfill `title` from `scan_type`** for existing rows. Idempotent, one-way,
   `WHERE title IS NULL` so a rerun cannot clobber an operator's rename.
3. **Assignment creation sets `work_session_id`** when the assignment is made
   inside a session. NULL stays legal for assignments made from the queue.
4. **Readers prefer `title` for display** and `surface_key` for dispatch. This is
   the step that has to reach all 65 files, and it is the long one.
5. **Queue reads gain the wrapper.** `src/lib/work-orders/queue-fetchers.ts` and
   `queries.ts` are the two entry points; `WorkOrderRow` already carries a
   `title` field, so the read model barely moves.

**The one correctness rule for this phase:** `ops_events.session_type` must
follow **`surface_key`, never `title`**. A2 rules that the classification of a
past event may not change, and a title is editable — renaming "Unbox" to
"Goods-in" would silently reclassify every event ever emitted under it.

### Phase 3 — CONTRACT

Only after every reader has moved. Each gets its own file.

| Step | Risk | Note |
|---|---|---|
| Drop `work_sessions_scan_type_chk`, then `scan_type` | low | Retires **S7**; supersede the law in the same change |
| `work_type_enum` → `TEXT` + registry validation | **high** | `ALTER COLUMN … TYPE TEXT USING col::text` **rewrites the table** and invalidates its indexes. 65 adopters. Needs its own plan and its own window |
| `work_entity_type_enum` → `TEXT` | **high** | Same, and it is referenced by the cascade-delete trigger family |
| `assignment_status_enum` → `TEXT` | medium | Smallest vocabulary, most readers |

Do not batch these. The enum→TEXT conversions are the only genuinely dangerous
part of this whole path, and the expand step is deliberately shaped so they can
wait indefinitely without blocking anything.

---

## What this unblocks

- **A dispatch board that is actually live** — one row says both *who holds this*
  and *are they moving*, which is what the manager view (A3) needs.
- **Handoff without loss** — `claimed_by_staff_id` + `claim_expires_at` already
  exist on the wrapper; a lead takes over and the draft buffers come with it.
- **B11's missing denominator.** `work_session_intervals` tiles active vs parked
  per person. Joined to assignments, *"how long does a PACK actually take"*
  becomes answerable — which is the measure the beam's pace readout needs before
  it is allowed to show red against anything.
- **One object for the assistant to create and undo** (T11, T15) instead of an
  assignment plus a session that must be kept in step.
