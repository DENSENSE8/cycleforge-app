# Unbox Sheets-class triage + TradingView compare — initiative handoff

**Status:** implementing · **Lane:** main
**Plan:** Cursor plan `Unbox Sheets Triage` (do not re-litigate locked decisions).

## Locked decisions

| Decision | Choice |
|---|---|
| Color | **1A** — per-staff column washes + typed text emphasis (no per-cell freeform paint) |
| Edit depth | Collection map + Sheets right-click chrome; allowlisted menu triage edits in Phase 4 |
| Compare | `single` · `split` (1×2) · `quad` (2×2) with per-pane Unbox mode/facets |
| Engine | One `LedgerGrid` / `LedgerGridSurface` |

## Phase map

| Phase | Deliverable |
|---|---|
| **0** | Pane-capable query seam (`buildReceivingPaneModeState`) · Fields z-occlusion (`z-header` already on gutter) · this handoff |
| **1** | Text emphasis · header/row context menus · unlock `id`/`location` resize · Fit to data · Unbox zoom |
| **2** | `UnboxCompareHost` 1×2 · pane-local selection · URL `clayout` / `c0`… |
| **3** | Quad 2×2 · viewport floor downgrade · pane focus shortcuts · E2E |
| **4** | Allowlisted row-menu triage PATCH (location / lane / condition) — not full Horizon B in-cell |

## Non-goals

Freeform cell paint · CF rules · cell comments · `role="grid"` · Horizon C custom columns · outbound OOS\|Pending compare.

## Key modules

- `src/lib/receiving/receiving-pane-query.ts` — pane query → mode state
- `src/lib/receiving/unbox-compare-layout.ts` — layout + URL recipes
- `src/design-system/components/grid/grid-zoom.ts` — zoom steps / CSS var
- `src/components/receiving/unbox/compare/*` — compare host + pane table
- `src/design-system/components/grid/LedgerGridColumnContextMenu.tsx` — Sheets header menu
