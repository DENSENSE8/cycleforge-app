# Per-unit "no serial" — execution plan

**Status:** Phases 0–4 implemented (2026-07-29). Observe live on a multi-qty carton before treating as done.
**Lane:** `main`. **Migration:** `2026-07-29c_receiving_line_unit.sql`. **Blast radius:** contained — see §7.

---

## 1. The ask, and the bug that motivates it

On a multi-quantity PO line the operator sees one row per physical unit, each with a
serial field and a trailing button. When the field is empty that button is a **greyed-out
`+` that does nothing** — dead chrome occupying the primary action column on every empty
row.

The single-quantity row already solved this: an empty field shows a **green check** that
marks the item as having no serial ([`SerialCard.tsx`](../../src/components/receiving/workspace/SerialCard.tsx) →
`NoSerialOfferCheck`). The multi-qty rows never got it.

**Goal:** every unit row's trailing button becomes a green check when its field is empty,
and clicking it marks *that unit* as having no serial — not the whole line.

### Why this is not a UI change

The waiver is one boolean for the entire line:

| Fact | Location |
|---|---|
| Storage | `receiving_line_testing.serial_absent` (+ `serial_absent_reason`) |
| Key | `ON CONFLICT (receiving_line_id)` — 1:1 with the line |
| Write path | `POST /api/receiving/lines/[id]/serial-absent` |
| Gate | `isSerialDone = !!serialAbsent \|\| serialCount >= expected` ([derive-receiving-step-states.ts:56](../../src/components/receiving/workspace/derive-receiving-step-states.ts)) |

So a qty-3 line where units 1 and 3 have serials and unit 2 does not is **unrepresentable**.
Wiring a per-row check today would make row 2's click silently waive rows 1 and 3 as well —
worse than the dead button, because it looks precise and isn't.

---

## 2. Why the obvious storage options are wrong

### ✗ A count column (`serial_absent_units INT`)

"k of the n units have no serial." One column, no new table. **Rejected:** it cannot say
*which* unit, and condition grade **is** per-unit. A line with unit 2 = `PARTS` and unit 4 = `A`,
both unserialized, has no way to keep each grade with its unit — the waiver floats to
whichever slots happen to be empty. It also can't carry a per-unit reason.

### ✗ A per-slot table (`receiving_line_unit_waiver(line_id, slot_index, …)`)

**Rejected: `slot_index` is not an identity.** The UI's slots are a rendering artifact:

- `UnitSlotList` renders `total` rows; `saved[i]` is the **i-th scanned serial**, dense and
  front-filled. Row 3 holds `saved[2]` only because it was scanned third.
- Delete the first serial and every subsequent row shifts up.
- `pendingGrade` ([ReceivingUnitRows.tsx:83](../../src/components/receiving/workspace/ReceivingUnitRows.tsx)) is
  a slot-keyed **local** map that evaporates on reload.

Persisting `slot_index` would freeze an index that the UI reshuffles on every delete.

### ✗ Make `serial_units.serial_number` nullable

The intuitive move — a unit row with a null serial — but it breaks unit identity:

- `serial_number TEXT NOT NULL` ([2026-04-10_create_serial_units.sql:38](../../src/lib/migrations/2026-04-10_create_serial_units.sql))
- `ux_serial_units_org_normalized_serial` on `(organization_id, normalized_serial)` (2026-06-19)
- **That index is the upsert's conflict target.** `mark-received` does
  `ON CONFLICT (organization_id, normalized_serial) DO UPDATE`
  ([mark-received/route.ts:215](../../src/app/api/receiving/mark-received/route.ts)).

NULLs don't collide in a plain unique index, so every no-serial unit would insert a fresh
row and the upsert-by-serial contract quietly stops applying to exactly the rows we added.
Fixing that means re-keying unit identity onto `unit_uid` across all three production
writers (`mark-received/route.ts`, `serial-units-queries.ts`, `insertTechSerialForTracking.ts`),
plus every reader that assumes a unit has a serial. Real work, real risk, and **not required**
to ship this feature. Keep it as a possible later consolidation (§8), not a prerequisite.

---

## 3. ✅ Recommended: materialise the unit row where it belongs

Add **`receiving_line_unit`** — one row per *expected physical unit* on a receiving line.

The system already receives units that never become `serial_units` rows: that is precisely
what today's line-level waiver does, and `receive-line.ts:699` increments
`quantity_received` by a **count**, not by serial rows. This table makes explicit the thing
that already happens implicitly, and gives each unit a durable id to hang facts on.

```sql
CREATE TABLE IF NOT EXISTS receiving_line_unit (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,              -- no DEFAULT; enforce_tenant_isolation() installs it
  receiving_line_id   INTEGER NOT NULL REFERENCES receiving_line(id) ON DELETE CASCADE,
  ordinal             INTEGER NOT NULL,           -- display order only; NOT an identity
  serial_unit_id      INTEGER REFERENCES serial_units(id) ON DELETE SET NULL,
  serial_absent       BOOLEAN NOT NULL DEFAULT false,
  serial_absent_reason TEXT,                      -- Class-D serial_absent_reason vocabulary
  condition_grade     condition_grade_enum,       -- survives reload (today: local pendingGrade)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Why this shape**

- **`id` is the identity, `ordinal` is only for display.** Reordering or deleting a serial
  renumbers `ordinal`; it never re-points a fact at a different unit. This is the specific
  failure of option B.
- **`serial_unit_id` is the linkage** — the durable serial↔line join, per unit, which is what
  makes the row-level check meaningful. It composes with `serial_unit_provenance`
  (already live: `origin_type='RECEIVING_LINE'`, read by `/api/receiving/[id]`,
  `mark-received-po`, `receiving-lines`); it does **not** replace it. Provenance answers
  "where did this unit come from"; this answers "which of this line's units is it".
- **`condition_grade` fixes a live bug for free.** `pendingGrade` is lost on reload today, so
  a grade chosen for an unscanned slot silently disappears.
- **`serial_absent` per row** is the feature.
- Follows [`polymorphic-tables.md`](../../.claude/rules/polymorphic-tables.md): org-led indexes,
  real FK `ON DELETE CASCADE`, tenant-from-birth via `enforce_tenant_isolation('receiving_line_unit')`
  in the birth migration, modeled in Drizzle in the same PR.

```sql
CREATE UNIQUE INDEX ux_receiving_line_unit_ordinal
  ON receiving_line_unit (organization_id, receiving_line_id, ordinal);
CREATE UNIQUE INDEX ux_receiving_line_unit_serial
  ON receiving_line_unit (organization_id, serial_unit_id)
  WHERE serial_unit_id IS NOT NULL;   -- one line-unit per serial
CREATE INDEX idx_receiving_line_unit_line
  ON receiving_line_unit (organization_id, receiving_line_id);
```

### Relationship to the existing line-level waiver

`receiving_line_testing.serial_absent` **stays** and keeps its meaning: *"this whole line has
no serials"* — the all-units check above the rows, and the only affordance a single-qty line
needs. The derived gate becomes:

```
isSerialDone = serialAbsent                                   // whole line waived
            || (serialCount + perUnitAbsentCount) >= expected // per-unit accounting
            || (expected === 0 && serialCount > 0)
```

Two representations, one precedence rule, stated once in `derive-receiving-step-states.ts`.
**Do not** back-fill one from the other — that is the drift trap.

---

## 4. Phases

Each phase ships independently and leaves the tree green.

### Phase 0 — migration + model (no behaviour change)
- `src/lib/migrations/<date>_receiving_line_unit.sql` per §3, idempotent DDL, guarded
  `enforce_tenant_isolation` call.
- `pgTable('receiving_line_unit', …)` in `src/lib/drizzle/schema.ts` **in the same PR**.
- No reader, no writer. Verify: migration applies clean; `npm run verify` green.

### Phase 1 — backfill + lazy materialisation
- Domain helper `ensureLineUnits(lineId, expectedQty, deps)` — idempotent, creates missing
  rows up to `quantity_expected`, attaches existing serials by scan order to fill
  `serial_unit_id`.
- Call it from the line read path so a line materialises on first open. **No** bulk backfill
  migration: qty is mutable, and rows for lines nobody opens are waste.
- Verify: DB-free unit test with injected deps (idempotent on re-run; never duplicates;
  never renumbers an existing row's `id`).

### Phase 2 — read model
- `GET /api/receiving-lines?include=serials` and `/api/receiving/[id]` return
  `units: [{ id, ordinal, serial, serial_absent, serial_absent_reason, condition_grade }]`.
- `ReceivingLineRow.units?: …` — **optional**, so every existing consumer keeps compiling and
  the old `serials[]` path stays live until Phase 4.
- Verify: shape test; the two endpoints agree for the same line.

### Phase 3 — the UI (the actual ask)
- **`POST /api/receiving/lines/[id]/units/[unitId]/serial-absent`** — mirrors the existing
  per-line route: toggle semantics, exact value written, `withAuth` + permission, audit,
  `after()` invalidation. Reuse the same Class-D reason vocabulary.
- New choke point `markReceivingUnitSerialAbsent(lineId, unitId, next)` beside
  `markReceivingSerialAbsent` in `receiving-label-helpers.tsx` — optimistic bus patch +
  durable POST, same two-effect contract.
- `UnitSlotList`: when the field is empty and the row has a unit id, the trailing button is
  `NoSerialOfferCheck` (`width="w-11"`, already extracted and shared); when the field has
  text it stays the add/submit `+`. **The greyed-out empty-field `+` disappears entirely** —
  it is replaced, not hidden.
- A waived row renders its committed state (reason token) instead of an input, matching the
  single-qty `noSerialSlot` behaviour.
- Verify: browser, on a real multi-qty carton (**49925**, Guitar Hero, qty 3 — the screenshot
  case). Waive unit 2 only → reload → unit 2 still waived, units 1/3 still expect serials,
  the line's Serial step is NOT complete. Then scan 1 and 3 → step completes.

### Phase 4 — retire the parallel path
- `condition_grade` reads/writes move from local `pendingGrade` to the unit row.
- Only once Phases 1–3 are live and observed. Drop nothing before that.

---

## 5. Verification

```bash
npx tsc --noEmit -p tsconfig.json
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/components/receiving/workspace/derive-receiving-step-states.test.ts \
  src/lib/receiving/ensure-line-units.test.ts \
  src/app/api/receiving/lines/units-serial-absent.guard.test.ts
npm run verify
```

Gate cases that must have tests, because each one is a way to ship a lie:

| Case | Expected |
|---|---|
| Waive unit 2 of 3, scan none | Serial step **incomplete** (1 of 3 accounted) |
| Waive unit 2, scan units 1 and 3 | Serial step **complete** |
| Waive all 3 individually | Complete — and must NOT set the line-level `serial_absent` |
| Line-level waiver set, units untouched | Complete (existing behaviour preserved) |
| Delete a scanned serial | Its unit row survives with `serial_unit_id = NULL`; waivers on other units unmoved |
| `quantity_expected` raised 3 → 5 | `ensureLineUnits` adds 2; existing units and waivers untouched |
| `quantity_expected` lowered 5 → 3 | **Open question — see §9** |

E2E asserts against the **QA org**, never the dogfood tenant ([verify.md](../../.claude/rules/verify.md)).

---

## 6. Files touched

| Phase | File |
|---|---|
| 0 | `src/lib/migrations/<date>_receiving_line_unit.sql` · `src/lib/drizzle/schema.ts` |
| 1 | `src/lib/receiving/ensure-line-units.ts` (+ test) |
| 2 | `src/app/api/receiving-lines/route.ts` · `src/app/api/receiving/[id]/route.ts` · `src/components/station/receiving-line-row.ts` |
| 3 | `src/app/api/receiving/lines/[id]/units/[unitId]/serial-absent/route.ts` · `receiving-label-helpers.tsx` · `UnitSlotList.tsx` · `ReceivingUnitRows.tsx` · `derive-receiving-step-states.ts` · `permission-registry.ts` + `route-permission-manifest.test.ts` |
| 4 | `ReceivingUnitRows.tsx` (`pendingGrade` removal) |

---

## 7. Blast radius

**Contained.** `serial_units` is **not** altered: no column change, no index change, and none
of its three production writers (`mark-received/route.ts`, `serial-units-queries.ts`,
`insertTechSerialForTracking.ts`) are touched. The new table is additive; every existing
reader keeps working because `units` is optional through Phase 3.

**Rollback:** drop the table and revert the UI commit. No data loss — the line-level waiver,
the serials, and provenance are all untouched by this feature.

---

## 8. Explicitly out of scope

- Making `serial_number` nullable / re-keying unit identity onto `unit_uid` (§2). Revisit only
  if no-serial units later need to enter stock as first-class inventory.
- Any change to `serial_unit_provenance`. It already works and is already read.
- Its stale Drizzle doc-comment (*"nothing reads this yet; serial_units.origin_* stay the live
  source"* — both halves now false) is a **separate one-line docs fix**; do it independently so
  it isn't buried in a feature PR.

---

## 9. Open questions — answer before Phase 1

1. **Shrinking `quantity_expected`.** If a line drops 5 → 3 and units 4–5 carry waivers or
   serials, do we delete them, or keep and mark them orphaned? Deleting loses an operator's
   recorded judgement; keeping means `units.length > quantity_expected`. *Lean: keep, and
   render the surplus as a distinct "beyond expected qty" state — no silent deletion.*
2. **Per-unit reason, or one per line?** The table allows per-unit. Is that real operator
   need (one cable, one damaged label) or noise? *Lean: allow it, default the picker to the
   line's last-used reason so the common case is one click.*
3. **Does a waived unit count toward `quantity_received` at receive time?** It is a physical
   unit that arrived. *Lean: yes — otherwise the carton under-reports what is on the shelf.*
   Confirm against `receive-line.ts:699` before Phase 3.
