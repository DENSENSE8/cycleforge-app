# Unbox capture — condition pick advances to serial (select-never-clear)

Created 2026-08-10. Lane: current checkout — attach to `:3050`; never
start/restart/kill the dev server. User owns commits. Never raise a DS / knip
baseline.

**Depends on:** phase-1 in-row serial (landed) — `PoLineCaptureRow` already has
rest = full `ConditionPills` + Serial/Photos; Serial open =
`ConditionGradeCircle` (Tags square) + `SerialScanField` + Photos.

---

## Goal

On **any** condition grade press on the Unbox capture face (found · lined
unfound · empty stub · qty 1 · qty N · rollup — one SoT):

1. **Select** that grade (never clear / toggle off).
2. **Collapse** the condition multi-road to the leading Tags square.
3. **Open** the next step: full-width `SerialScanField` on the same row.

Same behavior everywhere `PoLineCaptureRow` mounts. No per-path forks.

```
Rest:   [ ConditionPills barDistribute | Serial | Photos ]
Pick:   → select grade →
Open:   [ Tags square | SerialScanField (flex-1) | Photos ]
```

Tags square click still returns to the full condition road (already wired via
`ConditionGradeCircle` → `closeSerial`).

---

## Where it is today

| Surface | Behavior |
|---|---|
| [`PoLineCaptureRow`](../../src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx) | Serial opens only via ScanBarcode segment (or `editingSerial`). Condition pick only calls `onConditionChange` — row stays on the full pill road. |
| [`ConditionPills`](../../src/components/receiving/workspace/ConditionPills.tsx) ~L360–366 | Re-clicking the **active** pill calls `onChange("")` (clear). Tooltip says "click again to clear". |

That clear-toggle is the complexity to kill. Capture advance is the missing
wire.

---

## Job 1 — select never clears (one place)

In `ConditionPills` pill `onClick`:

```ts
// BEFORE
if (selected === g.value) {
  onChange("");
  return;
}
onChange(g.value);
if (collapsible) setExpanded(false);

// AFTER
onChange(g.value);
if (collapsible) setExpanded(false);
```

- Drop the clear branch entirely — pick always commits that grade.
- Update the active-pill tooltip: remove "click again to clear"; use
  `conditionDescription(g.value)` only (same as inactive).
- Applies to **every** consumer of `ConditionPills` (Unbox capture, dock Band 1,
  SerialCard collapsible, Units flush) — one simpler law, no
  `clearOnReselect` prop fork.

Clearing a grade (rare) stays elsewhere if needed (meta / no-serial flows) —
not a re-click on the selected pill.

---

## Job 2 — condition pick advances the capture row

In `PoLineCaptureRow`, wrap the condition handler:

```ts
const handleConditionPick = (grade: string) => {
  onConditionChange(grade);
  // Any pick (including re-affirm of the same grade) advances to serial.
  openSerial();
};
```

Pass `handleConditionPick` to `ConditionPills` `onChange` instead of bare
`onConditionChange`.

Rules:

- Advance on **every** successful pick string from pills (Job 1 guarantees no
  `""` clear from a pill click).
- Do **not** open serial when the Tags square is pressed (that closes serial).
- `openSerial` already calls `onSerialPanelOpen` (stub re-arms dock) — keep it.
- Photos segment unchanged.

No second store: still `openPanel: 'serial' | null` only.

---

## Out of scope

- Dock Band 1 procedure advance / `focusStep('serial')` from a centre pick
  (optional follow-up — centre row owns mouse advance; dock wedge stays dock).
- Photos expanding in-row.
- Deleting Units Displays explosion.
- Progressive stage machine (stays dead).

---

## Guards

Grow [`po-line-capture-entry.guard.test.ts`](../../src/components/receiving/workspace/po-line-capture-entry.guard.test.ts):

- `ConditionPills` pill click does **not** contain `onChange("")` /
  `onChange('')` clear-on-reselect.
- Active tooltip does not say `click again to clear`.
- `PoLineCaptureRow` wires condition `onChange` through a handler that calls
  `openSerial` / `setOpenPanel('serial')` (assert both `onConditionChange` and
  open-serial in the same pick path — e.g. a named `handleConditionPick`).

Keep existing Tags-square + `SerialScanField` asserts.

---

## SoT one-liners (after green)

- [`.claude/rules/display/unbox-station.md`](../../.claude/rules/display/unbox-station.md) — capture face: condition pick collapses to Tags + opens serial.
- [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) / [`AGENTS.md`](../../AGENTS.md) — same one-liner; grade re-click never clears on `ConditionPills`.

---

## Verify

```bash
npx tsx --test \
  src/components/receiving/workspace/po-line-capture-entry.guard.test.ts \
  src/components/receiving/workspace/units-explosion.guard.test.ts \
  src/components/receiving/workspace/unmatched-items/unified-unfound-surface.test.ts
npm run verify
```

Bench on `:3050/unbox`:

1. Found qty-1 — press a grade → Tags left + serial field full width; caret in
   serial.
2. Re-press same grade after returning via Tags → still selected, advances to
   serial again (never clears).
3. Empty unfound stub + lined unfound — same advance.
4. Photos segment still present when serial is open.

---

## Order

1. Job 1 — kill clear-on-reselect in `ConditionPills`; tooltip; guards.
2. Job 2 — `handleConditionPick` → `openSerial` in `PoLineCaptureRow`; guards.
3. SoT one-liners; `npm run verify`.
