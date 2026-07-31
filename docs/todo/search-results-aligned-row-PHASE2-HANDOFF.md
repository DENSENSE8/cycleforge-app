# Handoff — `/search` results UI Phase 2

**Status:** Phase 1 + Phase 2 **DONE** 2026-07-30 · run `npm run verify` before merge  
**Briefing (read only if needed):** [`search-results-grid-GEMINI-RESEARCH-BRIEFING.md`](./search-results-grid-GEMINI-RESEARCH-BRIEFING.md)

---

## Done (do not redo)

### Phase 1 — aligned Monitor feed
- Grid SoT: `src/components/search/search-result-grid.ts` (`SEARCH_RESULT_GRID`)
- Comfortable row: `SearchResultRow.tsx` → `ComfortableAlignedRow` (7 tracks; Reference = TrackingChip XOR SerialChip)
- Skeleton: `SearchResultRowSkeleton.tsx` (same tracks)
- Surface: `SearchResultsSurface.tsx` — flat RRF `MonitorListBlock`, no entity cards, `mode="wait"`
- Guards: `search-result-grid.guard.test.ts` + existing narrow-rail guard

### Phase 2 — refine / sort / entry-path rule / exact facets
- Client refine: `?etype=` + `?hstat=` via `FilterRefinementBar` (`SearchRefineControls.tsx` + `search-refine.ts`)
- Display sort: `QueueSortSwitch` → `?colsort=relevance` (default, omitted) | `date` (client sort by `facets.happened_at`)
- Route params: `SEARCH_ROUTE_PARAMS` owns `q` / `etype` / `hstat`; carries ambient `colsort`/`coldir` (never `type`/`status` — `/support` collision)
- `ToolbarSearchToggle` house rule re-cut around entry-path vs refinement: `/ops/photos` + `/search` (`ui-design-system.md`, `source-of-truth.md`); global header stays expanded + synced to `?q=` on `/search`
- Exact-hit facet hydration: `exactResultToHit` + parent-table SELECTs in `global-entity-search.ts`

**Never:** `LedgerGrid`, per-entity N+1 grids, dual Tracking+Serial columns, raise ratchets, crossfade the list on refine (filter/sort update children in place).

---

## Attach to `:3050`; never start/kill the dev server. `npm run verify` before done.
