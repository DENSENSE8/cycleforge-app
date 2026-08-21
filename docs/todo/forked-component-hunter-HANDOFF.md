# HANDOFF — Forked Component Hunter (one family at a time)

**Date:** 2026-08-12 · **Pin this as the goal.** Resume without the originating chat.
**Status:** two families landed this session (warranty, NumericStep). Next family needs a Phase-1 verdict before code.

**Companions (do not re-litigate):**
- `docs/todo/design-system-fork-consolidation-2026-PLAN.md` — D1–D12 + ignore set
- `docs/todo/design-system-fork-consolidation-2026-GEMINI-RESEARCH-BRIEFING.md` — genuine fork vs by-design vs C2
- `AGENTS.md` SoT tables + `node scripts/sot-lookup.mjs "<job>"`

---

## Goal (pin this)

Consolidate **one forked component family at a time** onto a single SoT. Protocol is mandatory:

1. **Phase 1 — Detect & HALT.** jscpd (`.jscpd.json` + `jscpd-baseline.json`) + file/API twins. Present Candidate A / B / new shell. **Do not edit until the user picks.**
2. **Phase 2 — Absorb.** Grow the winner’s API only for the loser’s unique job (`density` / optional props). No prop-bag bloat. No `className` hue/radius to fake the loser.
3. **Phase 3 — Route & delete.** All call sites → winner. **Delete the loser file.** Duplicate mounts of the same SoT on one surface also go.
4. **Phase 4 — Guard.** `retired-symbols.test.ts` (symbol) and/or `.dependency-cruiser.cjs` `not-to-match` (module path). Same-usecase test. AGENTS.md SoT row + `node scripts/build-sot-manifest.mjs`. Shrink jscpd clones (`node scripts/jscpd-gate.mjs --write`) if the family dropped a clone. `npm run verify` before done — **do not inherit parallel-session reds.**

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

jscpd clone baseline was shrunk **114 → 111** after warranty. Re-run `--write` after NumericStep if clones drop again. Gate compares **clone count only** (duplicatedLines is informational).

---

## Next family (Phase 1 — ask before coding)

**Station Displays action floors** (highest remaining structural twin):

| Candidate | Path | Job |
|---|---|---|
| A (shell already) | `StationDisplaysActionFloor` | Equal-fill Macro row host |
| B / C / D | `UnboxDisplaysActionFloor` · `ArrivalDisplaysActionFloor` · `TestingDisplaysActionFloor` | Verb sets: Unbox 5 (Print+Sync), Arrival 4 (no Print), Testing 3 (no Print/Sync) |

**Do not delete these.** They already compose the shell. Verdict to ask: extract one compound (`CartonDisplaysActionFloor` with optional Print/Sync slots) vs leave as thin station recipes.

After that (ranked, both doors imported — cannot just delete):

1. `SetPinPad` vs `StaffPinPad` — extract shared `THEME_NUMPAD`, keep both jobs
2. `BinBuilderMobile` vs `RackBuilderMobile` — larger than NumericStep; printer-family chrome
3. `DashboardDetailsStack` vs `TechDetailsStack` — Tech adds armed delete; maybe keep wrappers

~~`OrderCustomerFacts` vs `CustomerDetailsTab`~~ — **resolved 2026-08-21 by
deletion.** It was ranked under "both doors imported" but had zero importers:
a fork of `CustomerDetailsTab` whose only mount died with
`SearchOrderFactsColumn.tsx` in the `/search` station port. Rationale +
the lesson about verifying importer counts before ranking:
[`component-sot-consolidation-HANDOFF.md`](component-sot-consolidation-HANDOFF.md).

---

## Verify / collision rules

- Attach to `:3050`. Never start/kill the dev server. User owns commits. Stay on the checkout branch. No `git stash`.
- Other sessions are dirty on this tree. **Stage only hunter files.** Known reds that are NOT this program: `useOrdersImport.ts` (`phase`), `useGlobalWedgeScanner.ts`, `src/lib/perf/stream-apply.ts`, knip on new grid/perf/wedge exports, `grid-column-details-open.test.ts` (`window`).
- Do **not** run `scripts/portfolio-sot-sync.mjs` unless this session added a `docs/todo` file **and** `DOC-CATALOG.md` is otherwise clean.
- After AGENTS.md SoT-table edits: `node scripts/build-sot-manifest.mjs`.
- Lookup: `node scripts/sot-lookup.mjs "order warranty card"` · `"label-builder numeric step"`

## Start-here checklist

1. Read this file + PLAN §1 (D1–D12).
2. Confirm landed files still exist (losers gone; SoTs have the new props).
3. Run `node --import tsx --test src/lib/governance/same-usecase-forks.test.ts src/design-system/foundations/retired-symbols.test.ts`
4. Present the DisplaysActionFloor Phase-1 question. Halt.
5. After a verdict: absorb → delete nothing that still has a unique verb set → guard → verify.
