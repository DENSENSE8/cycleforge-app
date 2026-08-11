# Implementation handoff — Unbox serial↔line linkage simplification (Model A)

> Executes the Gemini Pro deep-research verdict
> (`unbox-serial-line-linkage-simplification-GEMINI-RESEARCH-BRIEFING.md` → answer).
> **Adopted verdict: Model A — `serial_units.receiving_line_id` is the single source of
> truth; derive everything; retire the jsonb projection.**
>
> This handoff carries that verdict *exactly*, with **one code-reality correction to Q6**
> (below) that changes which fix is primary. Read §0 before touching anything.
>
> Author: Claude (Opus 4.8), 2026-08-11. Every file/line reference verified at that date.

---

## 0. Code-reality corrections — READ FIRST (verified against source)

Gemini researched without the source. One claim is wrong in *mechanism* and it changes the
plan. Do not implement Q6 as written.

### 0.1 Q6 correction — the `u…` value is STORED DATA, not a client-side synthetic id

- **Gemini Q6 said:** the client concatenates `u + serial_unit_id + serial_number` for a
  React key/display and sends that synthetic string to the server, causing the 404.
- **Reality (verified):**
  - The delete path sends the **numeric** id:
    `UnitsExplosionDisplay` → `onDeleteSerial={(s) => c.deleteSerialUnit(s.id, line.id)}`
    → `useLineSerials.deleteSerialUnit` → `DELETE { serial_unit_id: s.id, receiving_line_id: lineId }`.
  - There is **no `'u' + id` concatenation anywhere** in the serial render/copy code.
    `resolveSerialDisplay`/`getLast8Serial` (`src/lib/copy-chip-format.ts`) return raw or
    last-8; `SerialChipWithMenu` renders `serial.serial_number` verbatim.
  - Therefore `u30623067236` is the **actual `serial_units.serial_number`** — a *mangled*
    value. Note it **contains the sibling line's real serial `23067236`** — evidence of a
    cross-sibling optimistic-write corruption, not a formatting artifact.
- **Consequence for the plan:**
  - The 404 "serial not found on this line" is **Q3** (linkage-drift + the `receiving_line_id`
    filter) — that is the real, confirmed cause. **Phase 1 fixes it.**
  - The mangled `u…` serial is a **separate DATA bug** (how did a serial get stored as
    `u<sibling-serial>`?). **Phase 0** is a focused investigation before any migration —
    a backfill that reconciles *line linkage* will NOT unmangle a corrupted `serial_number`.

### 0.2 Everything else in the verdict is adopted as-is

Model A, the "Displayed ⟹ Deletable" invariant, the DELETE-by-`serial_unit_id` contract,
equal-editable children, focus-based arrow ownership, and expand→backfill→contract. Kept
verbatim below.

---

## 1. The adopted verdict (carry this exactly)

**The one invariant — Displayed ⟹ Deletable:** the `serial_unit_id` and structural
hierarchy the client renders must be read from the **same authoritative rows the mutation
targets**, so any visible serial maps to an exact, valid `serial_units` row at delete time.

**Delete contract:** match on **`serial_unit_id` + `organization_id`** only. **Drop
`receiving_line_id` from the WHERE clause.** Delete the unique physical unit by PK, then
**synchronously recompute** the affected line's derived state (qty/projection) so the UI
self-heals. The line filter is a bug disguised as a safety feature.

**Display grain:** show **all child lines' serials as equal editable sections** anchored to
the parent carton. Retire "active editor + readonly OTHER LINES ON CARTON."

**Arrow ownership (focus-based):**

| Focus state | Owner of ↑/↓ | Action |
|---|---|---|
| Inside a `SerialScanField` input | serial region | step serial inputs (relative ±1), `stopPropagation()` |
| Outside the serial region | sibling record cursor | step PO child lines |
| A Displays push column is open | yield / none | refuse (no background scroll) |

**Projection:** delete `receiving_line_testing.serial_projection` and its best-effort
write-through; read `serial_units` live with an index. (Or, only if first-frame paint
strictly demands it, a **synchronously-invalidated read-through cache** — but default to
deletion; it removes the displayed-but-undeletable class by construction.)

---

## 2. Phases (sequenced by risk & value — do NOT do them all at once)

### Phase 0 — Investigate the `u…` mangled serial (data bug) · **no code change yet**

Prove or kill the cross-sibling corruption before any migration.

1. Reproduce on the reported carton (dogfood `receiving_id 19621111`) or a QA fixture:
   query `serial_units` for the two child lines and inspect `serial_number` +
   `receiving_line_id` per row (org-scoped).
2. Answer: was `u30623067236` **written that way** (capture/optimistic bug), or is it a
   **read/join artifact**? The delete uses the numeric id, so if the row's
   `serial_number` is literally `u…`, it was written mangled.
3. Trace the optimistic write for a sibling scan:
   `useLineSerials.enqueueSerial` → `attachSerialToLine` (POST `/api/receiving/scan-serial`)
   and the optimistic queue (`src/lib/receiving/optimistic-serials.ts`
   `markSerialRemoving`/`removeSerialById` + the temp-id → real-id replacement). Look for a
   path where a scan on line A writes/reuses line B's serial string, or where a negative
   `tempId` leaks into a value.
4. **Deliverable:** a one-paragraph root cause + the exact write site. If it is an
   optimistic temp-id/value leak across siblings, fix it here (it is independent of the
   linkage model and blocks a clean backfill).

**Guardrail:** do not "fix" this by scrubbing data first — find the writer, or the bug
recurs on the next scan.

### Phase 1 — DELETE contract self-heal (**immediate fix for the 404 + non-optimistic delete**)

Files: `src/lib/receiving/serial-attach.ts` (`detachSerialFromLine`),
`src/app/api/receiving/scan-serial/route.ts` (DELETE, ~line 376-418).

1. Change `detachSerialFromLine` to match on **`serial_unit_id` (or `serial_number`) +
   `organization_id`**, dropping `receiving_line_id` from the match. Resolve the unit's
   **actual** `receiving_line_id` from the row *before* delete (for the recompute + audit),
   using `COALESCE(current_line, origin_line)` — **do not touch provenance.**
2. After delete, **synchronously** recompute the line's state (qty_received / projection /
   status via the existing `transition`-safe path) so the response carries `line_state` and
   the client's optimistic `removeSerialById` sticks.
3. The route keeps returning `line_state`; the 404 branch now only fires when the unit
   genuinely does not exist for this org (real not-found), not on drift.
4. Client (`useLineSerials.deleteSerialUnit`): keep the optimistic `markSerialRemoving` →
   on success `removeSerialById`; the rollback path stays but should now be rare. Add a
   guard that a **non-positive (temp) `s.id` never hits the network** (optimistic-only rows
   are removed locally, not DELETEd server-side).

**Verify:** open a ≥2-line carton with a captured serial, delete it from Units Displays →
serial disappears optimistically, no "serial not found on this line" toast, qty/line-state
correct on refetch. Add/adjust an e2e on the **QA org** (`tests/e2e/`) that captures then
deletes a serial on a multi-line carton and asserts the row is gone (not rolled back).

**Ask-first:** this changes delete semantics — a serial that legitimately **moved** to
another line becomes deletable from the old line's UI. That is correct *only because the UI
should not show a moved serial*; confirm the read model no longer shows moved serials once
Phase 3 lands, and that no `transition()` consumer misfires when a unit count drops
(Gemini's ask-first #1).

### Phase 2 — Equal-editable children in the Units display

File: `src/components/receiving/workspace/UnitsExplosionDisplay.tsx` (active-line vs
`siblingLines` split, ~line 103-160, 300-337).

1. Render **every** child line of the carton as an equal, editable serial section (same
   `ActiveLineConditionSerial`/unit-rows treatment), not active-editor + readonly
   "OTHER LINES ON CARTON."
2. Keep a light "active" affordance (which line the cockpit is on) but do not gate
   editability on it. Editing/deleting a sibling's serial must promote/act on that line
   (reuse the existing `dispatchSelectLine` per-line promotion already wired for the
   capture face).
3. Respect Unboxed ≠ Received: a line 1/1 with zero serials shows an honest empty serial
   section, not a fabricated serial.

**Verify:** on the 2-line carton, both children's serials render and are independently
editable/deletable; deleting one does not disturb the other.

### Phase 3 — Retire the projection (expand → backfill → contract) · **ASK-FIRST, largest**

Files: `src/lib/receiving/serial-projection.ts`, `src/lib/receiving/lines/build-sql.ts`
(surfaces `serials` from the jsonb), `serial-attach.ts` (write-through calls),
`/api/receiving-lines` reads, a new dated migration under `src/lib/migrations/`.

- **Expand:** make `fetchSerialsForLines` the default read for active carton queries
  (`serial_units` live, indexed), falling back to the jsonb only on live-query failure.
  Keep the projection column and its writers **in place** during expand.
- **Backfill (drift reconcile):** org-scoped, idempotent, in `withTenantTransaction`:
  ```sql
  UPDATE serial_units su
     SET receiving_line_id = COALESCE(su.current_line, su.origin_line)
   WHERE su.receiving_line_id IS DISTINCT FROM COALESCE(su.current_line, su.origin_line)
     AND su.organization_id = $1;
  ```
  (Adjust column names to the post-`2026-07-03b` schema; `origin_*` were dropped — resolve
  the real "current vs origin" via the surviving view/helper `serial-attach.ts` uses.
  **Do not reintroduce dropped columns.**) This backfill fixes *linkage* drift; it does
  **not** unmangle `serial_number` values — Phase 0 owns that.
- **Contract:** drop `receiving_line_testing.serial_projection`, delete
  `refreshLineSerialProjection[Safe]` and every call site, route all reads to
  `serial_units`. Follow expand→code→contract migration discipline
  (`backend-patterns.md` → the migration lands first; guard
  `column-reference.guard.test.ts`).

**Verify:** first-frame paint budget on a Tier-1 receiving surface stays within the
paint-order law (`AGENTS.md` → Paint content order); no `?include=serials`-vs-projection
divergence remains (there is only one source now).

**Ask-first (Gemini's three, kept verbatim):**
1. Any `transition()`/`transitionReceivingLine()` consumer that could misfire when a line's
   unit count changes under the new global DELETE contract.
2. `withTenantTransaction` wraps every new direct `serial_units` query (no cross-tenant
   leak).
3. `COALESCE(current, origin)` provenance stays **untouched** during backfill.

---

## 3. Verification matrix

| Phase | Guards / tests to run | Live check (QA org) |
|---|---|---|
| 0 | — (investigation) | query `serial_units` for the two child lines |
| 1 | `serial-attach.test.ts`, route unit tests, new e2e (capture→delete on multi-line carton) | delete serial → optimistic, no 404 toast |
| 2 | `units-explosion.guard.test.ts`, `po-line-capture-entry.guard.test.ts` | both children editable |
| 3 | `column-reference.guard.test.ts`, `build-sql.test.ts`, paint-order guards, `npm run verify` | first-frame paint budget |

**Always:** `npm run verify` before "done"; never raise a ratchet baseline. E2E asserts
against the **QA org**, not dogfood.

---

## 4. File map (verified paths)

| Concern | File |
|---|---|
| Serial attach/detach (write + the DELETE contract to change) | `src/lib/receiving/serial-attach.ts` |
| Scan-serial route (POST/DELETE/GET) | `src/app/api/receiving/scan-serial/route.ts` |
| Projection read-model (to retire Phase 3) | `src/lib/receiving/serial-projection.ts` |
| Authoritative reconcile (`fetchSerialsForLines`) | same file |
| Line SQL surfacing `serials` from jsonb | `src/lib/receiving/lines/build-sql.ts` |
| Optimistic client mutations | `src/components/receiving/workspace/line-edit/hooks/useLineSerials.ts` |
| Optimistic queue helpers (temp-id → real) | `src/lib/receiving/optimistic-serials.ts` (+ `.test.ts`) |
| Units display (equal-children Phase 2) | `src/components/receiving/workspace/UnitsExplosionDisplay.tsx` |
| Multi-qty unit rows | `src/components/receiving/workspace/ReceivingUnitRows.tsx` |
| Serial field + arrows (Phase 2 focus rule) | `src/components/receiving/workspace/SerialScanField.tsx` |
| Capture-serial focus SoT | `src/components/receiving/workspace/line-edit/focus-unbox-capture-serial.ts` |
| Sibling record cursor + ↑↓ yield | `src/hooks/useRecordCursorKeyboard.ts` · `src/lib/keyboard/list-key-scope.ts` |
| Serial display format (proved NOT the `u…` source) | `src/lib/copy-chip-format.ts` |
| Per-unit materialization (Model B, rejected — context) | `src/lib/receiving/ensure-line-units.ts` |

---

## 5. One-paragraph brief for the executing agent

Adopt Model A: `serial_units` is the single truth for the serial↔line edge. **Start at
Phase 1** — change the DELETE to match on `serial_unit_id + organization_id` (drop the
`receiving_line_id` filter) and recompute line state synchronously, which fixes the "serial
not found on this line" 404 and makes deletion optimistic. **But first do Phase 0**: the
`u30623067236` serial is a *stored, mangled* value (it embeds the sibling's real serial),
so trace the optimistic write that corrupts a sibling's serial string — that is a data bug
the linkage backfill will not fix. Then Phase 2 (equal-editable children in the Units
display) and, ask-first, Phase 3 (retire the jsonb projection via expand→backfill→contract).
Do not implement Gemini's Q6 as written (no client-side `u+id` concat exists), do not
reintroduce dropped `origin_*` columns, and keep `COALESCE(current, origin)` provenance
untouched.
