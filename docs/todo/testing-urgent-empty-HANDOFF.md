# Handoff — Testing Urgent tab shows nothing on `/test`

**For:** next coding agent (paste § Prompt)  
**Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Symptom:** On `/test?view=testing&testTab=urgent`, Band-1 **Urgent** renders an empty sheet (“No priority lines are waiting for testing.”) while **Returns** / **Pending** have rows.  
**Do not edit** the plan file `tech_unbox_triage_tabs_*.plan.md`.

---

## Prompt (paste into a new agent session)

```text
Fix: Testing Urgent on `/test` displays nothing.

## Mission

On `/test?view=testing&testTab=urgent` the Urgent tab body is empty (or always shows the empty copy) even when Returns / Pending have needs-test work. Diagnose whether this is (A) correct for a too-narrow filter with no dogfood priority flags, or (B) a wiring/SQL bug, then fix so Urgent shows the operator’s real priority testing queue — not a permanently blank tab.

Attach to the user’s already-running app on `:3050`. Do not start/restart/kill the dev server. Stay on the current branch. Do not edit plan markdown. User owns commits — do not commit unless asked. Run `npm run verify` before claiming done.

## Exact repro

1. Open `http://localhost:3050/test?view=testing` (Testing L2 mode).
2. Confirm **Returns** and/or **Pending** show rows.
3. Click Band-1 **Urgent** (URL must become `?view=testing&testTab=urgent`).
4. Observe: sheet empty — copy “No priority lines are waiting for testing.”

Also check Shipping twin only if relevant: `/test` default (Shipping) → **Urgent** should set `?ship=urgent&attention=1` and show urgent orders. This ticket is **Testing Urgent** first.

## Locked product intent

- Urgent is a **lifecycle tab**, not a KPI facet.
- Same `ReceivingGridView` / `TestingHistoryList` path as Pending — do **not** fork a second list engine.
- Filter must compose existing receiving priority SoT (`is_priority` / `priority_tier` / `RECEIVING_PRIORITY_RANK_SQL` / lane policy) — grow the SoT if the predicate is wrong.
- Empty state is allowed only when the **correct** priority set is empty — not when the filter is stricter than how priority is actually assigned on the floor.

## Current wiring (start here)

| Layer | Path | Behavior |
|---|---|---|
| Tab URL | `src/utils/testing-workspace-state.ts` | `testTab=urgent`; default Returns omits param |
| Body | `src/components/tech/TestingHistoryList.tsx` | `mode === 'urgent'` → `view=needs-test`, `return_scope=all`, `priority_only=1` |
| KPI twin | `src/components/tech/testing/TestingKpiStrip.tsx` | same `priority_only=1` when mode urgent |
| Query parse | `src/lib/receiving/lines/query.ts` | `priority_only=1\|true` → `priorityOnly` |
| SQL | `src/lib/receiving/lines/build-sql.ts` needs-test arm | `(COALESCE(r.is_priority, false) = true OR r.priority_tier IS NOT NULL)` |
| Empty copy | `TestingHistoryList` | “No priority lines are waiting for testing.” |

Network check: Urgent must hit `GET /api/testing/receiving-lines?view=needs-test&return_scope=all&priority_only=1&…`.

## Likely root causes (check in order)

1. **Predicate too narrow vs how priority is stamped.** Unbox KPI `isUnboxPriority` also treats `priority_lane` ∈ {priority,expedited,high} and `priority_tier === 0`. Testing Urgent SQL ignores `priority_lane` and treats *any* non-null `priority_tier` as urgent. If dogfood flags urgency via lane / platform rank / sort but leaves `is_priority` false and `priority_tier` null, Urgent is empty while Pending is full. Compare Pending rows’ `is_priority`, `priority_tier`, `priority_lane` in Network JSON.

2. **Wrong API / view / scope.** Confirm Urgent does not accidentally use `return_scope=standard` or `view=testing`. Confirm TestingHistoryList `priorityOnly` is true only for urgent.

3. **Honest empty.** If zero needs-test rows have priority flags org-wide, empty is correct — then either seed/verify write path (`markReceivingPriority` / triage / lookup-po) or redefine Urgent membership to match operator language (e.g. top `RECEIVING_PRIORITY_RANK_SQL` band + lane). Do not leave a dead tab.

4. **Client cache / key.** Query key includes `priorityOnly`; rule out stale Pending cache only after Network proves the request shape.

## Required fix shape

- Prefer growing the **shared** priority membership predicate (one SoT used by Testing Urgent SQL + ideally aligned with Unbox `isUnboxPriority` / rank) in `build-sql.ts` / precedence / triage-lane — not a page-local filter in React.
- Keep Pending / Returns queries unchanged except shared SoT reuse.
- Unit-test the new membership: `build-sql.test.ts` / `query.test.ts` — Urgent includes the intended rows and excludes clear non-priority needs-test lines.
- Guard/regression: Urgent still mounts through `TestingHistoryList` with `priority_only` (sheet guards already assert tab chrome).
- `npm run verify` green.

## Out of scope

- Merging Testing + Shipping tabs or scan bars
- Relocating `/repair` / `/pickup`
- Unbox Urgent (separate tab; same SoT growth is fine if shared)
- My Day / return-to-scan ports

## Done when

- With known priority needs-test dogfood (or fixture), `/test?view=testing&testTab=urgent` shows those rows.
- Returns / Pending unchanged in membership.
- Network request includes `priority_only=1` and response `receiving_lines` matches the SoT predicate.
- `npm run verify` passes.
```

---

## Notes for the human

- Shipping Urgent (`?ship=urgent` + `attention=1`) is a **different** filter (`orders.is_urgent`). Confirm which L2 mode is blank before pasting.
- If Pending is full and every row has `is_priority: false` and `priority_tier: null`, this is almost certainly **predicate / write-path** mismatch, not a broken tab mount.
