# HANDOFF — Port every desk onto the one slot DataTable

**Goal:** one display engine. No second table, no family GridHost, no URL find-bar.
**Lane:** `~/Projects/cycleforge-lanes/prod` (detached, port 3077). Never start `:3050`.
**You are continuing a live session.** Read this, the tour, then execute the next undone wave. Do not overlay main.

| Role | File |
|---|---|
| Constitution | `src/lib/tables/table-engine-law.ts` |
| Tour | `.tours/architect-slot-table-engine.tour` |
| Plan of record | `docs/todo/slot-based-metadata-table-PLAN.md` |
| Delete-zone | `docs/kill-list/07-slot-table-hand-models.md` |
| Prior plan | `docs/todo/prod-slot-table-simplify-PLAN.md` (steps 1–3 **done**) |

```
catalog + SlotLayout → materializeTracks → DataTable
Feed modules (UnshippedTable, ReceivingLinesTable) stay feeds. They are not grids.
```

Acceptance: `TABLE_ENGINE_ACCEPTANCE` — a new family is catalog + resolver + adapter + registry. Zero new `.tsx`. A verb reaches every mount that binds its field.

---

## Done (do not redo)

- Find-bar is session-local on To-ship, Shipped, Staged, Review packing, Review pairing. Matcher: `filterShippedOrdersByQuery`. Guard: `src/lib/tables/data-table-search-url.guard.test.ts`.
- `OrdersGridHost.tsx` **deleted**. Those four lanes spread `useOrdersSpreadsheet` onto `DataTable`. Copy-export lives on the spreadsheet return.
- DataTable rule 3 rewritten: search is local; facets/tabs/`?sort=` may stay URL.
- **Wave A done (2026-09-10):** `ReceivingGridHost.tsx` **deleted**; Unbox / History / Testing all mount `ReceivingSpreadsheet` → `DataTable` (`useReceivingSpreadsheet.tsx`). Testing History paints `RECEIVING_COMPOUND_COLUMNS` with its own `tableId: 'testing'` (Fields prefs no longer fight receiving). Receiving find-bar is `useState` + `receivingLineMatchesQuery` — never the URL. Discover debt `flat-mount:receiving:TestingHistoryList` ratcheted OUT; the flat-mount scanner is now the regression tripwire for that mount.
- **Photo library (2026-09-11):** the Media Library find-bar is session-local. It used to `patch({ poFinder })` per keystroke, which soft-navigated `/ops/photos` and refetched the library — the wrong input for a filter. Matcher: `filterPhotosByQuery` / `photoMatchesQuery` (`src/lib/photos/photo-find.ts`) over the row's PAINTED facts plus the identifiers the finder-kind menu advertises; the kind menu is now a local field scope, not `?poFinderKind=`. `poFinder` / `q` survive only as deep-link filters (claims folder links) and as the server SQL that serves them. Auto-paging is gated while a query is typed (`PhotoLibraryLoadMoreSentinel autoLoad`) so a no-match find cannot page the whole library. Guard: the `photo library find-bar` case in `data-table-search-url.guard.test.ts`. Dead `photoLibrarySearchFace` deleted.
- **Kiosk (2026-09-11):** audited, already compliant — the catalog find is `useState` in `KioskShell` handed to `ProductSelector` as data. Pinned by the `kiosk catalog find` case in the same guard test. Page-level plan: `docs/todo/kiosk-overall-page-PLAN.md`.
- **Wave B done (2026-09-11):** the Discover DELETE list is **empty** — "No mechanical deletes. Dual-SoT hand models are gone." Deleted `RECEIVING_GRID_COLUMNS`, `INCOMING_GRID_COLUMNS`, `TASKS_GRID_COLUMNS`, `IMPORT_EXCEPTION_GRID_COLUMNS`, plus the three `grid-default:` fallbacks that re-SoT'd a flat model by silence (`ReceivingGridRow` / `IncomingGridRow` / `incoming-grid-descriptor` now take `columns` as a REQUIRED prop). Derived values were re-expressed, never re-derived from a dead array: locked keys come from the compound materialization (`gridFrozenKeys(RECEIVING_COMPOUND_COLUMNS)`), the sort vocabulary is an explicit literal, and the comparator reads `RECEIVING_SORT_FACT_TYPES` (fact-keyed) instead of `.find(c => c.key === fact)?.type`. `receivingGridFrozenLeft` / `incomingGridFrozenLeft` / the `*GridTemplate` wrappers are gone — cells derive sticky offsets and the frozen EDGE from the mounted `ctx.columns`, the rule `CompoundGridCell` already followed. `shared-line-tracks.ts` died with its only two consumers. `SLOT_TABLE_KNOWN_DEBT` ratcheted from 10 ids to 3, all judgment. The flat-mount scanner is now GENERIC (`columns={*_GRID_COLUMNS}` on any file), so it guards the regression class instead of one dead symbol.
- **Do not** `git checkout main -- DataTable.tsx` / `UnshippedTable.tsx` / `table-engine-law.ts`. Prod is ahead.

Golden mount (copy this):

```tsx
const chrome = useToShipChrome(...)
const sheet = useOrdersSpreadsheet({ searchValue: chrome.search.value, ... })
<DataTable {...sheet} {...chrome} />
```

Receiving equivalent: `<ReceivingSpreadsheet columns={receivingCompoundColumnsFor(layout)} tableId="…" search={localSearch} … />`.

---

## Remaining waves (one at a time)

### Wave A — inbound display fork — **DONE 2026-09-10, see Done**

### Wave B — mechanical GRID leftovers — **DONE 2026-09-11, see Done**

`pnpm run eval:discover` now prints "No mechanical deletes. Dual-SoT hand models are gone."
There is nothing left in this wave to execute. `SLOT_TABLE_KNOWN_DEBT` holds three
ids and every one is `verdict: 'judgment'` — a codemod cannot close them.

### Wave C — station third engine — **DONE 2026-09-12**

Operator ruling: register, do not delete. `tech` and `packer` are now real
families (`field-catalog/tech.ts` · `packer.ts` + resolvers, `bench-grid/`
materializations + layout hooks + bindings, `benchRowCompoundView`), and
`StationHistoryTable` mounts `DataTable` through `useBenchSpreadsheet` →
`useCompoundSpreadsheet`. **Deleted:** `STATION_HISTORY_COLUMNS`,
`StationQueueRow`. Both are now `retired-symbols` entries, so they cannot come
back. Benches gained header click-to-sort, the filter funnel, a Fields picker,
saved views that capture columns and selection-copy; the week pill, the board
and the `?techLogId=` deep link are unchanged. `OrdersQueueColumnKey` gained the
missing `dates` member (`COMPOUND_TRACKS` paints it on every compound family).
The out-of-waist scanner is now GENERIC (any `readonly *_COLUMNS` array outside
the waist), so it guards the class instead of one dead symbol. Cohort: 25 peers.

**Residual, named honestly:** `StationListTable` survives ONLY as
`StationPipelineBoard`'s lane body (a swimlane board, a different display kind,
behind `STATION_PIPELINE_BOARDS`), shared with Receiving and Testing history.
It is no longer a TABLE fork. Porting board lanes is its own unit of work.

### Wave D — second engines (named debt) — **DONE 2026-09-12**

`ADMIN_TABLE_DEBT` is **empty**. Every settings / admin-SKU-ops desk is a
registered family on the one slot `DataTable`; cohort is `ok: true` at **44
peers, 44 enginePeers, discoverDelete 0**, and the only surviving `AdminTable`
importer is `/settings/ai`, which is the `ADMIN_TABLE_ALLOW` ruling (a row is a
`GROUP BY (context, provider, model)` bucket, not an entity). Completion record,
per-desk rulings and the residuals:
`docs/todo/prod-slot-table-WAVE-D-HANDOFF.md`.

The one remaining `HAND_HTML_TABLE_DEBT` desk is the incoming returns staging
host, and it is deliberately unported: `CsvImportStagingHost` is hard-wired to
orders-import, so generalising it is an engine change the operator rules. Plan
(no code): `docs/todo/csv-import-staging-generalisation-PLAN.md`.

<details><summary>Wave D as dispatched (historical)</summary>

Operator ruled: port desk by desk. A read-only inventory of all 19 debt entries
(= 18 unique files; throughput appears twice) is at `agent://WaveDInventoryB`,
with per-desk facts, tableId/catalog proposals, blockers and a dispatch order.

**Landed 2026-09-12 (4 desks, cohort 28 peers):** `auth-sessions`
(`/settings/sessions`; Revoke became a row verb + `AuthSessionRevokePlane`,
replacing `window.confirm`), `cycle-counts` (`/admin/inventory/cycle-counts`;
row navigates to the campaign), `admin-returns` (`/admin/inventory/returns`;
a SIBLING document over `inventory-events` — five field ids reused BY REFERENCE,
three minted), and the two reuse slices of `/admin/inventory/sku/[sku]` (units →
`inventory-units`, events → `inventory-events`; no new family at all).

**Rulings that shape the rest (2026-09-12):**
- **The throughput heatmap is NOT ported.** It moved to `HAND_HTML_TABLE_ALLOW`:
  data-derived hour columns, cells with no text (an `rgba()` intensity tile), a
  row that is a grouping key. Expressing it needs a per-family visual cell or a
  weaker adapter contract — the two things `ENGINE_IS_MONOMORPHIC` forbids.
- **Aggregates are not families.** Throughput by-actor and the allocation-state
  buckets become chips/tiles, not registrations. `/settings/ai` usage stays a
  table but is an allow-list exemption, not a family. A row must be one entity.
- **`FlagsSection` becomes a definition list** (three columns of process env,
  keyed by env-var name — nothing to rebind).
- **The returns-import staging host reuses `CsvImportStagingHost`**, never a
  nineteenth family; the gating question is whether that host takes a second
  descriptor.

**Engine rules re-affirmed while integrating (both agents had to be corrected):**
`COMPOUND_SKELETON_FILTER_DEBT` is shrink-only, so a new mount may NOT `.filter`
chrome off `compoundColumnsFor` — it mounts the skeleton whole and relabels
headers instead. When that pushes a mount past `MAX_DEFAULT_VISIBLE_TRACKS`,
ship the least scan-critical fact UNBOUND (the house form of the old
`tier: 'optional'`), and give every painted DATA track — including the `dates`
chrome — a sort fact.

**Dispatch list as written at the time** (all of it landed — see the Wave D
completion record): ByUnitView + the shared `unit-allocations` family, the rest
of `sku/[sku]` (bins · allocations · ledger), CompatibilityManagementTab,
settings/audit, settings/ai, holds, bulk-allocate, the staging host,
TableSections (four families in one file), reports (three families, no typed
rows), StaffTable (an editable two-control auth cell), cycle-count LINES
(editable cell + two verbs). `AdminTable.tsx` was strictly last and is still
alive for exactly one ALLOW surface.

</details>

---

## Anti-patterns

| Move | Why it fails |
|---|---|
| Overlay main `DataTable.tsx` | Drops prod grouping |
| New `*GridHost` | The class Wave A deletes |
| `family === 'orders'` inside DataTable | ENGINE_IS_MONOMORPHIC |
| `?search=` / `?q=` per keystroke | Soft-nav remount |
| `eval:cohort overlay` | Does not exist. Display eval is `slot-table` |
| Deleting a KEEP discover row | Cohort fail |
| Starting `:3050` | Operator's server |

---

## Verify (every wave)

```bash
cd ~/Projects/cycleforge-lanes/prod
npx tsc -p tsconfig.json --noEmit
node --import tsx --test src/lib/tables/data-table-search-url.guard.test.ts src/lib/tables/table-engine-law.test.ts src/lib/tables/slot-table-cohort.test.ts
pnpm run eval:cohort slot-table   # tripwire must pass; verify:fast may be dirty from unrelated unused-imports
```

Stop when: zero `*GridHost` TSX, Testing History off `RECEIVING_GRID_COLUMNS`, find-bar never writes URL on Unbox/History/Testing, Discover DELETE list only shrinks, no new `.tsx` for a family.
