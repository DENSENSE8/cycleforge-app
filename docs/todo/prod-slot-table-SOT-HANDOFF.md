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

### Wave B — mechanical GRID leftovers (next)

`pnpm run eval:discover` (or the ledger Discover → DELETE). Delete only listed DELETE ids. Never KEEP (`engine:*`, `*COMPOUND_COLUMNS` / `*SHEET_COLUMNS`, catalogs, `DateRangePickerField`, `DataTableFilterMenu`).

Order: `hand-grid-export:catalog-link:CATALOG_LINK_GRID_COLUMNS` (next mechanical gap) → re-SoT `grid-default:receiving:*` onto `RECEIVING_COMPOUND_COLUMNS` and delete `RECEIVING_GRID_COLUMNS` + the orphaned `ReceivingGridRow` → `grid-default:incoming:*` / `INCOMING_GRID_COLUMNS` → daily / import-exception / tasks → `table-columns-zombie:support-tickets`.

### Wave C — station third engine

`StationListTable` / `StationHistoryTable` mount raw `LedgerGrid`. Kill-list 07 §5 / discover `out-of-waist-hand-model:station-history`. Register a binding+catalog **or** delete the host fork. Do not copy `STATION_HISTORY_COLUMNS` onto a product desk.

### Wave D — second engines (named debt)

`ADMIN_TABLE_DEBT` and `HAND_HTML_TABLE_DEBT` in `table-engine-law.ts` are shrink-only. Port each named file to `DataTable`. When the last AdminTable mount is gone, delete `AdminTable.tsx`. FBA catalog is orphaned on purpose — remount then register; do not register an unmounted table.

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
