# Research briefing — How should one carton's serial↔line linkage be modeled so that serials **display on every child line**, **delete optimistically**, and **arrow-navigate correctly**, without three stores drifting?

> Audience: Gemini Pro deep-research. Deliverable: a **simplification design** for the
> Unbox serial↔line linkage, scored against the current three-store model. This brief
> gives you the *verified current anatomy* and the *three live symptoms*; it does not
> pre-decide the answer.
>
> Author: Claude (Opus 4.8), 2026-08-11. Verified against source at that date.

---

## 0. Method — read before answering

### 0.1 Your job (four deliverables — keep them separate)

1. **Name the one authoritative model** for "which serial belongs to which child line of a
   carton," and say what it makes impossible-by-construction (drift, orphaned display,
   404-on-delete).
2. **Score the current three-store model vs. your proposed simplification** on: drift
   surface, optimistic-mutation safety, read cost (first-frame), and blast radius to
   migrate.
3. **Answer the research questions in §4** (display grain, delete idempotency, arrow scope).
4. **A migration sketch** (expand → backfill → contract) that never fails a live scan.

### 0.2 What this brief is NOT

- Not a request to keep the projection because it exists. If the read-model is the drift
  source, say so and price its removal.
- Not a UI-only fix. The symptoms are UI-visible but the root is data-model. A pure
  component patch that leaves three stores able to disagree is out of scope.
- Not a schema land-grab. A NEW parent table was already **rejected** for the carton/PO
  question (`docs/todo/…` — the carton is the hard FK parent; the PO is an identifier).
  Do not reintroduce it. Your target is the serial↔line edge, not the carton↔PO edge.

### 0.3 Candidate architectures (score at least these two families)

- **A — One write model, derive everything.** `serial_units.receiving_line_id` (COALESCE
  with origin) is the single truth. The jsonb `serial_projection` read-model is either
  deleted (read `serial_units` live) or made a **pure cache with a reconcile-on-write
  invariant** that can never be the source of a displayed-but-undeletable serial.
- **B — Materialized per-unit rows as truth.** `receiving_line_unit` becomes the
  authoritative per-unit/per-line row; `serial_units` and the projection derive from it.
  Price the lazy-materialization cost and the "phantom unit on qty-0" hazard the current
  code already warns about.

Score both. A third, better family is welcome — name it.

### 0.4 Sources to cover (minimum)

- WMS serialized-receiving models (Manhattan, Blue Yonder, Körber): is the per-unit row
  the truth, or a projection off a line-level count + a serial list?
- Read-model / CQRS drift: when is a denormalized read-model safe, and what invariant
  makes "displayed ⟹ deletable" hold by construction?
- Optimistic UI mutation with server reconciliation (the delete-then-404-then-rollback
  loop): the industry pattern for "the thing I see must be the thing I can delete."

### 0.5 Related briefs in this repo (cite, do not redo)

- `docs/performance/HANDOFF-*` and `src/lib/receiving/serial-projection.ts` docblock —
  the projection's stated contract ("FAST DEFAULT; `?include=serials` is authoritative").
- `src/lib/migrations/2026-07-03b_serial_units_drop_origin_columns.sql` — why
  `receiving_line_id` is `COALESCE(current_line, origin_line)` and NOT vestigial.
- `AGENTS.md` → "Received meters mean inventory-confirmed qty" and "Unboxed ≠ Received" —
  do not conflate serial capture with quantity_received.

---

## 1. Product context (facts only — not design law)

- Cycle Forge Unbox: an operator opens a **carton** (`receiving_carton`, aka `receiving`,
  keyed `receiving_id`) and unboxes its **PO line items** (`receiving_line`, children of
  the carton via a real FK `ON DELETE CASCADE`). One carton commonly holds 2–4 child
  lines; ~0.3% span >1 PO.
- Each child line captures **serials** (device serial numbers) as the operator scans
  them. A line may be `serial_absent` (waived) or hold N serials.
- The reported carton (`75-97701` / `receiving_id 19621111`) has two child lines:
  - `Bose Wave Music System III — White` (`00066-WY`), serials `…234670, 23067236`.
  - `Bose Wave Music System — Multi-CD Changer White` (`1-P-1-WH`), serial `370354ae`.
- The operator opens **Units Displays** (right-edge push column,
  `?display=units`) to see/edit the active line's units + a readonly "OTHER LINES ON
  CARTON" summary.

---

## 2. Measured current anatomy (verified in source, 2026-08-11)

### 2a. THREE stores encode one fact ("which serial is on which line")

| Store | What it is | Who writes | Who reads |
|---|---|---|---|
| **`serial_units.receiving_line_id`** | Authoritative unit row; current line (`COALESCE(current, origin)` for provenance after `2026-07-03b` dropped `origin_*` denorm) | `attachSerialToLine` / `detachSerialFromLine` (`src/lib/receiving/serial-attach.ts`) | `fetchSerialsForLines` (the reconcile), the DELETE match |
| **`receiving_line_unit`** | Lazily-materialized per-unit rows (Phase 1 per-unit tracking) | `ensureLineUnits` (`src/lib/receiving/ensure-line-units.ts`) | multi-qty unit rows |
| **`receiving_line_testing.serial_projection`** (jsonb) | Compact `{id, serial_number, condition_grade}[]` read-model | `refreshLineSerialProjection[Safe]` (`src/lib/receiving/serial-projection.ts`) | **first-frame display** — line SQL surfaces it as `row.serials` (`src/lib/receiving/lines/build-sql.ts`); the Units display renders from it |

The projection's own docblock states it is a **best-effort FAST DEFAULT** and that
`?include=serials` is the **authoritative reconcile that self-heals any drift on open.**
That is the crux: **the display can be authored by the projection while the write model
(`serial_units`) disagrees, and nothing forces them consistent at the moment of a
mutation.**

### 2b. The write path

`src/lib/receiving/serial-attach.ts`:
- `attachSerialToLine({receiving_line_id, serial, …})` — inserts/moves a `serial_units`
  row onto the line, sets `origin_receiving_line_id`, then best-effort refreshes the
  projection.
- `detachSerialFromLine({receiving_line_id, serial_unit_id | serial_number, …})` —
  `DELETE FROM serial_units WHERE id=$1 AND organization_id=$2` **only if a lookup first
  finds a row matching `(serial_unit_id OR serial_number) AND receiving_line_id`**. If no
  such row → `{ removed: false }`.

### 2c. The read path (route)

`src/app/api/receiving/scan-serial/route.ts`:
- `POST` attaches (line 72+). `DELETE` (line 376+) calls `detachSerialFromLine`; when
  `!result.removed` it returns **404 `"serial not found on this line"`** (line 415).
- `GET`/list surfaces `serials` from the projection unless `?include=serials` forces the
  authoritative `fetchSerialsForLines` reconcile.

### 2d. The Units display

`src/components/receiving/workspace/UnitsExplosionDisplay.tsx`:
- `activeLine` = the line matching `activeLineId` (else `lines[0]`); `siblingLines` = the
  rest. It fetches `/api/receiving-lines?receiving_id=…&include=serials` (authoritative)
  BUT the surrounding accordion / line SQL commonly seeds from the projection.
- Renders the **active** line's serials **editable** + **"OTHER LINES ON CARTON"** with the
  siblings' serials **readonly** (line ~315+). This is why "both lines' serials" do not
  read as equal — one is an editor, the others a summary.

### 2e. The optimistic delete flow

`src/components/receiving/workspace/line-edit/hooks/useLineSerials.ts` (`deleteSerialUnit`):
1. `publish(lineId, markSerialRemoving(current, serialUnitId), …)` — optimistic "removing".
2. `DELETE /api/receiving/scan-serial { serial_unit_id, receiving_line_id: lineId }`.
3. On **failure** → `publish(clearSerialRemoving(…))` — **rollback: the serial reappears.**
4. On success → `publish(removeSerialById(…))`.

**Therefore the observed symptom — "not optimistically deleting / removing" — is the 404
rollback.** The displayed serial's real `serial_units.receiving_line_id` ≠ the `lineId`
the UI sent, so `detachSerialFromLine` finds nothing, returns 404, and step 3 restores it.

### 2f. The `↑`/`↓` keyboard scope (tangled)

- `SerialScanField` handles `ArrowUp`/`ArrowDown` → `focusUnboxCaptureSerialRelative(±1)`
  (`src/components/receiving/workspace/line-edit/focus-unbox-capture-serial.ts`), stepping
  across **every mounted capture serial input in document order** while the ambient record
  cursor refuses-in-input.
- Separately, the **sibling record cursor** (`useRecordCursorKeyboard` scope `'sibling'`,
  `src/hooks/useRecordCursorKeyboard.ts`) also owns `↑`/`↓` to step **PO lines**, and it
  **yields entirely while a Displays column is open** (`list-key-scope.ts`).
- Net: `↑`/`↓` mean "step serial inputs" when focus is in a serial field, and "step sibling
  lines" otherwise — but the two are not cleanly gated, so the operator experiences
  ambiguity ("arrow up twice"). The ask: **`↑`/`↓` should navigate serials ONLY when a
  serial is selected/focused**; otherwise they belong to the line/child cursor.

---

## 3. The three symptoms → one root

| Symptom (operator words) | Proximate cause | Root |
|---|---|---|
| "serial number is not displaying for both lines" | Units display = active-line editor + readonly "other lines"; projection may seed the wrong line | Read-model (`serial_projection`) not reconciled with `serial_units.receiving_line_id` |
| "deletion is not optimistically deleting / removing for that linkage" (toast: *serial not found on this line*) | DELETE matches `(serial, receiving_line_id)`; displayed serial's real line differs → 404 → rollback | Same divergence: **displayed ⇏ deletable** |
| "arrow up/down should be for serial only when serial selected" | `↑↓` claimed by both `SerialScanField` and the sibling record cursor, gated by focus + list-key-scope yield | Keyboard-scope overlap (secondary; can be fixed independently but is worsened by re-render churn from the divergence) |

**Observed data-integrity smell to verify:** the active line's serial rendered as
`u30623067236`, while the sibling's real serial is `23067236` and the sibling summary shows
`370354ae`. The `u…` value looks like a **synthetic/prefixed unit key or a concatenation**
(unit id + serial), not the scanned serial. Determine whether a materialization or display
step is minting/prefixing serial strings — if so, that alone can make a serial undeletable
(the stored `serial_number` never equals the displayed one).

---

## 4. Research questions (answer all)

**Q1 — One truth for the edge.** Should the serial↔line edge live on `serial_units`
(A), on `receiving_line_unit` (B), or elsewhere? What invariant makes **"a serial the UI
displays for line L is always deletable against line L"** hold by construction?

**Q2 — Is the jsonb projection worth keeping?** It exists for first-frame paint speed
(Tier B2). Price: (a) delete it and read `serial_units` live with an index; (b) keep it but
enforce write-through so it can never diverge at mutation time; (c) keep it read-only and
make every mutation reconcile-before-ack. Which removes the "displayed-but-undeletable"
class entirely?

**Q3 — Delete idempotency / self-heal.** Should DELETE match on `serial_unit_id` alone
(carton-scoped), ignoring the caller's `receiving_line_id`, and then reconcile the line
state? I.e., "delete this unit wherever it is on this carton" instead of "delete only if it
is on the line I think." What does industry do — is the line filter a safety feature or the
bug?

**Q4 — Display grain for children.** Should the Units display show **all child lines'
serials as equal editable sections** (parent-carton → children), or keep active-editor +
readonly-siblings? What is the WMS norm for a multi-line serialized carton?

**Q5 — Arrow-key scope.** Define the exact rule: when do `↑`/`↓` step serial inputs vs.
child lines vs. the Displays list? Propose a single ownership model (focus-based? region
token?) that removes the double-press. Note the existing constraints: printed Digital
Links make a wedge type `/`; the record cursor refuses-in-input; `list-key-scope` yields to
an open push column.

**Q6 — The `u…` serial.** Is serial-string minting/prefixing happening anywhere between
scan and display? If yes, is that the true cause of "not found on this line," independent
of the line linkage?

**Q7 — Migration.** Expand → backfill → contract that never fails a live scan, given the
projection is best-effort and `serial_units` is authoritative. What backfill reconciles
existing drifted rows (displayed serials whose `receiving_line_id` is stale)?

---

## 5. Constraints that are product facts (not house taste)

- `serial_units.receiving_line_id` is `COALESCE(current, origin)` and **load-bearing** for
  returns/genealogy — do not "simplify" by dropping origin provenance
  (`2026-07-03b` migration header).
- A projection-write failure **must never fail a scan** (`refreshLineSerialProjectionSafe`).
- Serial capture ≠ `quantity_received` (Unboxed ≠ Received). A line can be 1/1 received
  with zero serials (waived). Do not infer serial presence from qty.
- Tenant-scoped: every read/write carries `organization_id`; `withTenantTransaction` for
  org-scoped writes.
- Status changes only via `transition()` / `transitionReceivingLine()` — a serial
  attach/detach must not raw-`UPDATE current_status`.
- The carton is the parent; child lines are first-class. Recent UI work already made the
  left rail, the Displays column, and the cockpit auto-follow key on the **carton** so
  switching child lines does not churn (`LineEditPanel`, `useUnboxDisplayView`,
  `SidebarRailShell`). Your model must keep sibling switches cheap (no full re-fetch).

---

## 6. Deliverable format (mandatory)

```
# Unbox serial↔line linkage — simplification (industry-grounded)

## Executive verdict            (one model; one sentence per rejected alternative)
## The one invariant            ("displayed ⟹ deletable", stated formally)
## Score table                  (A vs B vs your model: drift · optimistic-safety · read-cost · blast radius)
## Answers to Q1–Q7
## Delete contract              (exact match keys + self-heal)
## Display grain recommendation (children equal vs active+summary)
## Arrow-key ownership rule      (one table: focus state → who owns ↑↓)
## Migration sketch             (expand → backfill → contract; the drift-reconcile query)
## Ask-first                    (anything that touches transition()/provenance/tenant)
```

---

## 7. Closed for *this research* (do not recommend)

- A new `purchase_orders` / `receiving_po` parent table (settled: carton is the FK parent).
- Removing `origin` provenance from `serial_units`.
- Making serial capture write `quantity_received`.
- A fourth store for the serial↔line edge. The point is **fewer** stores, not more.

---

## Appendix A — file map for the researcher/implementer

| Concern | File |
|---|---|
| Serial attach/detach (write) | `src/lib/receiving/serial-attach.ts` |
| Scan-serial route (POST/DELETE/GET) | `src/app/api/receiving/scan-serial/route.ts` |
| Projection read-model (jsonb) | `src/lib/receiving/serial-projection.ts` |
| Authoritative reconcile | `fetchSerialsForLines` (same file) |
| Per-unit materialization | `src/lib/receiving/ensure-line-units.ts` |
| Line SQL that surfaces `serials` | `src/lib/receiving/lines/build-sql.ts` |
| Optimistic serial mutations (client) | `src/components/receiving/workspace/line-edit/hooks/useLineSerials.ts` |
| Optimistic queue helpers | `markSerialRemoving` / `clearSerialRemoving` / `removeSerialById` in `src/lib/receiving/optimistic-serials.ts` (unit-tested: `optimistic-serials.test.ts`) |
| Units display | `src/components/receiving/workspace/UnitsExplosionDisplay.tsx` |
| Multi-qty unit rows | `src/components/receiving/workspace/ReceivingUnitRows.tsx` |
| Serial field + arrows | `src/components/receiving/workspace/SerialScanField.tsx` |
| Capture-serial focus SoT | `src/components/receiving/workspace/line-edit/focus-unbox-capture-serial.ts` |
| Sibling record cursor | `src/components/receiving/workspace/PoLinesAccordion.tsx` + `src/lib/record-cursor/*` + `src/hooks/useRecordCursorKeyboard.ts` |
| ↑↓ yield-while-Displays-open | `src/lib/keyboard/list-key-scope.ts` |
| Serial display formatting | `src/lib/copy-chip-format.ts` (`resolveSerialDisplay` / `getLast8Serial`) |

## Appendix B — the exact failure to reproduce

1. Open a carton with ≥2 child lines, at least one with a captured serial.
2. In Units Displays, observe a serial rendered under the active line.
3. Press the trash icon. Expected: optimistic remove. Actual: toast **"serial not found on
   this line"**, serial reappears (rollback).
4. Diagnosis query (org-scoped): compare the displayed serial's `serial_units.receiving_line_id`
   to the line it renders under, and compare `serial_units.serial_number` to the displayed
   string (check for a `u…`/prefixed mismatch).
