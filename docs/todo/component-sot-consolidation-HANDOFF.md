# HANDOFF — Component SoT consolidation (one family at a time)

**Date:** 2026-08-12 · **Pin this as the goal.** Resume without the originating chat.
**Status:** four families landed (warranty, NumericStep, carton Displays Macro, PIN numpad theme). A fifth, `OrderCustomerFacts` vs `CustomerDetailsTab`, resolved 2026-08-21 by **deletion, not a `density` prop** — see below. Next: BinBuilderMobile vs RackBuilderMobile (Phase 1 first).

**Companions (do not re-litigate):**
- `docs/todo/design-system-fork-consolidation-2026-PLAN.md` — D1–D12 + ignore set
- `docs/todo/design-system-fork-consolidation-2026-GEMINI-RESEARCH-BRIEFING.md` — genuine twin vs by-design vs C2
- `AGENTS.md` SoT tables + `node scripts/sot-lookup.mjs "<job>"`

---

## Goal (pin this)

Consolidate **one duplicated component family at a time** onto a single SoT. Protocol is mandatory:

1. **Phase 1 — Detect & HALT.** jscpd (`.jscpd.json` + `jscpd-baseline.json`) + file/API twins. Present Candidate A / B / new shell. **Do not edit until the user picks.**
2. **Phase 2 — Absorb.** Grow the winner’s API only for the loser’s unique job (`density` / optional props). No prop-bag bloat. No `className` hue/radius to fake the loser.
3. **Phase 3 — Route & delete.** All call sites → winner. **Delete the loser file.** Duplicate mounts of the same SoT on one surface also go.
4. **Phase 4 — Guard.** `retired-symbols.test.ts` (symbol) and/or `.dependency-cruiser.cjs` path ban. Same-usecase test. AGENTS.md SoT row + `node scripts/build-sot-manifest.mjs`. Shrink jscpd clones (`node scripts/jscpd-gate.mjs --write`) if the family dropped a clone. `npm run verify` before done — **do not inherit parallel-session reds.**

Blessed — **never flatten:** C2 station Displays vs `RightRailHost`; per-`entityFamily` grid cell registries; Unbox / Scan-out sheet exceptions.

---

## Landed this session (uncommitted)

### Family 1 — Order warranty card
- **SoT:** `OrderWarrantySummary` · `src/components/order-record/OrderWarrantySummary.tsx`
- **API:** `{ order, density?: 'compact' | 'pane' }` — compact = Search facts rail; pane = exclusive order tab (clock facts + all claims)
- **Deleted:** `src/components/shipped/details-panel/OrderWarrantySection.tsx`
- **Call sites:** `ShippedDetailsBody` (`density="pane"`); `SearchOrderFactsColumn` (compact). **Removed duplicate mount** from `SearchOrderEvidenceColumn`.
- **Guards:** retired symbol `OrderWarrantySection`; dep-cruiser `no-retired-order-warranty-section`; same-usecase `it('one order warranty face')`

### Family 2 — Label-builder NumericStep
- **SoT:** `NumericStep` · `src/components/barcode/bin-label-printer/NumericStep.tsx`
- **API growth:** `prefix?` defaults `''` (rack never needed it; bin still passes `prefix=""`)
- **Deleted:** `src/components/barcode/rack-printer/NumericStep.tsx`
- **Call sites:** `RackBuilderDesktop` + `RackBuilderMobile` import the bin SoT
- **Guards:** dep-cruiser `no-retired-rack-numeric-step`; same-usecase `it('one label-builder NumericStep')`

jscpd clone baseline was shrunk **114 → 111** after warranty. Re-run `--write` after NumericStep / carton floor if clones drop again. Gate compares **clone count only** (duplicatedLines is informational).

### Family 3 — Station carton Displays Macro verbs
- **Host SoT:** `StationDisplaysActionFloor` · `src/components/station/displays/StationDisplaysActionFloor.tsx` (equal-fill row, null-when-empty)
- **Verb compound:** `CartonDisplaysActionFloor` · `src/components/station/displays/CartonDisplaysActionFloor.tsx`
- **API:** optional `print` / `sync` slots. Peer order from `cartonFloorPeerOrder`.
- **Recipes kept (do not delete):** `UnboxDisplaysActionFloor` (Print+Sync) · `ArrivalDisplaysActionFloor` (Sync) · `TestingDisplaysActionFloor` (neither)
- **Guards:** same-usecase `it('one carton Displays Macro compound')`. No retired-symbol (recipes stay).

### Family 4 — Staff PIN numpad theme
- **SoT:** `THEME_NUMPAD` · `src/components/auth/theme-numpad.ts` (`numpadTheme()`)
- **Key cell:** `PinPadKey` · `src/components/auth/PinPadKey.tsx`
- **Identity header:** `PinPadStaffHeader` · `src/components/auth/PinPadStaffHeader.tsx`
- **Jobs kept (do not delete):** `StaffPinPad` (sign-in / switch / kiosk step-up) · `SetPinPad` (first-time enter+confirm)
- **Guards:** same-usecase `it('one staff PIN numpad theme')`; `theme-numpad.test.ts`

---

## Next family (Phase 1 — ask before coding)

After that (ranked, both doors imported — cannot just delete):

1. `BinBuilderMobile` vs `RackBuilderMobile` — larger than NumericStep; printer-family chrome
2. `DashboardDetailsStack` vs `TechDetailsStack` — Tech adds armed delete; maybe keep wrappers

**Resolved 2026-08-21 — `OrderCustomerFacts` vs `CustomerDetailsTab`.** It was
ranked here as a `density` merge on the premise that *both doors were imported*.
That premise was wrong: `OrderCustomerFacts` had **zero** importers. It was a
fork of `CustomerDetailsTab` — same `/api/customers/:id` query and query key,
byte-identical `fullName` / `addressLines`, the same four fields (Name · Email ·
Phone · ship-to) and the same "Copy full address" — whose only mount had ever
been `SearchOrderFactsColumn.tsx`, deleted wholesale in the `/search` station
port. Its field set was a strict subset of the live component's, so the file was
deleted rather than merged; `CustomerDetailsTab` (mounted at
`DashboardDetailsStack.tsx:121`) is the surviving SoT and grew no props.

**The transferable lesson: check importer counts before ranking a family.** A
"consolidation" whose loser is already dead is a deletion, and costs a fraction
of a `density` merge. Two handoffs carried this row for weeks describing a
two-door merge that the tree did not contain.

---

## Verify / collision rules

- Attach to `:3050`. Never start/kill the dev server. User owns commits. Stay on the checkout branch. No `git stash`.
- Other sessions are dirty on this tree. **Stage only hunter files.** Known reds that are NOT this program: `useOrdersImport.ts` (`phase`), `useGlobalWedgeScanner.ts`, `src/lib/perf/stream-apply.ts`, knip on new grid/perf/wedge exports, `grid-column-details-open.test.ts` (`window`).
- Do **not** run `scripts/portfolio-sot-sync.mjs` unless this session added a `docs/todo` file **and** `DOC-CATALOG.md` is otherwise clean.
- After AGENTS.md SoT-table edits: `node scripts/build-sot-manifest.mjs`.
- Lookup: `node scripts/sot-lookup.mjs "order warranty card"` · `"label-builder numeric step"` · `"station carton Macro verbs"` · `"staff PIN numpad theme"`

## Start-here checklist

1. Read this file + PLAN §1 (D1–D12).
2. Confirm landed files still exist (losers gone; SoTs have the new props).
3. Run `node --import tsx --test src/lib/governance/same-usecase-forks.test.ts src/design-system/foundations/retired-symbols.test.ts src/lib/receiving/station-displays-carton-floor.test.ts src/components/auth/theme-numpad.test.ts`
4. Next family Phase 1: BinBuilderMobile vs RackBuilderMobile. Halt until pick.
   (`OrderCustomerFacts` vs `CustomerDetailsTab` is done — resolved by deleting
   the zero-importer fork on 2026-08-21, not by a `density` merge.)
