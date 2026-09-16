# CSV import staging — generalising `CsvImportStagingHost` off `orders-import`

**Status:** PLAN ONLY. No code in this change.
**Scope:** the last `HAND_HTML_TABLE_DEBT` row,
`src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx`
(`src/lib/tables/table-engine-law.ts:238-241`).
**Written:** 2026-09-12, Wave D. Every claim below carries a `path:line` read
from the lane `cycleforge-lanes/prod` at that date. Where a symbol does not
exist, this document says *does not exist* rather than naming a plausible one.

The operator ruling this plan obeys: the debt row offers two exits — "reuse that
host (or register an incoming-import family)"
(`src/lib/tables/table-engine-law.ts:240`). Reuse requires generalising a host
that is hard-wired to one family, which is an ENGINE change. So the deliverable
is the plan, and the debt row **stays** until it is executed.

---

## 1. Proof of the hard-wiring

Every symbol in `src/components/outbound/orders/CsvImportStagingHost.tsx` that
names `orders-import`, classified as **(a)** a descriptor parameter in disguise,
**(b)** a family binding (needs a per-family artifact), or **(c)** genuinely
generic (already family-agnostic, or trivially made so).

| line | symbol / expression | class | note |
|---|---|---|---|
| 41-43 | `import { ORDER_IMPORT_DESCRIPTOR, type OrderImportRowView }` | (a) | the only import that has to become a type parameter + prop |
| 59 | `import { CsvImportStagingRail }` | (b) | `IncomingReturnsImportStagingRail` already exists as a sibling fork (`src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingRail.tsx:1-49`) and is mounted by the *caller*, not this host (`src/components/station/ReceivingLinesTable.tsx:914`) |
| 60 | `import { CSV_IMPORT_STAGING_TABLE_BINDING }` | (b) | `TableSurfaceBinding<OrderImportRowView, CsvImportStagingGridColumn>` (`.../csv-import-staging-table-definition.ts:35-43`) |
| 61 | `import { useOrdersImportTableLayout }` | (b) | `(): SlotTableLayout` (`.../useOrdersImportTableLayout.ts:26-35`) |
| 62-65 | `import { CsvImportStagingGridRow, csvImportStagingRowKey }` | (b) row component / (c) row key | `csvImportStagingRowKey` is `` `staging:${row.index}` `` (`.../CsvImportStagingGridRow.tsx:40-42`) — generic over `{ index: number }`. `CsvImportStagingGridRow` is a `.tsx` with an `orders-import.*` `renderValue` switch (`.../CsvImportStagingGridRow.tsx:96-152`) — the sharpest engine problem after `compareStagingRows` |
| 66-73 | `csvImportStagingSheetColumnsFor`, `csvImportStagingSortFactFor`, `defaultDirForCsvImportStagingColumn`, `isCsvImportStagingColumnSortable`, `CsvImportStagingGridColumn(Key)` | (b) | all four functions are family-shaped only via the catalog they materialize (`.../csv-import-staging-grid-layout.ts:104-114`, `124-131`, `134-139`, `161-167`) |
| 75 | `import { refreshDomain }` … used at 228 as `refreshDomain('orders.outbound')` | (b) | hard-wired domain string |
| 84 | `CSV_IMPORT_STAGING_SELECTION_SCOPE = 'csv-import-staging'` | (c) | family-neutral literal, but one shared bus key for two surfaces; derive it per `surfaceId` |
| 87 | `const SURFACE = ORDER_IMPORT_DESCRIPTOR.surfaceId` | (a) | the single root of every store call in the file (`156`, `197`, `198`, `235`, `236`, `339`, `349`, `350`, `380`, `386`, `387`) |
| 89-93 | `STATUS_FILTERS` | (c) | byte-identical to `IncomingReturnsImportStagingHost.tsx:59-63`; belongs on the engine |
| 95-121 | `compareStagingRows` | (b) | `switch` over seven `orders-import.*` fact-id literals; see §2 |
| 125 | `useTableImportParam(ORDER_IMPORT_DESCRIPTOR)` | (a) | the hook is **already generic**: `useTableImportParam<TField, TRowView>(descriptor)` (`src/hooks/useTableImportParam.ts:35-42`) |
| 133-134 | `useOrdersImportTableLayout()` | (b) | a HOOK, so it cannot be selected behind a conditional — see §6 step 3 |
| 160, 172 | `listTableImportRows(ORDER_IMPORT_DESCRIPTOR, …)`, `tableImportConfirmTargets(ORDER_IMPORT_DESCRIPTOR, …)` | (a) | both already generic in the store (`src/lib/tables/import/staging-store.ts:211-213`, `250-253`) |
| 166 | `RowGroup<OrderImportRowView>` | (a) | type parameter only |
| 203-230 | `handleConfirm` | mixed | `requestConfirm` copy 207-216 is orders prose (b); `ORDER_IMPORT_DESCRIPTOR.commit` 222 is (a); `refreshDomain('orders.outbound')` 228 is (b) |
| 241-250 | `handleCancelDraft` | (b) | "Nothing has been written to To-Ship yet" (244) is orders copy, and the returns host has **no** cancel confirm at all (`IncomingReturnsImportStagingHost.tsx:227-229`) |
| 252-261 | no-draft fallback, "Back to To-Ship" (257) | (b) | returns copy differs (`IncomingReturnsImportStagingHost.tsx:163-169`) |
| 270 | `data-testid="csv-import-staging-identity"` | (c) | shared chrome id; returns does not paint it today |
| 275-277 | `{draft.rows.length} rows` | (b) | returns paints ready/action/total from `summarizeTableImportDraft` instead (`IncomingReturnsImportStagingHost.tsx:94-97`, `191-195`) |
| 304 | `data-testid="csv-import-staging-confirm"` | (c) | **both** hosts already paint it (`IncomingReturnsImportStagingHost.tsx:234`) |
| 318 | `data-testid="intake-bulk-grid"` | (b) | orders-only id, asserted at `tests/e2e/order-intake-acknowledgment.spec.ts:592` |
| 319-322 | `DataTable<OrderImportRowView, CsvImportStagingGridColumnKey, CsvImportStagingGridColumn>` | (a) | `DataTable` is already `<Row, K, C>` (`src/components/tables/DataTable.tsx:1389`) |
| 366 | `<CsvImportStagingRail onDiscardSelected={…} />` | (b) | see 59 |
| 373-391 | `StagingLeaf` | (b) | closes over module-level `SURFACE` (`380`, `386`, `387`) and renders `CsvImportStagingGridRow` |

**Three dead locals found while reading, unrelated to the port but worth one
line:** `filterOpen` / `setFilterOpen` (`CsvImportStagingHost.tsx:128`),
`activeFilterLabel` (`264-265`) and `cellValue`
(`CsvImportStagingGridRow.tsx:77-94`) have no other reference in their files — the filter
chrome moved into `DataTable filter={…}` (`342-351`). Delete them in whichever
change touches this host next; do not carry them into a generic host.

**Count:** 6 descriptor-parameters, 14 family bindings, 5 genuinely generic.
The host is hard-wired, and the debt row's phrase "reuse that host" is not
available today.

---

## 2. Current vs proposed TYPE table

The proposed shape is **one staging SURFACE PACK per family**, passed to the host
as a single prop, because the host needs ~9 correlated artifacts and 9 loose
props would let a caller pair one family's columns with another family's rows.

```ts
// proposed — src/lib/tables/import/staging-surface.ts (NEW, engine-owned)
export interface TableImportStagingSurface<
  TField extends string,
  TRowView extends { index: number; status: 'ready' | 'action_required' },
  K extends string,
  C extends LedgerGridColumnModel,
> {
  descriptor: TableImportDescriptor<TField, TRowView>;
  binding: TableSurfaceBinding<TRowView, C>;
  useLayout: () => SlotTableLayout;
  columnsFor: (layout: SlotLayout) => readonly C[];
  sortFactFor: (col: C) => string | null;
  isSortable: (columns: readonly C[], key: string) => key is K;
  defaultDirFor: (columns: readonly C[], key: string) => GridSortDir;
  compareRows: (a: TRowView, b: TRowView, fact: string, dir: GridSortDir) => number;
  gridTestId: string;
  confirmCopy: TableImportConfirmCopy | null;  // null ⇒ commit without a dialog
  onCommitted: (outcome: TableImportCommitOutcome) => string | null; // → post-commit href
}
```

| symbol | current type / signature (path:line) | proposed generic type |
|---|---|---|
| surface const | `const SURFACE = ORDER_IMPORT_DESCRIPTOR.surfaceId` — `string`, module scope (`CsvImportStagingHost.tsx:87`) | `const surface = surface.descriptor.surfaceId` — component scope. Module scope is exactly why `StagingLeaf` (`373-391`) cannot be reused: it reads the module const at `380`. `StagingLeaf` takes `surfaceId` as a prop. |
| table binding | `CSV_IMPORT_STAGING_TABLE_BINDING: TableSurfaceBinding<OrderImportRowView, CsvImportStagingGridColumn>` (`csv-import-staging-table-definition.ts:35-38`) | `surface.binding: TableSurfaceBinding<TRowView, C>`. Each family keeps its OWN `parseTableDefinition` call: `id`, `tableId`, `entityFamily`, `cellMapKey`, `testId` are all per-family (`csv-import-staging-table-definition.ts:22-33`). `ariaLabel` must stay the literal `'CSV import staging rows'` (`:27`) — see §4. |
| layout hook | `useOrdersImportTableLayout(): SlotTableLayout` (`useOrdersImportTableLayout.ts:26`) | `surface.useLayout: () => SlotTableLayout`. **Rules-of-hooks constraint:** the host must call `surface.useLayout()` unconditionally at one call site, and `surface` must be a stable module-level object — a caller that rebuilds the pack inline per render swaps hook identity. Enforce with a `const`-only pack and a guard in `slot-table-cohort` style, not a comment. |
| column materializer | `csvImportStagingSheetColumnsFor(layout: SlotLayout): readonly CsvImportStagingGridColumn[]` (`csv-import-staging-grid-layout.ts:104-114`) | `surface.columnsFor(layout): readonly C[]`. Body stays per-family: it passes that family's `catalog`, `base`, `statusAnchorKey`, `subtitleAnchorKey` into `materializeTracks` (`:105-113`). |
| sort-fact / sortability / default-dir | `csvImportStagingSortFactFor(col): string \| null` (`:124-131`); `isCsvImportStagingColumnSortable(columns, key): key is CsvImportStagingGridColumnKey` (`:134-139`); `defaultDirForCsvImportStagingColumn(columns, key): GridSortDir` (`:161-167`) | `surface.sortFactFor` / `surface.isSortable` / `surface.defaultDirFor`, same three signatures with `C`/`K`. `sortFactFor`'s chrome arms (`:128-129`, mapping `order` → `orders-import.order` and `status` → `'status'`) are the per-family half; the `col.sortable === false \| 'select' \| '_fill'` arm (`:127`) is engine law and should call `isSlotTableChromeTrack` from `@/lib/tables/slot-table-header-sort` rather than a hand list. |
| grid row component | `CsvImportStagingGridRow: React.MemoExoticComponent<(props: { row: OrderImportRowView; checked; focused; onToggle; onOpen; columns }) => JSX.Element>` (`CsvImportStagingGridRow.tsx:68-215`), with `cellValue` (`77-94`) and `renderValue` (`96-152`) switching on `orders-import.*` | **The one item with no clean answer, and the reason this is an engine change.** Three candidates, all needing a ruling (§6): (i) `surface.RowComponent: ComponentType<StagingRowProps<TRowView, C>>` — smallest diff, but it mints a per-family render component, which `ENGINE_IS_MONOMORPHIC` exists to prevent and which "zero new `.tsx`" forbids; (ii) drop the sheet row and give staging a `CompoundRowView` adapter like every Wave-D family — no new `.tsx`, but it retires the `LedgerGridLeafRow` sheet paint, the rose missing-cell wash (`:55`, `:151-158`) and the platform mark (`:139-148`); (iii) keep the sheet row but make its per-cell paint DATA — `surface.cellFor(row, fieldId): { text: string; tone?: …; copyable?: boolean }` — one shared `.tsx`, per-family data. (iii) is the only option that satisfies both the monomorphic engine and the no-new-`.tsx` rule; it is also the largest diff. |
| rail | `CsvImportStagingRail({ onDiscardSelected: () => void })` (`CsvImportStagingRail.tsx:369-373`), mounted as the host's last child (`CsvImportStagingHost.tsx:366`) | **Remove it from the host.** Returns already mounts its rail as a SIBLING (`ReceivingLinesTable.tsx:914`), and orders' rail registers itself through `DetailStackRailRegistrar` anyway. Host exposes `onDiscardSelected` upward instead of owning the rail; `handleDiscardSelected` (`234-239`) stays in the host because it needs `getTableImportDraft`/`exitStaging`. |
| `compareStagingRows` | `(a: OrderImportRowView, b: OrderImportRowView, fact: string, dir: 'asc' \| 'desc') => number` with a 7-arm literal switch on `orders-import.order \| status \| orders-import.sku \| orders-import.qty \| orders-import.customer \| orders-import.tracking \| orders-import.platform` (`CsvImportStagingHost.tsx:95-121`) | `surface.compareRows(a, b, fact, dir)` — a per-descriptor comparator supplied alongside the binding, in the family's own `*-import-compare.ts`. **What replaces the literal switch, precisely:** the `case 'status'` arm (`:102-103`) is NOT family-specific — it sorts the structural triage fact, action-required-first on ascending, and every staging family has exactly that fact (`TableImportClassification.status`, `src/lib/tables/import/types.ts:28-33`). So the engine exports `compareTableImportTriage(a, b, dir)` and each family's comparator is `fact === 'status' ? compareTableImportTriage(a, b, dir) : <family arms>`; the family arms remain a switch over ITS OWN `<family>.<fact>` ids, which is correct — the fact ids come from that family's field catalog and nothing generic can know them. A test per family asserts every `sortFactFor` output over the product layout has a non-zero-returning comparator arm, which is the guard that stops a relabelled chrome header sorting silently to `default: return 0` (`:119-120`). |
| commit | `descriptor.commit(input): Promise<{ ok: true } \| { ok: false; error: string }>` (`src/lib/tables/import/types.ts:88-91`), called at `CsvImportStagingHost.tsx:222` | **Must widen.** The returns host needs the counts: `postCsvInboundReturnsImport` returns `{ ok: true; result: InboundReturnsImportResult }` (`src/lib/inbound/csv-inbound-returns-import.ts:205-211`) and the host spends them on a toast (`IncomingReturnsImportStagingHost.tsx:128-132`). The returns descriptor's own `commit` throws that payload away (`inbound-returns-import-descriptor.ts:80-83`: `return outcome.ok ? { ok: true } : …`). Proposal: `Promise<{ ok: true; summary?: string } \| { ok: false; error: string }>`, with the family formatting its own sentence. Do NOT return the raw counts shape — orders has no counts, and a shared `{created, updated, skipped, failed}` would be a lie on To-Ship. |
| post-commit effect | `refreshDomain('orders.outbound')` then `exitStaging()` (`CsvImportStagingHost.tsx:228-229`) | `surface.onCommitted(outcome): string | null` — returns a post-commit href or `null`. Orders returns `null` after calling `refreshDomain('orders.outbound')`; returns calls `invalidateReceivingFeeds(queryClient)` + `toast.success` and returns the `?inkind=return` href. The `queryClient` dependency means `onCommitted` cannot live in the pack as a pure function — it is a prop the MOUNT supplies (the mount is a client component that can call `useQueryClient`), with the pack holding only the copy. |
| confirm gates | `requestConfirm({ title: 'Import ready orders into To-Ship?', … })` (`:207-216`); `requestConfirm({ title: 'Leave CSV staging?', … })` (`:242-247`) | `surface.confirmCopy: { commit: …; cancel: … } \| null`. `null` ⇒ no dialog, which is today's returns behaviour (`IncomingReturnsImportStagingHost.tsx:112-114`, `227-229`). This is not cosmetic: see §4, the returns e2e clicks Confirm and immediately waits for the URL. |
| error surface | `submitError` state + inline rose banner (`:127`, `:311-315`) | keep as the engine default; returns currently uses `toast.error` (`IncomingReturnsImportStagingHost.tsx:125`). Both are acceptable; pick ONE for the engine and change the returns behaviour deliberately in the port commit, not by accident. |
| selection scope | `CSV_IMPORT_STAGING_SELECTION_SCOPE = 'csv-import-staging'` (`:84`) | `` `csv-import-staging:${surface.descriptor.surfaceId}` `` — the `emitSelection` bus is global (`src/lib/selection/table-selection`), and one literal shared by two surfaces is a latent cross-desk select-all. |
| status filters | `STATUS_FILTERS` (`:89-93`) | engine const `TABLE_IMPORT_STATUS_FILTERS` in `staging-store.ts` (it already owns `TableImportFilter`, `:26`), deleting the duplicate at `IncomingReturnsImportStagingHost.tsx:59-63`. |
| row key | `csvImportStagingRowKey(row: OrderImportRowView): string` (`CsvImportStagingGridRow.tsx:40-42`) | engine `tableImportRowKey(row: { index: number }): string`, same body. |
| grid test id | `data-testid="intake-bulk-grid"` (`:318`) | `surface.gridTestId` — orders keeps `intake-bulk-grid` (asserted, `tests/e2e/order-intake-acknowledgment.spec.ts:592`); returns keeps `incoming-returns-import-staging` (asserted nowhere today — grep found no test reference; it is on the host's OUTER div at `IncomingReturnsImportStagingHost.tsx:181`, so the port must keep it on the outer div, not move it to the grid). |

---

## 3. What the returns family would have to provide

`INBOUND_RETURNS_IMPORT_DESCRIPTOR` **already satisfies `TableImportDescriptor`
in full** — every one of the 11 members is present
(`src/lib/inbound/inbound-returns-import-descriptor.ts:39-84`), and it is already
on the fan-out allowlist (`src/lib/tables/import/registry.ts:28-31`,
`'receiving-returns-import'`). Field by field against
`ORDER_IMPORT_DESCRIPTOR` (`src/lib/orders/order-import-descriptor.ts:59-110`):

| member | orders | returns | gap |
|---|---|---|---|
| `surfaceId` | `'orders-import'` (`order-import-descriptor.ts:57`) | `'receiving-returns-import'` (`inbound-returns-import-descriptor.ts:34`) | none for the descriptor. **But:** `types.ts:46` says the surfaceId "Matches the table definition's `entityFamily`" — and `'receiving-returns-import'` is **not** in the `TableId` union (`table-columns.ts:70-195`; grep for `receiving-returns-import` finds only the descriptor and the registry) nor in `TABLE_ENTITY_FAMILIES` (`table-definition.ts:90-100`, whose `'orders-import'` entry is at `:95`). Registering it is step 4 of §6. |
| `entityNoun` | `'orders'` (`:64`) | `'returns'` (`:41`) | none |
| `deskPath` | `SHIPPING_ORDERS_PATH` (`:65`) | `INCOMING_SURFACE_ROUTE` (`:42`) | none |
| `fields` | `CSV_ORDER_CANONICAL_FIELDS` | `CSV_INBOUND_RETURNS_FIELDS`, 12 entries, only `order_id` required (`csv-inbound-returns-import.ts:15-28`) | none |
| `autoMap`/`classify`/`project`/`applyEdits` | present | present (`:44-47`) | none |
| `toRowView` | 11 facts (`:71-90`) | 12 facts (`:48-66`) | none |
| `searchValues` | 11 values (`:91-105`) | 9 values (`:67-79`) — omits `index`, `missing`, `quantity` | none |
| `commit` | `postCsvOrderImport`, discards nothing | `postCsvInboundReturnsImport`, **discards `result`** (`:80-83`) | must widen (see §2) if the toast counts are preserved |

`InboundReturnsImportRowView` (`:18-32`) carries 12 members. What the hand table
actually PAINTS is 8 columns (`IncomingReturnsImportStagingHost.tsx:48-57`):
`status`, `orderId`, `sku`, `asin`, `itemName`, `trackingNumber`, `rmaId`,
`returnReason`. Therefore, under the "never restore fetched-but-unpainted
fields" rule:

- **Catalog (7 facts):** identity `receiving-returns-import.order` → `orderId`;
  status band `…sku`, `…asin`, `…item` (`itemName`), `…tracking`, `…rma`,
  `…reason`. `status` stays **structural** (no `hideKey`, not a catalog entry) —
  the same argument as `orders-import` (`field-catalog/orders-import.ts:17-22`).
- **Deliberately absent (3):** `quantity`, `returnStatus`, `source`. Projected
  and searchable (`:59`, `:63-64`, `:76-77`) but painted by no `<td>` today.
  `returnStatus` is additionally load-bearing INPUT — `classify` reads it to
  make a cancelled row action-required (`csv-inbound-returns-import.ts:83-86`,
  `96-119`) — which is a reason to keep it a fact of the ROW, not a column.
- **Canonical fields with no row-view member at all (2):** `carrier_code` and
  `listing_url` (`csv-inbound-returns-import.ts:23`, `:26`). They exist in the
  mapping panel and the commit payload but never reach `toRowView`. Not catalog
  candidates; do not invent row-view members for them.

**Track budget check.** `defaultVisibleTrackKeys` excludes only `select`
(`table-definition.ts:351-354`), so `_fill` counts. The returns skeleton is
`select · order · status · _fill` = 3 counted chrome tracks; 6 status bindings
(sku, asin, item, tracking, rma, reason) → **9 of `MAX_DEFAULT_VISIBLE_TRACKS`
(10)** (`table-definition.ts:200`). It fits with one slot spare, and no fact has
to ship unbound. (Orders, for comparison, is 8: `order · status · status:1…5 ·
_fill`.)

Other per-family artifacts the generic host would still need, none of which
exist today (each verified absent by grep):

1. `src/lib/tables/field-catalog/receiving-returns-import.ts` — catalog +
   `*_PRODUCT_LAYOUT` (a sheet `SlotLayout`) + `*_TABLE_LAYOUT_ID`.
2. `…/receiving-returns-import-resolve.ts` — the `resolve…SlotValue` reader.
3. `…/incoming/import-staging/returns-import-grid-layout.ts` — the sheet base
   (`select · order · status · _fill`) + the four layout functions.
4. `…/returns-import-grid-descriptor.ts` — `GridSurfaceCapabilities` +
   `makeGridSurfaceDescriptor`. `multiSelect` is a real decision: the hand table
   has **no** select gutter, so mounting the generic host GIVES returns
   multi-select and the rail's flush Delete. The rail already imports
   `discardTableImportSelected` (`IncomingReturnsImportStagingRail.tsx:33`), so
   the verb exists — this is a behaviour ADDITION, and §6 flags it for a ruling.
5. `…/returns-import-table-definition.ts` — `parseTableDefinition` +
   `*_TABLE_BINDING`, `ariaLabel: 'CSV import staging rows'`, and an honest
   `recordPlane` (`{ kind: 'inspector', occupantId: 'detail:incoming-returns-import-staging' }`
   — that occupant id already exists, `IncomingReturnsImportStagingRail.tsx:45`).
6. `…/useReturnsImportTableLayout.ts` — the `useSlotTableLayout` config.
7. `…/returns-import-compare.ts` — the comparator (§2).
8. The seven registry lines Main lands (this task adds none — see the report).

---

## 4. Behaviour that must survive, bit-for-bit

Line numbers are in `IncomingReturnsImportStagingHost.tsx`. "Generic host" =
`CsvImportStagingHost.tsx` as it stands today.

| # | behaviour | current line(s) | generic host |
|---|---|---|---|
| 1 | commit-on-blur | `310` (`onBlur={commitEdit}`) | **not at all** — the orders grid row renders no editor (see the finding below) |
| 2 | commit-on-Enter | `311-315` | **not at all** |
| 3 | Escape-to-cancel | `316` | **not at all** |
| 4 | `updateTableImportRow(descriptor, index, { [field]: value })` | `155-161` (declared), `157` (call) | **differently** — the write exists, but only on the RAIL's Row leaf (`CsvImportStagingRail.tsx:56`, `IncomingReturnsImportStagingRail.tsx:36`), never from a cell |
| 5 | `setTableImportFocusRow` on row click | `265` (row), `326` (cell button, before `startEdit`) | **already does it** — `StagingLeaf`'s `onOpen` (`CsvImportStagingHost.tsx:388`) → `CsvImportStagingGridRow`'s `onClick` (`CsvImportStagingGridRow.tsx:167`) |
| 6 | `data-staging-row` | `259` (valueless) | **differently** — `data-staging-row={row.index}` (`CsvImportStagingGridRow.tsx:164`). Both satisfy the `[data-staging-row]` presence selector the tests use; nothing asserts the value |
| 7 | `data-staging-status` | `260` | **already does it** — `CsvImportStagingGridRow.tsx:165` |
| 8 | `data-testid="csv-import-staging-confirm"` | `234` | **already does it** — `CsvImportStagingHost.tsx:304` |
| 9 | Confirm → `postCsvInboundReturnsImport` | `120-123` | **differently** — via `descriptor.commit` (`:222`), which drops `result` (§2/§3) |
| 10 | toast with `created/updated/skipped/failed` | `128-132` | **not at all** — orders paints an inline `submitError` banner on failure (`:311-315`) and nothing on success |
| 11 | `invalidateReceivingFeeds(queryClient)` | `128` | **differently** — `refreshDomain('orders.outbound')` (`:228`) |
| 12 | `?import=csv` → `?inkind=return` rewrite (`delete import`, `set inkind`, `delete page`, `router.replace(href, {scroll:false})`) | `133-140` | **not at all** — orders calls `exitStaging()` (`:229`), whose URL write is `useTableImportParam`'s `write` (`src/hooks/useTableImportParam.ts:68-72`: deletes `import`, `sort`, `dir` only). No `inkind`, no `page` delete |
| 13 | deferred draft clear (wait until `?import=csv` is gone, then `clearTableImportDraft`) | `83-88`, `139` | **not at all** — `exitStaging` clears synchronously (`:153-157`). The comment at `81-82` names the exact race this guards: the desk's stale-import effect wiping `?inkind=return` |
| 14 | Cancel with no confirmation | `227-229` | **differently** — orders gates Cancel behind `requestConfirm` (`:241-250`) |
| 15 | no-draft fallback copy | `163-169` | **differently** — orders' copy + a "Back to To-Ship" button (`:252-261`) |
| 16 | `aria-label="CSV import staging rows"` on the table | `243` | **already does it**, but from the DEFINITION (`csv-import-staging-table-definition.ts:27`) — a returns definition must repeat the literal |
| 17 | ready/action/total summary band | `94-97`, `191-195` | **differently** — orders paints `{draft.rows.length} rows` (`:275-277`); `summarizeTableImportDraft` is generic (`staging-store.ts:232-241`) but unused by the orders host |
| 18 | `FilterMenu` "Refine (… active)" label | `171-176`, `196-216` | **differently** — `DataTable`'s own filter chrome (`:342-351`). The accessible name must keep matching `/^refine\b/i` (see below) |

### Which tests assert these hooks

Grepped the whole lane for `data-staging-row`, `data-staging-status`,
`csv-import-staging-confirm`, `incoming-returns-import-staging`,
`intake-bulk-grid`, `csv-import-staging-identity`, `csv-import-staging-grid`:

| assertion | file:line | at risk? |
|---|---|---|
| `[data-staging-status="ready"]` / `"action_required"` counts | `tests/e2e/incoming-returns-csv-staging.spec.ts:56-57` | safe — `CsvImportStagingGridRow.tsx:165` |
| `getByTestId('csv-import-staging-confirm')` + `/confirm 2 ready/i` | `tests/e2e/incoming-returns-csv-staging.spec.ts:59-60` | safe — `CsvImportStagingHost.tsx:304`, `:306` prints the same sentence |
| `getByRole('button', {name:/^refine\b/i})` then `/^action required$/i` | `tests/e2e/incoming-returns-csv-staging.spec.ts:62-63` | **at risk** — the name comes from `DataTable`'s filter control, not `FilterMenu`; the option label survives (`STATUS_FILTERS:91`) but the trigger's accessible name must be re-verified |
| `[data-staging-row]` count = 2 | `tests/e2e/incoming-returns-csv-staging.spec.ts:64` | safe |
| `getByRole('button', {name:/edit order for staging row 3/i})` → `getByRole('textbox', …)` → `fill` → `press('Enter')` | `tests/e2e/incoming-returns-csv-staging.spec.ts:67-75` | **BREAKS** — no cell editor exists on the generic host |
| `confirmCta.click()` → `toHaveURL(/inkind=return/)` → `not.toHaveURL(/import=csv/)` | `tests/e2e/incoming-returns-csv-staging.spec.ts:81-83` | **BREAKS twice** — orders inserts a `requestConfirm` dialog first (`:207-216`), and writes no `inkind` (`useTableImportParam.ts:68-72`) |
| `getByRole('table', {name:/csv import staging rows/i})` | `tests/e2e/incoming-returns-csv-staging.spec.ts:50`; `tests/e2e/csv-import-staging.spec.ts:76` | safe only if the returns definition repeats `ariaLabel: 'CSV import staging rows'` |
| `getByTestId('intake-bulk-grid')` | `tests/e2e/order-intake-acknowledgment.spec.ts:592` | orders-only; keep via `surface.gridTestId` |
| `[data-staging-status]` counts, `[data-staging-row]` filter-by-text click | `tests/e2e/order-intake-acknowledgment.spec.ts:595-599` | safe |
| `[data-staging-status]` / `[data-staging-row]` / confirm CTA | `tests/e2e/csv-import-staging.spec.ts:87-88`, `92-93`, `99`, `113`, `124`, `131`, `160-166`, `176-178` | safe |
| `data-testid="incoming-returns-import-staging"` | asserted by **nothing** (grep: only `IncomingReturnsImportStagingHost.tsx:181`) | keep anyway; an unasserted hook is still an operator/debug handle |
| `data-testid="csv-import-staging-identity"` | asserted by **nothing** (grep: only `CsvImportStagingHost.tsx:270`) | — |
| `data-testid="csv-import-staging-grid"` (definition `testId`) | asserted by **nothing** | — |

### The finding that changes the shape of this work

`tests/e2e/csv-import-staging.spec.ts:101-110` (the button/textbox pair at `:102-108`) — the step labelled "Fix the
missing order number IN THE CELL (Sheets keys)" — asserts
`getByRole('button', { name: /edit order number for staging row 3/i })` and then
a matching `textbox`. **No source file renders that accessible name.** A
repo-wide grep for `for staging row` returns exactly two hits, both in the
returns hand table (`IncomingReturnsImportStagingHost.tsx:308` and `:323`); the
only labelled control the orders grid row paints is the checkbox
`Select staging row N` (`CsvImportStagingGridRow.tsx:182`), and the orders
staging descriptor declares `inCellEdit: false` with a docblock saying the cell
"does not pretend to accept a value"
(`csv-import-staging-grid-descriptor.ts:24-26`, `:34`).

So the GOLDEN surface already lost its in-cell editor in the Wave-1.4 slot port
and its e2e was not updated — the orders spec's step 6 cannot pass as written.
Two consequences:

1. The returns port cannot "preserve" commit-on-blur / Enter / Escape by
   mounting the generic host. Those three behaviours plus the cell `<button>`
   would have to be **re-added to the engine** (a compound/sheet cell editor) or
   **deliberately retired** for returns too, moving correction to the rail Row
   leaf — which already exists and already writes through
   `updateTableImportRow` (`IncomingReturnsImportStagingRail.tsx:36`).
2. Either way, `tests/e2e/incoming-returns-csv-staging.spec.ts:67-75` and
   `tests/e2e/csv-import-staging.spec.ts:101-110` must be rewritten in the same
   change. Retiring is the cheaper and more house-consistent answer (no family
   in this repo sets `capabilities.inCellEdit: true` — a repo-wide grep for
   `inCellEdit:\s*true` in `src/` returns no match, only a comment saying so at
   `src/components/inventory/cycle-count-lines/cycle-count-lines-table-definition.ts:30`), but it is a **behaviour removal on a live desk**, so it is an
   operator ruling, not a porter's choice. The orders spec's current state is
   evidence that this decision was already taken once, silently; this plan
   refuses to repeat that.

---

## 5. One layout document, or two?

**Two. `receiving-returns-import` must be its own `TableId`, a sibling of
`orders-import`.** Three arguments, strongest last.

1. **The precedent says so, read at its own words.** The `orders-import`
   docblock in the `TableId` union: *"its OWN bucket, never `orders`: hiding a
   column while triaging a file must not change the density of the live queue
   those rows are about to land in"* (`table-columns.ts:142-147`), echoed in
   `TABLE_COLUMNS` (`:331-343`) and in the layout hook (
   `useOrdersImportTableLayout.ts:8-10`). The invariant is per-QUEUE, not
   per-staging: returns rows land in `incoming`, not `orders`, so "the live
   queue those rows are about to land in" is a different queue. Sharing one
   staging bucket would make hiding `asin` while triaging a returns file change
   the To-Ship staging plate — the same class of leak the docblock forbids, one
   level up. This is exactly the To-ship-vs-Shipped shape: two lanes over the
   same mechanism, separate documents, because a density choice made while
   triaging one must not follow the operator into the other.
2. **The vocabularies barely intersect.** `ORDERS_IMPORT_FIELD_CATALOG` is
   order · sku · qty · customer · tracking · platform
   (`field-catalog/orders-import.ts:34-83`). Returns is order · sku · asin ·
   item · tracking · rma · reason. Two of seven overlap. A shared document would
   offer `customer` on a returns row that has no customer member
   (`inbound-returns-import-descriptor.ts:18-32`) and `rma` on an order row that
   has none — a Fields menu that lists facts the surface cannot resolve.
3. **Sharing is structurally impossible, not merely unwise.** `SLOT_LAYOUT_TABLES`
   maps ONE `tableId` to ONE `catalog` (`org-table-layouts.ts:180-183`:
   `[ORDERS_IMPORT_TABLE_LAYOUT_ID]: { catalog: ORDERS_IMPORT_FIELD_CATALOG, morphs: ['sheet'] }`).
   `useSlotTableLayout` takes `{ tableId, catalog, productLayout }` as one triple
   (`useOrdersImportTableLayout.ts:27-34`). There is no mechanism by which one
   `tableId` serves two catalogs, so "share one document" would mean *merging
   the catalogs* — which is argument 2 with extra steps.

The name should be `receiving-returns-import`, matching the descriptor's
`surfaceId` (`inbound-returns-import-descriptor.ts:34`) and the fan-out
allowlist entry (`import/registry.ts:30`), because `types.ts:46` requires
`surfaceId === entityFamily`. The debt row's phrase "an incoming-import family"
(`table-engine-law.ts:240`) predates that id; do not mint a third spelling.

---

## 6. Work plan, step-ordered

Sizes: **S** ≤ 1 file + test, **M** 2-4 files, **L** engine surface change.

| step | work | size | depends on |
|---|---|---|---|
| 0 | **Rulings (below). Nothing else starts until these land.** | — | — |
| 1 | Fix the stale golden assertion: rewrite `tests/e2e/csv-import-staging.spec.ts:101-110` to match what the orders host actually paints (rail Row leaf correction), or re-add the editor. Whichever ruling 0a picks. Doing this first turns the orders spec into a truthful baseline for the port. | S | 0a |
| 2 | Engine extractions, no behaviour change: `TABLE_IMPORT_STATUS_FILTERS` + `tableImportRowKey` + `compareTableImportTriage` into `src/lib/tables/import/`; delete the duplicate `FILTER_OPTIONS` (`IncomingReturnsImportStagingHost.tsx:59-63`) and `STATUS_FILTERS` (`CsvImportStagingHost.tsx:89-93`); delete the two dead locals (`CsvImportStagingHost.tsx:128`, `264-265`). | S | — |
| 3 | Widen `TableImportDescriptor.commit` to `{ ok: true; summary?: string }` (`types.ts:88-91`); have the returns descriptor format its counts sentence there (`inbound-returns-import-descriptor.ts:80-83`). Orders unchanged. | S | — |
| 4 | Define `TableImportStagingSurface` (`src/lib/tables/import/staging-surface.ts`) and refactor `CsvImportStagingHost` to consume it, with `ORDERS_IMPORT_STAGING_SURFACE` as the only pack. Rename the file to `TableImportStagingHost.tsx` and leave a one-line orders mount. **Zero behaviour change on To-Ship** — this step is done when the orders e2e (post-step-1) is green. | L | 1, 2, 3, 0b, 0c |
| 5 | Register the `receiving-returns-import` family: the seven registry lines (Main lands them), the field catalog + product layout + resolver, the grid layout, the descriptor, the table definition + binding, the layout hook, the comparator. | M | 4 |
| 6 | Swap the mount: `ReceivingLinesTable.tsx:916-917` renders `TableImportStagingHost` with the returns pack; the returns rail at `:914` stays a sibling. Port the `onCommitted` prop (`invalidateReceivingFeeds` + toast + the `?inkind=return` href) and the deferred-clear effect (`IncomingReturnsImportStagingHost.tsx:83-88`) into the generic host guarded on a non-null post-commit href. | M | 5 |
| 7 | Delete `IncomingReturnsImportStagingHost.tsx`; delete its `HAND_HTML_TABLE_DEBT` row (`table-engine-law.ts:238-241`). The tripwire asserts a debt file still paints a `<table>` (`table-engine-law.test.ts:311`), so the delete and the row-removal are ONE commit. | S | 6 |
| 8 | Rewrite `tests/e2e/incoming-returns-csv-staging.spec.ts:67-75` (cell edit) and re-verify `:62-63` (Refine trigger name) and `:81-83` (confirm → URL) against the new chrome. | S | 6 |

### Needs an operator ruling before any code

- **0a — in-cell correction: re-add or retire?** The golden already retired it
  (`csv-import-staging-grid-descriptor.ts:24-26`, `:34`) while its e2e still
  asserts it (`tests/e2e/csv-import-staging.spec.ts:101-110`). No family in the
  repo sets `inCellEdit: true`. Retiring for returns removes commit-on-blur,
  commit-on-Enter and Escape-to-cancel from a live desk and moves correction to
  the rail Row leaf. Re-adding means an engine cell editor, which is a new
  engine capability. **This plan cannot be executed without this answer** —
  every other step's size depends on it.
- **0b — the per-cell paint seam.** Option (i) `RowComponent`, (ii) compound
  adapter, (iii) data-driven `cellFor` (§2). Only (iii) satisfies both
  `ENGINE_IS_MONOMORPHIC` and "zero new `.tsx`"; it is also the biggest diff and
  it restyles the orders sheet's paint (rose missing-cell wash
  `CsvImportStagingGridRow.tsx:55`, `194-196`, `205`; platform mark `:137-148`).
- **0c — does the returns staging surface get multi-select?** Mounting the
  generic host adds a select gutter, select-all, and the rail's flush Delete to
  a desk that has none today (§3 item 4). That is a feature addition riding a
  port. `multiSelect: false` keeps the port honest; `true` matches the golden.
- **0d — Confirm dialog on returns?** The generic host gates Confirm and Cancel
  behind `requestConfirm` (`:207-216`, `:241-250`); returns commits and leaves
  immediately (`:112-114`, `:227-229`). Adding the gates changes a shipped
  operator flow and breaks `incoming-returns-csv-staging.spec.ts:81-83`.
- **0e — the `?inkind=return` rewrite's owner.** Today it is host-local
  (`:133-140`) with a deliberate deferred clear (`:81-88`). Generalising means
  either an `onCommitted → href` prop (proposed) or teaching
  `useTableImportParam.write` (`src/hooks/useTableImportParam.ts:59-73`) about a
  per-descriptor post-commit param. The latter is tidier and touches a hook two
  desks share; the former is contained. Contained is recommended, but the hook
  is engine surface either way.

Until 0a–0e are answered,
`src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx`
**stays** in `HAND_HTML_TABLE_DEBT` (`src/lib/tables/table-engine-law.ts:238-241`).
That is the correct state, not an oversight: the list is shrink-only, and an id
leaves it when the surface mounts a `PRODUCT_TABLES` family — not when a plan
for doing so exists.
