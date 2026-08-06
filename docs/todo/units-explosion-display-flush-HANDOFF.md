# Units explosion display — flush + clear condition HANDOFF

**Created 2026-08-05.** Paste-ready execution prompt for the Unbox **Units**
Displays tab body (`UnitsExplosionDisplay`). Visual target: the active-line
card currently shown as a rounded inset glass island with nested photo/units
blocks — replace with an **edge-to-edge, square-flush** Displays body, and
expand condition so the operator can **clear / remove** a selected grade.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits.

**Screenshot reference (what is wrong today):**
- Rounded white card inset inside the Units Displays column
- Nested rounded “ITEM PHOTOS” island
- Condition pills visible but **no clear/remove** affordance
- Extra frame padding so content does not abut the Displays column edges

---

## Paste this into a new session

```
Read docs/todo/units-explosion-display-flush-HANDOFF.md end-to-end before editing.

GOAL
Rework ONLY the Unbox Units Displays body (`UnitsExplosionDisplay` + its
Units tab mount) so it is:

  1. Edge-to-edge flush inside the Displays column (no inset glass card)
  2. Square / not rounded (no rounded-xl / rounded-3xl shells on this body)
  3. Condition picker fully expanded with an explicit REMOVE / CLEAR grade

Do not touch Station-body compact rows (`stationCompact` / ConditionGradeCircle
on the PO accordion). Those stay scan-only; editing stays in this Units display.

CONTEXT (locked — do not re-litigate)
- Units tab lives in ReceivingDisplaysPushStack / UnboxPushColumn (Station
  Displays push — NOT RightRailHost inspector).
- Mount: buildUnboxOverview units tab in
  src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx
  currently wraps UnitsExplosionDisplay in:
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
  That glass + nested pad is the rounded inset. Remove / replace for flush.
- Body: src/components/receiving/workspace/UnitsExplosionDisplay.tsx
  ActiveLineExplosion uses:
    className="… rounded-xl border border-border-soft bg-surface-card p-3"
  and item photos nest another rounded-lg bordered island. Flatten both.
- Per-unit editor is ActiveLineConditionSerial → ReceivingUnitRows →
  ConditionPills. UnitsExplosionDisplay must NOT pass stationCompact
  (editing surface). Station PO rows already use stationCompact + circle.

DO NOW

A) Flush plane (edge-to-edge, not rounded)
- Drop the Units tab WorkspaceCard glass wrapper (or replace with a flush
  host: no corner radius, no raised glass island, horizontal pad only if the
  Displays column already owns content inset — prefer matching sibling
  flush Displays bodies / UnboxPushColumn content edge, not a second card).
- ActiveLineExplosion: remove rounded-xl + card border + p-3 island.
  Use hairline section rules / space-y, flush to column content width.
- Item photos block: no nested rounded card; eyebrow + camera control +
  gallery on the same plane (border-b / sunken strip OK; rounded-lg island not).
- Sibling “Other lines on carton” list: no rounded-xl outer card; divide-y
  flush list is fine.
- Prebox CTA stays a local control in the body (law: tab-scoped actions stay
  local — never bridge to the dock).

B) Expanded condition + REMOVE grade
- Units display keeps ConditionPills FULLY EXPANDED (no collapsible circle
  here). Every unit row shows the full grade row.
- Grow ConditionPills (or a thin Units-only clear control composed next to
  it) so a selected grade can be CLEARED:
  - Preferred: re-click active pill clears → onChange('') / clear callback;
    OR an explicit trailing clear (X) when a grade is selected.
  - Wire clear through ReceivingUnitRows commitSlotGrade / setAllUnits and
    UnitsExplosionDisplay onConditionChange / onSetUnitGrade paths.
  - Line-level patch: condition_grade → null or '' (match existing patch
    contract on useUnboxLineController / ReceivingLineRow).
  - Per-unit: if /api/serial-units/[id]/grade cannot accept clear today,
    grow the route + setUnitGrade to allow clearing, or clear via the same
    unit-row helper markReceivingUnitCondition used for empty slots.
  - Do NOT invent a second condition picker. Grow ConditionPills SoT.

C) Keep composing
- ActiveLineConditionSerial, ReceivingPhotoButton, ItemPhotoStepBody,
  SerialChipWithMenu — compose, do not fork.
- Photos stay LINE-scoped (unbox_item + receivingLineId).

VERIFY
- npm run verify -- --fast then full npm run verify
- Guard: pin Units tab is NOT wrapped in WorkspaceCard glass / rounded-xl
  active shell (extend per-unit-no-serial-ui.guard or a small
  units-explosion.guard.test.ts)
- Manual on :3050: Unbox → open Displays → Units → active multi-qty line
  reads flush/square; pills expanded; clear removes grade from row + header
  chip; Station PO body still shows ConditionGradeCircle + scan icon only

DONE WHEN
- Units Displays body is edge-to-edge and square inside the push column
- Condition can be removed/cleared from this surface
- Station compact rows unchanged
- verify green
```

---

## 1. Files to touch

| File | Change |
|---|---|
| `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` | Units tab: remove `WorkspaceCard` glass wrapper (or flush equivalent) |
| `src/components/receiving/workspace/UnitsExplosionDisplay.tsx` | Flatten ActiveLineExplosion + photo island + sibling list chrome |
| `src/components/receiving/workspace/ConditionPills.tsx` | Add clear/remove selected grade (SoT growth) |
| `src/components/receiving/workspace/ReceivingUnitRows.tsx` | Wire clear through master + per-slot grades |
| `src/components/receiving/workspace/line-edit/hooks/useLineSerials.ts` (+ grade API if needed) | Allow clearing `serial_units.condition_grade` |
| Guard test near Units / ConditionPills | Pin flush mount + clear affordance |

## 2. Do not touch

- Station PO accordion `stationCompact` / `ConditionGradeCircle` (centre body)
- History inspector / `HistoryViewChrome*` (unrelated)
- Displays vs inspector vocabulary
- Dock / terminal bridges

## 3. Depth / flush law (compose, don’t invent)

- Displays push column already owns edge chrome (`UnboxPushColumn` /
  `ReceivingDisplaysPushStack`). Body content should sit on that plane —
  **not** a second raised card floating inside it.
- Depth = surface steps + hairlines, not decorative outer `m-*` / `rounded-xl`
  islands. See `.claude/rules/source-of-truth.md` → Depth elevation · Frame
  column budget; `.claude/rules/display/station-workbench.md` → Displays.

## 4. Acceptance checklist

- [x] No `rounded-xl` / glass card around the Units explosion active line
- [x] Content abuts Displays content edges (same L/R as other flush tab bodies)
- [x] Full `ConditionPills` row per unit (and master, if shown)
- [x] Clear/remove grade works for line default + per-unit
- [x] Prebox remains local in-body
- [x] `npm run verify` green
