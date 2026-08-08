# Handoff — move Testing per-unit rows out of the centre into a right-edge **Units** display

**Status:** open · **Lane:** main (dogfood) · **Opened:** 2026-08-08
**Goal (product):** units must not render as an expanded list in the **middle** of the screen. The PO line row shows an **edit affordance on the right**; the unit list (serials + per-unit controls) opens in a **Units right‑rail Display**.

---

## What's already right (do NOT touch)

- **Unbox is done.** Unbox's PO line serials cell already opens the right‑edge Units display: `onViewAllUnits` / `onEditSerialInDock` → `openDisplays('units')` → `UnitsDisplayHost` → `UnitsExplosionDisplay`. Unbox centre mounts no per‑unit list (its `activeRowSlot` only mounts the RETURN‑match band). Guard: `units-explosion.guard.test.ts`. Prior handoff: `docs/todo/units-explosion-display-flush-HANDOFF.md`.
- The right‑rail Units infra (`UnitsDisplayHost`, `UnitsExplosionDisplay`, `UnitSlotList`, `ReceivingUnitRows`) exists and is flush/edge‑to‑edge.

## The remaining offender — Testing

The mid‑screen unit list is the **Testing** station. It mounts per‑unit rows in the **centre** via `activeRowSlot`:

```
TestingPoItemsSection            src/components/tech/testing-panel/TestingPoItemsSection.tsx
  testingActiveRowSlot = ({serials, line}) => <TestingLineSlot …/>   // ← per-unit verdict rows in the CENTRE
    → passed as activeRowSlot to PoLinesAccordion / UnmatchedItemsSection
      → PoLineRow renders it under the PO line (the "units in the middle" the screenshot shows: ✓ 🔧 ✕ + serial + 🗑)
```

Testing's Displays (`build-testing-displays.tsx`) are: `ticket · listing · pairing · checklist · manuals · timeline · linkage` — **there is no `units` display.** So this is a **build**, not a one-line move: Testing needs its own right‑edge Units display before the centre rows can be removed.

`TestingLineSlot` carries **verdict** semantics (pass / repair / fail per unit) — distinct from Unbox's grade‑only `UnitsExplosionDisplay`. Do not assume Unbox's `UnitsDisplayHost` drops in unchanged.

---

## ⚠️ SoT ruling to record (the tension is real)

Two laws pull opposite ways; the product directive resolves them, but the resolution must be written down (`source-of-truth.md`):

- **Scan-station centre = ops-flow only** (`source-of-truth.md` → Scan-station centre lines display · `display/station-workbench.md`): *"QC (Testing): middle stays PO lines + Pass · Print."* By this, per‑unit verdict is the centre's ops flow.
- **Station Action vs Context planes** (`source-of-truth.md`): *"every scan station's Displays = Action (keyboard/wedge · dense fact rows)."* By this, a keyboard/wedge per‑unit mutation is an **Action plane** surface — i.e. the right‑edge Displays.

**Product ruling (this handoff):** the per‑unit list + controls are an **Action Display** on the right edge; the Testing centre keeps PO lines + the Pass/Print terminal, and the PO line exposes an **edit affordance** that opens the Units Display. Update the "Scan-station centre lines display" and "Station Action vs Context planes" rows so Testing's per‑unit verdict is named as a right‑edge Units **Action** Display, not a centre `activeRowSlot`. Do **not** leave the two laws contradicting each other after this lands.

---

## The build

1. **Add a Testing `units` Display.** Extend `build-testing-displays.tsx` with a `units` tab that hosts the per‑unit verdict surface (`TestingLineSlot` / the verdict `ReceivingUnitRows` variant), composed on `StationDisplaysPushStack` like the other Testing displays. Reuse the Action‑plane primitives (`src/components/station/displays/`) and the flush Units shell grammar from `UnitsDisplayHost` (fills column, `px-0`, no `DISPLAYS_BODY_INSET`, no glass island — see `units-explosion.guard.test.ts`). Keep verdict controls; do not silently swap them for grade‑only pills.
2. **Stop mounting units in the centre.** In `TestingPoItemsSection`, remove `activeRowSlot={testingActiveRowSlot}` from the centre PO‑items path (both the matched `PoLinesAccordion` and the `UnmatchedItemsSection` branches). The centre PO line becomes a pure ledger row (title + meta + serials preview), matching Unbox.
3. **Edit affordance on the PO line → open the Units Display.** Wire the serials cell / an edit control to `onViewAllUnits(line)` → `openDisplays('units')` (+ select the line first), exactly as Unbox does (`PoLineRow` already supports `onViewAllUnits` / `onEditSerialInDock`; Unbox reference: `LineEditPanel` `onViewAllUnits: (line) => { dispatchSelectLine(line); openDisplays('units'); }`). Do not invent a new mid‑row expander.
4. **Selecting a line** opens its units in the Display (drill by `receiving_line_id`); the Display header breadcrumb uses the 24px `StationDisplayLeafHeader` (already the eyebrow band).

## Constraints
- Centre stays PO lines + Pass/Print (station‑centre‑ops‑flow). No centre `activeRowSlot` unit list; no centre `SectionTabsSlider` strip.
- Units Display is a right‑edge push (`StationDisplaysPushStack`), never a `RightRailHost` occupant, never a centre overlay.
- Reachability: the `units` display must be reachable from the Displays index (`station-displays-reachability.guard.test.ts` — every declared display reachable). Add it to the Testing index rows.
- Wedge focus: opening the Display must not steal the scan bar; per‑unit verdict entry stays keyboard/wedge‑driven.
- Do not fork a second units renderer — compose `UnitSlotList` / `ReceivingUnitRows` (verdict variant), the same waist Unbox uses.

## Definition of done
- [ ] Testing centre mounts **no** per‑unit `activeRowSlot` list (both matched + unmatched paths).
- [ ] Testing has a right‑edge `units` Display hosting the verdict per‑unit rows; reachable from the Displays index.
- [ ] PO line serials/edit control opens the Units Display (`onViewAllUnits` → `openDisplays('units')`), Unbox‑parity.
- [ ] SoT rows updated so the two laws agree (per‑unit verdict = right‑edge Units Action Display).
- [ ] Guards: extend `units-explosion.guard.test.ts` (or a Testing sibling) to assert Testing centre has no `activeRowSlot` unit list and mounts a `units` Display; `station-displays-reachability.guard.test.ts` green.
- [ ] `npm run verify` green (note concurrent‑lane reds separately — `SidebarNav*` was red from another session at handoff time).
- [ ] Visual check on `:3050`.

## Anchors
- `src/components/tech/testing-panel/TestingPoItemsSection.tsx` (`testingActiveRowSlot`, `TestingLineSlot`)
- `src/components/tech/testing-panel/build-testing-displays.tsx` (add `units`)
- `src/components/tech/testing-panel/TestingPanel.tsx` (Displays host + openDisplays)
- Right‑rail Units reference: `src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx` · `src/components/receiving/workspace/UnitsExplosionDisplay.tsx` · `UnitSlotList.tsx` · `ReceivingUnitRows.tsx`
- Edit‑button pattern: `src/components/receiving/workspace/PoLineRow.tsx` (`onViewAllUnits` / `onEditSerialInDock`) · Unbox wiring in `LineEditPanel.tsx`
- Displays host: `src/components/station/displays/StationDisplaysPushStack.tsx`
- Laws: `.claude/rules/source-of-truth.md` → Scan-station centre lines display · Station Action vs Context planes · `.claude/rules/display/station-workbench.md`
- Guards: `units-explosion.guard.test.ts` · `station-displays-reachability.guard.test.ts` · `station-centre-ops-flow.guard.test.ts`
