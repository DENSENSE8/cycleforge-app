# Overnight GOAL — shared item ledger (WMS receive face)

**Host:** local coder (Hermes / Cursor). **Human:** verify Unbox two-line carton + `/search?sel=order:` + Pack checklist.  
**Plan of record:** [`docs/todo/item-record-wms-receive-ledger-PLAN.md`](../todo/item-record-wms-receive-ledger-PLAN.md)

**One hop per session.** Do not expand. Stop when that hop’s DONE WHEN is green, or when the whole plan §8 is green.

Paste from **GOAL** through **STOP** into the overnight loop as the task text.

---

## GOAL

There is one item identity ledger: `ItemRecordRow` + `ItemRecordMetaGrid` + `ItemRecordQtyBadge` + `ItemRecordCard`. Unbox, Testing, Arrival, Pack, `/search` Items (order / unit / SKU / repair / FBA / receiving), shipped product detail, and carton contents all paint **that** face. No new `*Row` / `*MetaGrid` / `*GridRow` / `*_GRID_COLUMNS`.

Execute **the first hop in the PLAN §4 table whose DONE WHEN is not met.** Follow that hop’s Impeccable command (`/clarify`, `/harden`, `/normalize`, `/bolder`, `/distill`, `/critique`) on the shared files, then stop.

Locked deliverables (whole plan, not one hop):

1. Qty is listed vs got vs remaining. Live Unbox never paints door-scan `1/1` as complete. Emerald is not the only Received mark.
2. Unbox lines can be marked Received or Not received (`SHORT`). Carton Print · Receive stays on the mouth (`WeldedFeedbackPanel`). Search/pack/shipped do not grow those verbs.
3. Meta tracks: **qty → price → condition → SKU → serial → location**.
4. Default station depth **mill**; column rules via `outline`; Received recedes; Open/Short heat. No drop shadows.
5. Items band is a receive meter, not `PO items · N`.
6. Absorb `ReceivingLineContentsRow` and the local `PoLineRow` in `PoLinesSection.tsx`.

`ds_contract` + `ds_tokens` (station-depth, station-skin, elevation) before any `src/**/*.tsx` write. Graph: `find_symbol` → `impact_analysis` on `ItemRecordRow` / `ItemRecordMetaGrid` / `ItemRecordQtyBadge` before signature changes. Gate: `cursor-eval --fast`; `pnpm run eval:station unbox` and/or `pack` if those workspaces moved. Stamp `.cursor/eval-session.json`.

## HOW IT MUST FUNCTION

- Grow `ItemRecord` / mappers. Hosts only map.
- `PoLineMetaGrid` remains a pass-through door.
- `ItemRecordMobileMeta` stays the phone cluster — never the desk six-track.
- OS&D: existing `SHORT` / `OVER` / `DAMAGED` / `WRONG_ITEM` on `RECEIVING_LINE`. Do not splice new codes mid-array in `exception-codes.ts`.
- Carton GR blocked until remaining = 0 or leftovers are exception-coded (`carton-readiness` line counts).
- Confirm copy matches PLAN §3. Mouth reaction is `WeldedFeedbackPanel` only.

## HOW IT MUST NOT FUNCTION

- Do **not** fork a second item row for search, stations, or detail.
- Do **not** fold Queue/Viewed/History into the funnel.
- Do **not** delete overlay `visibility` / `zIndex.panel`.
- Do **not** invent Operator verdict or LEDGER Open gaps.
- Do **not** add FilterRefinementBar, hunt tiles, standing keycaps, cheat sheet from `?`.
- Do **not** touch CompoundItem / slot-table header-sort / `DataTableFilterMenu` / To-ship `UnshippedTable`.
- Do **not** toast line receive. Do **not** add a second composer.
- Do **not** lower lighthouse-baseline floors. Do **not** default depth back to `flat`.
- Do **not** recast serial-unit `1/1` as PO receive (one physical unit).
- Do **not** start hop N+1 in the same session.

## ALLOWED FILES

Shrink toward PLAN §6. If a type must move, touch the `.ts` next to the call. Do not “while here” DataTable or overlay shell law.

## DONE WHEN (this hop)

The hop’s row in PLAN §4 is true. `verify:fast` green. Critique ran on edited UI files.

## DONE WHEN (whole overnight — stop the loop)

PLAN §8. Human verifies Unbox two Bose-class lines, then `/search?sel=order:` and Pack still show the same track order.

## STOP

Do not start Claim redesign, last-8 law, or slot-table cells. Hand back for human verify.
