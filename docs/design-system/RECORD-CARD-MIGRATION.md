# RecordCard migration ledger

Run ledger for `HANDOFF-record-card-foundation.md`. One row per table mount; updated at the end of every
wave. Verdicts: **port** (→ `TriageCardList`), **keep-sheet** (columns are the job; `DataTable` stays),
~~**floor** (industrial ledger, Ctrl/⌘+Shift+F)~~ — withdrawn 2026-09-28 (BRIEF §14): no desk keeps
an industrial ledger; a former **floor** row is a **port** (card list) or **one-row** (`TriageCardList
density="row"`). Stock (#36) and Replenish (#37) move from keep-sheet to **one-row** — they were
industrial `RecordLedger` rows, never a `DataTable`.

## Owner decisions

- 2026-10-03 — **Parked compound grids deleted.** The pages, grid hooks and field-catalog
  families behind `src/lib/routing/parked-slot-surfaces.ts` are removed (the redirects stay as URL
  compatibility), with Warehouse RMA, Warranty claims, Staff, Devices, Holds and the `/m/pack` queue.
  Anything ported back lands in the mobile V2 display first, as a card view — never a compound grid.
  Ledger: `parked-compound-grids` and `compound-table-engine` (retired the same day: the `/unbox`
  lines are the `receive.queue` card list, `TaskTable` selects through `GridRowCheckbox`).
  Plan and status: `docs/refactors/DELETE-LIST.md`.
- 2026-10-01 — **No DataTable ports.** Navigable page/query faces that mount the materialized
  compound slot `DataTable` are parked at the proxy boundary by
  `src/lib/routing/parked-slot-surfaces.ts`; their page and component implementations stay in-tree
  for later upgrades. Navigation exposes only retained non-slot faces. Record-only Inventory
  selections (`?sku=`, `?bin=`), Replenish, Packer day, and task-time reports remain mounted.
- 2026-09-27 — keep-sheet list confirmed as listed in the Wave 0 table.
- 2026-09-27 — Law 5 selection bar replaces BRIEF §13 "one checked → card drop-down": selection
  verbs live only in the bar (same verbs, same order for 1 or N); single-card verbs only in fixed card
  spots (⋮, identity ↗, stage chips).
- 2026-09-27 — **Outbound first, one page at a time.** Lock the root display (the e-commerce order
  card) before any other family. Order: foundation lock on To ship → Exceptions → PO paired → Pick
  list → Shipped. Each page is its own wave and needs owner sign-off on its screenshots before the
  next page starts. Non-outbound families wait until all five outbound pages are signed off.
- 2026-09-27 — **Multi-line display language locked** (BRIEF §13, last ruling): no Pick / QC / Pack
  on the card face; lead line + "+N items" disclosure; unfolded lines are columns in the fixed fact
  order qty · condition · stock · SKU · bin · price; Details only at the end of the lead facts row.
  This is the root display `RecordCard` extracts in O1.

## Wave 0 — inventory (2026-09-27)

### Persisted layouts in the dev DB (Neon, `.env` `DATABASE_URL`)

| Store | Rows | Keys |
|---|---|---|
| `saved_views` | **0** | — |
| `staff_preferences.prefs.tableLayouts` | 1 row, empty map | — |
| `organizations.settings.tableLayouts` | 1 org (`…0001`) | `orders` |

Consequence: the only persisted layout a port can break today is the org `orders` layout. Saved-view
verification per wave = create one on the route, reload, confirm it applies.

### Mounts

`<DataTable` appears in 35 files (+1 test comment). All are backed by a `REGISTERED_BINDINGS` entry;
`orders-index` is a registered To-ship index sheet backed by its canonical DataTable column layout.

| # | Route | Mount (file) | Family / layout id | Morph | Operator job | Mobile twin | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `/shipping/orders`, `/pack`, `/packer`, `/tech`, `/test` (shipping view) | `unshipped/UnshippedTable.tsx` → `OrderCardList` | `orders` / `orders` | compound | To-ship triage: pick, pack, ship, OOS, urgent | `/m/orders` (`/m/work`), `/m/pick`, `/m/pack` | **port** (reference; Wave 2) |
| 2 | `/shipping/orders` floor face, `/shipping/shortage` (forced `ledger`) | `outbound/orders/OutboundOrdersLedger.tsx` | `orders` / `orders` | compound | Industrial record ledger | `/m/orders` | **floor** on `/shipping/orders`; **port** `/shipping/shortage` (drop forced `ledger`) |
| 3 | `/shipping/exceptions` | `outbound/orders/exceptions/OrderExceptionsWorkbench.tsx` → `OutboundOrdersLedger mode="exceptions"` | `orders` / `orders` | compound | Held orders: paste item #, resolve, delete | `/m/exceptions` | **port** |
| 4 | `/shipping/shipped` | `outbound/workspaces/ShippedWorkspace.tsx` → `ShippedLedger` (RecordLedger) | `orders` | — | Shipped order lookup | — | **port** |
| 5 | `/shipping/orders?import` | `outbound/orders/CsvImportStagingHost.tsx` | `orders-import` | sheet | CSV staging before ingest | — | **keep-sheet** |
| 6 | `/shipping/fba` | `outbound/ready/ReadyQueueTable.tsx` | `ready` | sheet | Read-only allocation history of tested units | — | **keep-sheet** |
| 7 | `/review` (packer, default) | `features/review/ReviewPackingTable.tsx` | `orders` / `orders` | compound | Packing review queue | — | **port** |
| 8 | `/review?mode=pairing` | `features/review/pairing/ReviewPairingTable.tsx` | `orders` / `orders` | compound | Serial/SKU pairing queue | `/m/pair/[code]` (partial) | **port** |
| 9 | `/review?mode=catalog-link` (missing item #) | `features/review/catalog-link/ReviewCatalogLinkTable.tsx:264` | `import-exception` | compound | Link sheet rows to catalog | — | **port** |
| 10 | `/review?mode=catalog-link` | `…/ReviewCatalogLinkTable.tsx:363` | `catalog-link` | compound | Match listings to catalog | — | **port** |
| 11 | `/receiving`, `/receiving/history`, `/unbox` Queue · Recent | `receiving/unbox/UnboxCartonCards.tsx` (view `receive.queue`, `ReceivingCartonCard`) via `ReceivingLinesTable` | — | card | Door-scanned cartons; a card opens the carton in the Unbox line workspace | `/m/receiving/po/[poId]` | **ported** 2026-10-03 (compound grid deleted) |
| 12 | `/tech`, `/test` (testing view) | ~~`tech/TestingHistoryList.tsx`~~ (gone; nothing mounts the receiving spreadsheet) | — | — | Tested-unit history | `/m/qc/line/[id]` | **gone** with #11's grid |
| 13 | `/receiving` incoming / docked | `receiving/incoming/IncomingDeliveriesLedger.tsx` → `IncomingDeliveryCardList`; `DockedReceiptsLedger` | `receiving` | — | Inbound deliveries — **second hand-rolled card list** | `/m/receiving/*` | **port** (absorb `IncomingDeliveryCardList` into the foundation) |
| 14 | `/unbox?unboxview=all`, `/test|/tech?testTab=all`, `?ship=all` | `tech/all/TechAllTriageTable.tsx` | `tech-all` | sheet | Cross-station line triage | — | **port** |
| 15 | `/pickup` | `receiving/pickup/PickupWorkspace.tsx` | `pickup` | sheet | LCPU pickup orders by status lane | — | **port** |
| 16 | `/pack`, `/packer`, `/tech`, `/test` history | `station/StationHistoryTable.tsx` | `packer` / `tech` | compound | Bench activity history by week/day | — | **keep-sheet** |
| 17 | `/inventory/units`; `/inventory?states=…` (by-filter); SKU page recent units | `inventory/UnitsWorkspaceView.tsx`, `inventory/ByFilterResultList.tsx`, `SkuDetailTables.tsx#SkuRecentUnitsTable` | `units` / `inventory-units` | sheet | Find and open a serial unit | `/m/u/[id]` (detail only) | **port** (Wave 3) |
| 18 | `/inventory/locations?tab=bins` | `warehouse/BinsTable.tsx` | `bins` / `bins` | sheet | Bin overview, multi-select → bulk bar | `/m/loc/[code]`, `/m/bin/[barcode]` | **port** (Wave 3 stress family) |
| 19 | `/inventory/health/sku/[sku]` bins | `SkuDetailTables.tsx#SkuBinsTable` | `sku-bins` | compound | Where this SKU sits | — | **port** (Wave 3) |
| 20 | `/inventory/health/sku/[sku]` ledger | `SkuDetailTables.tsx#SkuLedgerTable` | `sku-ledger` | compound | Signed-quantity ledger | — | **keep-sheet** |
| 21 | `/inventory/health/sku/[sku]` allocations | `SkuDetailTables.tsx#SkuAllocationsTable` | `sku-allocations` (`unit-allocations` catalog) | compound | Open allocations, open unit | — | **keep-sheet** (sub-ledger on detail) |
| 22 | `/inventory/health/sku/[sku]` events | `SkuDetailTables.tsx#SkuEventsTable` | `inventory-events` | compound | Event log | — | **keep-sheet** |
| 23 | `/inventory` (default pulse) | `inventory/PulseView.tsx` | `inventory-events` | compound | Live event feed | — | **keep-sheet** |
| 24 | `/inventory/pulse?open=` | `inventory/PulseWorkspace.tsx` | `inventory-events` | compound | Per-unit event log | — | **keep-sheet** |
| 25 | `/inventory/events` | `app/inventory/events/EventsExplorerTable.tsx` | `inventory-events` | compound | Event explorer | — | **keep-sheet** |
| 26 | `/inventory/health` recent events | `_inventory-admin/InventoryAdminTables.tsx:59` | `inventory-events` | compound | Last 50 events | — | **keep-sheet** |
| 27 | `/inventory/health` drift alerts | `_inventory-admin/InventoryAdminTables.tsx:31` | `admin-drift-alerts` | compound | Open drift alerts → open SKU | — | **port** |
| 28 | `/inventory/health` sku drift | `_inventory-admin/InventoryAdminTables.tsx:48` | `admin-sku-drift` | compound | Numeric counter diff | — | **keep-sheet** |
| 29 | `/inventory?unit=` | `inventory/ByUnitView.tsx:301` | `unit-allocations` | compound | Unit allocation history | — | **keep-sheet** |
| 30 | `/inventory?unit=` | `inventory/ByUnitView.tsx:314` | `unit-tsn-links` | compound | Unit TSN links | — | **keep-sheet** |
| 31 | `/inventory/holds` | `app/inventory/holds/HeldUnitsTable.tsx` | `admin-holds` | compound | Release held units | — | **port** |
| 32 | `/inventory/bulk-allocate` | `app/inventory/bulk-allocate/AllocationCandidatesTable.tsx` | `admin-bulk-allocate` | compound | Allocate orders with stocked units | — | **port** |
| 33 | `/inventory/cycle-counts` | `app/inventory/cycle-counts/CycleCountsTableSection.tsx` | `cycle-counts` | compound | Open a count campaign | — | **port** |
| 34 | `/inventory/cycle-counts/[id]` | `…/[id]/CycleCountLinesTable.tsx` | `cycle-count-lines` | compound | Count, approve, reject lines | — | **port** |
| 35 | `/inventory/returns` | `app/inventory/returns/RecentReturnsTable.tsx` | `admin-returns` | compound | Recent returned units → open | — | **port** |
| 36 | `/inventory/stock` | `inventory/StockLedger` (RecordLedger) | — | — | Stock by location/room | — | **keep-sheet** |
| 37 | `/inventory?section=replenish` | `replenish/ReplenishmentNeedTable` (RecordLedger) | — | — | Replenishment need by SKU | — | **keep-sheet** |
| 38 | `/repair`, `/dashboard?mode=repairs` | `repair/RepairCardList.tsx` | — | cards | Repair service queue | `/m/rs/[id]` (detail only) | **ported** |
| 39 | `/support?mode=warranty` | `warranty/WarrantyClaimsTable.tsx` | `warranty` | sheet | Warranty claims queue | — | **port** |
| 40 | `/tracking-exceptions` | `tracking-exceptions/TrackingExceptionsTable.tsx` | `tracking-exceptions` | sheet | Resolve failed tracking numbers | — | **port** |
| 41 | `/dashboard?mode=sales|pickup` | `walk-in/SalesHistoryTable.tsx` | `walk-in-sales` | compound | Completed walk-in sales → open repair/pickup | — | **port** |
| 42 | `/search?q=` | `search/SearchResultsSurface.tsx` | `search-hits` | compound | Cross-entity hits → open | — | **port** |
| 43 | `/` (home) | `features/home/DailyAgenda.tsx` (`TriageCardList` + multi-row `RecordCard`, `AgendaRow.tsx`; view `DAILY_AGENDA_VIEW`) | `daily` (binding unused) | — | Shift checklist + handed-over tasks + tickets | `/m/home` | **ported** 2026-09-28; card face 2026-10-01 |
| 44 | `/reports?tab=utilization|velocity|dead|tasks|staff|packer` | `app/reports/page.tsx` (6 mounts) | `report-*` | compound | Reports | — | **keep-sheet** |
| 45 | `/settings/audit` | `app/settings/audit/AuditLogTable.tsx` | `audit-log` | compound | Audit log | — | **keep-sheet** |
| 46 | `/settings/staff` | `app/settings/staff/StaffTable.tsx` | `staff-directory` | compound | Team directory / auth policy | — | **keep-sheet** |
| 47 | `/settings/devices` | `settings/sections/KioskDevicesSection.tsx:338` | `kiosk-devices` | compound | Device admin | — | **keep-sheet** |
| 48 | `/settings/devices` history | `…/KioskDevicesSection.tsx:343` | `kiosk-slot-events` | compound | Slot event log | — | **keep-sheet** |
| 49 | `/settings/sessions` | `settings/sections/SessionsSection.tsx` | `auth-sessions` | compound | Revoke sessions | — | **keep-sheet** |
| 50 | `/sourcing?mode=compatibility` | `admin/sourcing/CompatibilityManagementTab.tsx` | `part-compatibility` | compound | Compatibility edges | — | **keep-sheet** |

### Registry entries with zero consumers (Wave N deletion candidates)

| Layout id | Binding | Note |
|---|---|---|
| `daily` | `DAILY_TABLE_BINDING` | Home paints `DailyAgenda` as a multi-row triage card list (#43), not this binding |
| `tasks` | `TASKS_TABLE_BINDING` | No page mounts it |
| `my-day` | `MY_DAY_TABLE_BINDING` | `useMyDayFeed` feeds `InboxQueueLinks` only |
| `catalog` | `CATALOG_TABLE_BINDING` | `useCatalogTableLayout.ts` itself unimported |
| `unfound` | `UNFOUND_TABLE_BINDING` | `useUnfoundTableLayout.ts` itself unimported |
| `fba` | — | `field-catalog/fba.ts` in neither registry |
| — | `SkuExceptionsLedger` | component with zero mounts |

The handoff's expected Wave 4 order named my-day, catalog/products and tasks: **none has a live table
mount**, so there is nothing to port there — porting them means building a page, which is out of scope.

### Non-table grids (out of scope unless noted)

`StationListTable.tsx` (raw `LedgerGrid` under station pipelines), `WarehouseMap.tsx` (bin map),
`app/inventory/throughput` (heatmap), `IncomingReturnsImportStagingHost` (CSV preview), markdown
tables, receipt HTML. AI artifacts (`InlineArtifact.tsx`, `renderers.tsx`, `ReportArtifact.tsx`,
`PaymentArtifact.tsx`) → Wave N+1.

### Wave order (owner 2026-09-27: outbound first, page by page)

The FBM desk views are `DESK_VIEWS` in `src/lib/outbound/desk-views.ts` — since 2026-09-29 Allocate · Exceptions · Shipped (owner: the Pick list is removed; PO paired is parked, URL-only, for the PO pairing build — O3 waits for that build, O4 is dropped).

| Wave | Page | Route | Today (observed at `:3050`) | Ledger rows | Gate |
|---|---|---|---|---|---|
| O1 | **Root lock on To ship** | `/shipping/orders` | `OrderCardList` (reference card) | #1 | Extract `RecordCard` / `TriageCardList` / action registry out of `OrderCard*`; **zero visual change** except the approved selection bar. Before/after screenshots at 3 widths. Owner signs off the root. |
| O2 | Exceptions | `/shipping/exceptions` | `OutboundOrdersLedger mode="exceptions"` | #3 | Exception reason = top-right status; verbs paste item # / resolve / delete in the registry. Owner sign-off. |
| O3 | PO paired *(parked 2026-09-29)* | `/shipping/shortage?pair=po` | `UnshippedTable ledger` → `OutboundOrdersLedger mode="pending"` | #2 (shortage) | Waits for the PO pairing build. |
| O4 | ~~Pick list~~ | — | removed 2026-09-29 (owner) | — | Dropped. |
| O5 | Shipped | `/shipping/shipped` | `ShippedLedger` (RecordLedger) | #4 | Carrier / tracking as status, shipped time far right, read-mostly verbs. Owner sign-off. |

Floor (⌘/Ctrl+Shift+F on To ship) keeps `OutboundOrdersLedger` throughout. After O5, remaining
families follow in this order, still one page per wave: review packing/pairing (#7, #8) → inventory
units/bins/sku-bins (#17–#19) → receiving/inbound (#11–#15, absorb `IncomingDeliveryCardList`) →
inventory admin queues (#27, #31–#35) → support (#38–#40) → catalog matching (#9, #10) → walk-in
and search (#41, #42) → home daily (#43) → retire orphans/unused infra → AI chat artifacts.

Inbound, inventory, sales and products continue from `HANDOFF-record-card-families.md` (one
anatomy, a page-specific card per page; pattern card signed off before each page's code). Proof
tool for every wave: `scripts/dom-equivalence.mjs` (capture before / after, compare).

**Page-agnostic first (2026-09-27):** before any non-outbound family, extract the shared
`TriageCardList` face out of `OrderCardList` behind two contracts — `TriageFeed<Row>` (per-family data
host: own route, query, URL) and `TriageFamily<Row>` (pure adapter: row group → `RecordCardModel`)
— with zero pixel change on orders; then re-mount `IncomingDeliveryCardList` on it as the second
consumer; then `/inventory/units`. Plan and open decisions: `HANDOFF-triage-family-contract.md`.

### O1 progress (2026-09-27)

Proof method (now `scripts/dom-equivalence.mjs`) captured a normalized DOM (tags, sorted
classes, text, aria, data-*) of every card on `/shipping/orders` at 1500 px, the multi-line card
unfolded and with the quick look open, and the select bar — before any extraction, then after each step.

| Step | Landed | Result |
|---|---|---|
| Card face (multi-line language, no stage chips, bar order count → per-page → sort → Floor → ⤢) | `OrderCard.tsx`, `OrderCardSelectBar` → `TriageSelectBar` | Owner rulings; screenshots at 1500 / 1100 / 760 |
| `Collapse` / `CollapseItem` + ESLint height guard; 22 sites migrated, height presets deleted | `design-system/components/Collapse.tsx`, `eslint.config.mjs` | Quick-look close ends at its settled height (105 px, no post-unmount step); guard count 0 |
| `RecordCard` (anatomy) + `record-fact.tsx` (shared fact faces) + `record-card-types.ts`; `OrderCard` is now the orders adapter | `design-system/components/record-card/` | Card DOM identical (36/36 cards, unfolded, quick look) |
| List state hooks (`useTriageUrlState`, `useTriagePageMode`, `useKeptScroll`, `useHeldNewRecords`, `useTriagePageKeys`) | `design-system/components/triage-card-list/triage-list-state.ts` | Storage keys and URL params unchanged (`cf:order-cards:*`, `cardStatus`, `page`) |
| `TriageSelectBar` (noun + test-id prefix) | `triage-card-list/TriageSelectBar.tsx` | Bar DOM identical apart from other sessions' toolbar-corner token and the sidebar-state Find slot |
| `TriageListBody` (held pill, sections, empty/loading, load more, Scroll-mode sentinel, kept scroll, shadow), `TriageSectionHeader`, `TriageAllClear` | `triage-card-list/TriageListBody.tsx` | Sections, hairlines, shadow, kept scroll across reload verified at `:3050` |

| Action registry + Law 5 selection bar: `RecordActionVerb.scope` (`single` / `bulk` / `both`) + `scopeRecordVerbs` (out-of-scope verbs stay in place, disabled with the reason); the bar paints the selection's verbs at 1 **and** N checked, one list in one order (`triageBarVerbs`, `verbSet="triage"`); the checked-card drop-down, `RecordCard` `menu` slot, `OrderCardActionMenu` and `useOrderCardVerbs` deleted; X checks the focused card, else the open record's card (now `useTriageCardKeys`) | `record-action-strip/record-verb-scope.ts`, `TriageSelectBar.tsx`, `triage-list-state.ts`, `to-ship/MorphingRowActionMenu.tsx`, `OrderCardList.tsx` | Verb list identical at 1 and 2 checked; X / X toggles the focused card; S opens Scan out, Esc backs out; Esc on an open ⋮ closes only the menu (the ⋮ now claims the overlay stack). Screenshots at 1500 / 1100 / 760. **Owner sign-off pending.** |

**Law 5 key map (2026-09-27, applied; overrule any line and it moves):**

| Key | Now | Why |
|---|---|---|
| `x` | Check the focused / open card | Law 5. Scan out moved to **`s`** on every order strip (card bar, ledger check-set, open-record strip) |
| `o` | Report / clear out of stock | Condition has no strip letter (catalog ⋮ item) |
| `r` | Create rule; **Resolve** on Exceptions | Already exclusive by desk (`create-rule` has no key on Exceptions) |
| `a`, `f`, `i` | No strip letter (Assign pick, Flag, Download photos ride ⋮) | `f` stays Find; `I` stays More information on the legacy check-set strip |

Single-scope order verbs (disabled at N with "One order at a time"): Paste item #, Resolve, Label,
Notes, Paperwork, SKU stock, Add task / Send to staff as task, More information, Delete. On the legacy
`DataTable` / floor check-set strip these now show disabled at N instead of vanishing (tasks, Delete)
or silently acting on the lead (Paste, Resolve). `SELECTION_STATUS_BAR_META` (the table status bar)
still says Scan out = `x`; it is not this bar and was left alone.

**Visible deltas the owner reviews at sign-off (not a pure port):**
- The ⋮ at 1 checked is a **superset** of the old card drop-down. Assign pick / pack, Condition, Qty,
  Ship-by, Print shipping / paperwork, Link label, Flag, Export and Download photos were hidden from
  the card menu (the open record answers them inline) and are now in the bar's ⋮ at 1 **and** N.
  This follows "same verbs, same order at 1 or N". To restore the old narrower list, filter
  `triageBarVerbs` with `RECORD_INLINE_VERB_IDS`.
- Header-face verbs (this bar and every `DataTable` / floor check-set header) no longer wrap their
  labels on a narrow bar: the row stays on one line and scrolls sideways, with ⋮ and Delete pinned.

No DOM-equivalence proof for this step: the "before" capture failed on an expired admin session
(`tests/.auth/admin.json`, re-minted via `tests/shot.mjs`). The only intended card-markup change is
the removed zero-size `PopoverAnchor` span (the menu's anchor). Screenshots at 1500 / 1100 / 760 are
the evidence.

| Step | Landed | Result |
|---|---|---|
| Bar shadow / layer: the selection bar sits `px-1` inside the desk stage (which clips overflow) and on `z-30` above the list and its sticky section headers (`z-20`); the verbs row pads its pills so their rings are not clipped | `TriageSelectBar.tsx`, `RecordActionStrip.tsx` | Bar 4 px inside the stage on both sides; shadow reads left, right and over the first section header |
| **Next step** at the card's bottom-right (`RecordCardModel.next` → `RecordCardNextStep`): orders walk Pick → Pack → Scan out (pickup: Picked up); the latest done stage wins; a blocked pick (out of stock) reads danger. QC is a unit fact and never stands between Picked and Packed | `record-card-types.ts`, `RecordCard.tsx`, `lib/orders/order-card-model.ts` (`orderNextStep`) | 37/37 cards: 24 Picked · 5 Packed · 8 Scanned out, each 16 px from the right and 12 px from the bottom; facts that wrap keep it on the last line (760 px) |
| ~~**Per-section sort**~~ — **removed by another session (2026-09-27): the list's ONE sort is the sidebar's `?sort=`; sections no longer carry their own.** Kept: each section's fixed order (soonest ship-by; No ship-by: oldest order) in `lib/orders/order-section-sort.ts` | `TriageListBody.tsx`, `order-section-sort.ts`, `OrderCardList.tsx` | — |
| **Next step as a verb** (owner): "→ Pack" — an arrow + the present-tense verb (Pick · Pack · Scan out · Hand over), no "Next" word, no extra row | `order-card-model.ts`, `RecordCard.tsx`, `icons/arrows.tsx` (`ArrowRight`) | Faces read "→ Pick", "→ Pack", "→ Scan out" |
| **Card keys** (`useTriageCardKeys`, replaces `useTriageCheckKey`): Space folds the quick look on the focused card, else the card under the pointer; Enter opens (a focused card's own button, or with nothing focused the pointer's card); X checks. Details is no longer a tab stop and, like "+N items" after a click, hands focus back to the card, so Enter never toggles Details | `triage-list-state.ts`, `RecordCard.tsx`, `OrderCardList.tsx` | Before: Details clicked → Enter folded Details. After: Enter opens the order; Space on / off alternates on the focused card and under the pointer; pointer Enter opens; pointer X checks |
| **Quick look adds, never repeats** (owner): Customer, Platform and the note (all on the face) removed. Added: full ship-to address + company, contact (phone · email), exact ship-by, carrier + tracking, listing #, serials, order total (multi-line); Pick / QC / Pack who + when kept | `OrderCardPeek.tsx` | Labels: Ship to · Contact · Ordered · Ship by · Tracking · Listing # · Picked · QC · Pack |
| ~~**Notes read in line** (amber buyer note)~~ → superseded by the next row | — | — |
| **Notes read and written in line** (owner: "triageable and readable, easy on your eyes"; never orange, no drop-down): line 1 paints the buyer's words read-only (speech icon) and the team's latest note (pencil) in muted ink; a click edits the note in place (Enter / leaving saves, Esc cancels); an empty card offers "Add note" on hover / focus. Saves go through the record's writer (`POST /api/orders/:id/notes`, append-only trail + `orders.notes`). The selection bar's Escape no longer fires inside a text field | `record-card-types.ts` (`notes: { fixed, own }`), `RecordCard.tsx` (`CardNotes`, `onSaveNote`), `OrderCard.tsx`, `OrderCardList.tsx`, `useRecordActionStripKeys.ts` | Note ink `rgb(82,82,82)`; edit prefilled with the current note; Esc cancelled with 0 writes; Add note → one POST `{"noteText":"Probe note"}` (intercepted — no real write) and the card showed it at once |
| **White card, outline-only state** (owner): the card is always white; checked = 2 px info ring, open = strong hairline, hover = soft hairline (no tinted grounds) | `RecordCard.tsx` | Checked card background `rgb(255,255,255)` + ring |
| **In place / Split identification**: each option wears a drawing of its layout (whole panel / list rows + record panel), the active one in info ink; the switch also sits on the list's bar so the view is visible and switchable before a record opens; glyph-only (words in the tooltip) in the narrow split header | `DeskRecordViewSwitch.tsx`, `TriageSelectBar.tsx`, `DeskRecordPlane.tsx` | Switch on the bar at 1500 / 1100 / 760 |
| **Documents** replaces Label (and Paperwork, and the bar's Notes) on the triage bar: it switches the desk to Split, opens the order and lands the right pane on its documents (Packing slip first). Tabs Packing slip · Manual · Shipping label · All; Print all + Download all (.zip) top right, ✕ at the far right (back to the details); empty states ARE the upload (one drop zone per kind; "All" offers one button per kind); no orange | `MorphingRowActionMenu.tsx` (`onOpenDocuments`), `OrderCardList.tsx` (`documentsRequest`), `OrderRecordView.tsx`, `paperwork/PaperworkDocuments.tsx` | Bar: Report out of stock · Mark urgent · Mark scanned out · Documents · ⋮ · Delete. After Documents: view Split, panel open, tabs `Packing slip 1* · Manual 0 · Shipping label 0 · All 1`; ✕ closed the documents and kept the order open |
| **Narrow cards stay readable**: line 1 wraps its right end (listing · status) under the identity instead of overlapping it; the facts keep ≥ 8rem and the next step wraps under them, still right-aligned | `RecordCard.tsx` | 760 split: no identity / channel overlap, facts read as one sentence, `→ Scan out` 16 px from the right |

### Triage face — one face, per-page families (2026-09-27)

Contract: `HANDOFF-triage-family-contract.md`. Face `design-system/components/triage-card-list/TriageCardList.tsx`
(`TriageFeed` · `TriageFamily` · `TriageSelectionPort` · `TriageServerPages` · `TriageRecordSlot`); each page = host (data, URL) + adapter (meaning).

| Step | Landed | Proof / open |
|---|---|---|
| **Phase 1 — face extracted from orders** (zero pixel change) | `TriageCardList.tsx`, `triage-list-state.ts` (`useTriageCut`), `OrderCardList.tsx` (host), `OrderCard.tsx` | `dom-equivalence` keyed by row id: 37/37 common cards SAME (one order left the queue). Bar delta = another session's view-switch swap. Chips + reload, Esc, X at 1 / N, select-all, Space, Enter, J, `[` `]`, exact Find all pass |
| **Contract extensions** (for every family, never a page branch) | `record-card-types.ts` status union `deadline \| state \| date`; `RecordCard.tsx` per-line open (`onOpenLine`, `openLineId`); `record-fact.tsx` `date` + `missing`; `record-state-glyph.ts`; face `serverPages`, slot `openId`; `useTriageUrlState({ statusParam })` | Orders unchanged (above) |
| **Phase 2a — Inbound · On the way** | `incoming/cards/receipt-card-model.ts`, `IncomingDeliveryCard.tsx` (adapter over RecordCard), `IncomingDeliveriesLedger.tsx` (host); deleted `IncomingDeliveryCardList.tsx` | 3 widths; bar verbs at 1 / N (rail catalog), Enter + strip, J, line open + highlight, server pager `]` `[`, exact PO Find, Floor = ledger. Open: Space unproven by that probe (focus sat on select-all) |
| **Phase 2b — Inbound · History (Docked)**: one card per carton, activity-day sections, top-right = activity date (danger with an exception), next step Unbox · Complete · Continue · Resolve · Review | `history/cards/carton-card-model.ts`, `CartonCard.tsx`, `DockedReceiptsLedger.tsx` (host); `dockedNextStep` shared with the Floor row | 3 widths; chips write `?dstate=` (comma list) and survive reload; Esc resets; X 1 / N; Space; Enter + carton strip; J; next step 16 px / 12 px from the corner; Floor = ledger. J walks lines (matches `openLine`), not cartons |
| Shared receiving pieces | `receiving/use-receiving-selection-port.ts`, `receiving/ReceivingSelectionVerbs.tsx` | Both Inbound hosts |
| **Bar**: record count beside select-all (the "N selected" slot); ⤢ `DeskFullscreenToggle` back as the last control (reverses the other session's "view switch last" — owner ask) | `TriageSelectBar.tsx`, `DeskFullscreenToggle.tsx` | ⤢ last on orders and History |
| **Hotkeys**: view switch + ⤢ teach through `HotkeyTooltip`; every keycap names this device's key (`mod` → ⌘ / Ctrl, ⇧ / Shift, ⌥ / Alt), never "⌘/Ctrl" | `DeskRecordViewSwitch.tsx`, `lib/keyboard/chord-keys.ts` (`platformKeyFace`), `KeyboardKey.tsx`, `DeskStageContext.tsx` (`mod + Shift + F/S`) | Linux probe: Split tooltip caps `Ctrl` `Shift` `S`. App-wide: Mac now paints ⇧ / ⌥ where chords said Shift / Alt |
| **Per-VIEW declarations** (owner: views, not pages — Shipping ≠ FBA ≠ Exceptions): each nav view (`page.item`) declares its grain, noun, facts in reading order, top-right status kind, next-step vocabulary, sections, chip param, record params, paging and keys; hosts build their family with `triageFamily(view, rowFns)` | `triage-card-list/triage-view.ts` (`TriageViewDecl`), `lib/triage/views/{outbound-triage,incoming-pipeline,incoming-docked}.ts`; hosts + adapters cut over (no local nouns / facts / sections / keys left) | `triage-views.test.ts`: every view is a `NAV_PAGE_DECLS` item; its chip param round-trips its saved views, record params never do; unique test ids / storage keys; History's next steps ⊂ declared. **Caught:** To ship saved views dropped `?cardStatus=` → added to `UNSHIPPED_VIEW_PARAMS`. All three render (37 · 28 · 75 cards). One section each is data: History page 1 = Sep 22–25 (today Sep 27 → all "This week"); On the way page 1 = all `AWAITING_TRACKING`. **Open:** the 2 "Delivered · not scanned" deliveries are not on page 1 under "Most urgent first" — check the server's section order (`cutIncomingSections` / `?sort=` default) |
| **History received vs expected** (ShipHero / Linnworks pattern): a line reads `×N` when received = expected, `received/expected` in warning ink when they differ (tooltip "Received 0 of 5 expected · 5 short"), the same ink the carton record's QTY uses | `record-fact.tsx` (`received` kind, shared painter), `history/cards/carton-card-model.ts` | 2026-09-28 at :3050: `/incoming?lane=docked&rh_q=13-14803-70837` paints `0/5` in warning ink (short path proven live; the data has no over case). DB 2026-09-28: 2130 History lines, all carry `quantity_expected`; 10 short, 0 over |
| **History lifecycle = Scanned → Received, plus Exception — receiving only** (owner 2026-09-28: unboxed is received; unfound cartons under Received; On hold had no writer; "Review" is no workflow step; History never states or filters QC — quality control is only the next step a received carton points to). `UNBOXED` / `ON_HOLD` faces deleted from `RECEIVING_LIFECYCLE`; Received is green (success + closed package). Next steps Unbox · QC · Resolve (Received → "QC" bottom-right, on the card and the Floor row). Chips offer only states some carton wears | `docked-record-state.ts`, `tokens/receiving-lifecycle.ts`, `DockedReceiptsLedger.tsx`, `DockedReceivingRecord.tsx`, `incoming-docked.ts` | Live `view=activity` read: 2398 Received · 28 Exception · 0 Scanned lines. Chip counts are cartons (one per card). No saved view stores `?dstate=` (`saved_views`: 0 rows), so no legacy alias is needed; an old `?dstate=UNBOXED` link is ignored (unknown keys drop) |
| **History card face**: line 1 = bare id (PO / order #, else `#carton` — no "PO" / "Carton" words) · brand dot + catalog platform name (outbound's face) · vendor · note; tracking off the face (quick look keeps it, and the carton # when the id is a PO); condition in sentence case through one reader shared with outbound (`conditionSentenceLabel`: "Like new", "Used - A"); unfound cartons paint no fabricated `×0` / "New"; exception note "Exception · Failed" | `carton-card-model.ts`, `CartonCard.tsx`, `lib/conditions.ts`, `lib/orders/order-card-model.ts`; server: `build-sql.ts` selects `mirror.vendor_name` on `view=activity` (legacy fixture mirrored) | 1500 / 1100 / 760 at :3050; vendor on 2051 of 2426 History lines; no `TRK` on the face. Outbound delta: title-case grades ("Like New") now read "Like new" |
| **History → "Unboxed"** (owner 2026-09-28): the Deliveries view, its page title, list label, empty / search texts and status read "Unboxed" — "Received" already means the door scan (`received_at`), the Zoho receive (`DONE`) and a carrier delivery. The status face keeps id `RECEIVED` (the `?dstate=` vocabulary), code `UNB`; nav icon `PackageCheck`. Membership (`view=activity`) now also requires an unbox / open stamp (`ru.unboxed_at` or `ru.opened_at`): 55 lines marked received with neither (Zoho receive / "mark received", Jun 10 – Sep 23) are dropped. `view=activity` also feeds the Unbox station's History tab, which drops them too | `sidebar-navigation.ts`, `nav/context/pages.ts`, `tokens/receiving-lifecycle.ts`, `incoming-docked.ts`, `DockedReceiptsLedger.tsx`, `build-sql.ts` (+ legacy fixture) | :3050: nav, title and chip read "Unboxed"; carton 52956 (PO 09-15168-93714, no unbox stamp) is gone from a search, its unboxed sibling placeholder (#52912) stays. DB: 2312 → 2257 lines |
| **Unboxed attention pills + Kind** (owner 2026-09-28): the state chips are replaced by fixed pills **Claim · Short · Unfound** (`?dflag=`, multi, OR; ⌥1–⌥3; Esc resets; saved views keep it). Claim = a ticket FILED on the line or carton (`claim_ticket`: the linked ticket unless it only mentions the shipment, else the legacy line / carton column); Short = received < expected; Unfound = unmatched carton or its placeholder. Claim / Short amber, Unfound blue. The sidebar State row is gone (one control per param); a sidebar **Kind** row (`?dkind=` purchase · return · trade-in · repair, `dockedIntakeKind`) replaces it. Counts are cartons over the loaded rows (owner chose browser counts; they and the list share the 3,000-line window) | `docked-record-state.ts` (`dockedFlags`, `dockedIntakeKind`), `inbound-lane.ts`, `DockedReceiptsLedger.tsx`, `incoming-docked.ts`, `nav/context/pages.ts` + `parity.ts`, `receiving-routes.ts`, `table-url-params.ts`; server: `sql-receiving-ticket.ts` adds `link_entity` + `claim_ticket` (shared by the legacy fixture, parity unchanged) | :3050: Claim 306 · Short 128 · Unfound 284 of 2,371 lines; Claim + Short → `?dflag=CLAIM,SHORT` survives reload; Esc clears; `?dkind=return` → Claim 113 · Short 34 · Unfound 94, 148 lines |
| **Unboxed card face, second pass** (owner 2026-09-28): (1) not every card reads Unboxed — a card wears its most urgent line's attention (`dockedRecordFace`: Exception › **Claim** amber ticket › **Short** amber › **Unfound** blue unlink), only a clean carton reads green Unboxed; the Floor row wears the same face. (2) A claim's ticket number (#10066) sits on line 1. (3) Price (Zoho PO unit rate) is the last fact; missing or zero paints a struck faint `$—` (shared `money` painter now takes `text: null`). (4) "→ QC" is gone; the corner is a verb the carton strip runs today (`dockedNextStep(row)`): **Resolve** (unfound), **Claim** (short or failed, no ticket), **Print label** (SKU'd line never printed), else nothing — a filed claim waits on its ticket; put-away has an API but no carton verb and no unboxed carton has a bin yet. Unfound now drops a line once paired to a PO | `docked-record-state.ts`, `carton-card-model.ts`, `DockedReceivingRecord.tsx`, `incoming-docked.ts`, `record-fact.tsx`, `record-state-glyph.ts` (ticket) | :3050 page 1: Claim 28 · Unfound 10 · Short 2 · Unboxed 35 cards; corners Resolve 13 · Print label 3 · none 59; "QC" nowhere; 31 priced · 20 struck. `?dflag=CLAIM`: 95 cards, all Claim face, ticket on each. Pills: Claim 306 · Short 128 · Unfound 259 |
| **Unfound vs claim — tickets carry a reason** (owner 2026-09-28): the claim wizard's type is the reason (picker "Reason", grouped Investigation · Vendor claim · Other; seeded from the carton: unfound → Unfound, return → Return, QC fail → its claim, short → Missing). Filing or linking records ONE `receiving_exceptions` row per ticket + scope (`recordTicketReason`; re-file re-codes, a routing type closes it); unlinking closes it; pairing a carton (lookup-po promote, tracking-exception refresh, reconcile) closes its investigations. Carrier loss codes stay write-off only. `view=activity` selects `ticket_reasons` (OPEN investigation / claim rows on the line or its carton); Claim pill = an OPEN claim code with a ticket; line 1 reads "Investigating #10066" / "Damaged #10066" / "Ticket #…" (no reason). Static record-card chips now paint `long` / tooltip / testId (outbound's static "Urgent" sets none — unchanged). Migrations: `receiving_line_id` nullable + anchor CHECK (carton-level rows); backfill of every pre-reason ticket as NO_PO (OPEN if still unidentified, else RESOLVED) | `exception-codes.ts` (`isInvestigationCode` / `isClaimCode`), `receiving-claim-type.ts` (`claimTypeExceptionCode`, `CLAIM_TYPE_FAMILY`), `exceptions.ts`, `file-receiving-claim.ts`, `zendesk-claim/link` (+ `link-request.ts`), `useReceivingClaimController.ts`, `ClaimComposeStep.tsx`, `useComposerTicketClaim.ts`, `reconcile-unmatched.ts`, `lookup-po/route.ts`, `tracking-exceptions/[id]/refresh/route.ts`, `sql-receiving-ticket.ts` (shared by the legacy fixture, parity unchanged), `normalize-row.ts`, `receiving-line-row.ts`, `docked-record-state.ts`, `carton-card-model.ts`, `RecordCard.tsx`, `drizzle/schema.ts`, migrations `2026-09-28_receiving_exceptions_carton_scope.sql` + `2026-09-28b_backfill_ticket_reason_no_po.sql` | Backfill: 419 NO_PO rows (297 OPEN — 217 carton-level, 80 line; 122 RESOLVED); rerun inserts 0. :3050: 2,371 lines, 211 carry reasons; pills Unfound 259 · Claim 0 (was 306 — every legacy ticket is now an investigation) · Short 128; unfound cartons read "Investigating #…" |
| **Unfound red + first** (owner 2026-09-28): Unfound wears `danger` (rail, glyph, pill dot) and outranks Claim / Short (`dockedRecordFace`: Exception › Unfound › Claim › Short; carton urgency the same). Pills reorder **Unfound · Claim · Short** (⌥1 = Unfound). Unfound cartons lead every activity-day band; an explicit column sort is left in the operator's order | `docked-record-state.ts`, `carton-card-model.ts` (`cartonBands`), `DockedReceiptsLedger.tsx` (`FLAG_TONE`), `incoming-docked.ts` | :3050 1500 / 1100 / 760: red rail + unlink glyph, "Unfound 259" first; `?dflag=UNFOUND` survives reload (131 cards, all Unfound), Esc clears; Floor still the industrial ledger, `UNF` rows red |
| **Unboxed corner = unpack date + time** (owner 2026-09-28): the card's top-right reads the carton's first unpack (earliest `unbox_opened_at`, else `unboxed_at`, across its lines) as "Sep 25, 4:48 PM" (PT, `formatMonthDayTimePST`), tooltip "Unboxed · 09/25/2026 4:48 PM PT"; a carton never unpacked keeps its activity stamp, now with time too. Bands still follow the sidebar's activity axis | `carton-card-model.ts` (`unboxedAt`, `firstUnboxed`) | :3050 1500 / 760: "Sep 25, 4:48 PM", "Sep 24, 3:15 PM" on the first cards; fits at 760 |
| **Claims split by identity + Unboxed pill + card polish** (owner 2026-09-28): Claim read 0 because every pre-reason ticket was backfilled NO_PO (investigation) and the Claim pill counts claim codes only. Recoded by identity: unfound carton → NO_PO; identified carton → its QC code / SHORT / new `CLAIM_UNSPECIFIED` ("Claim", seeded at 180). New **Unboxed** pill (`dockedCartonStatuses`: the clean carton, never alongside an attention pill; cards and Floor cut the same cartons). Corner adds who unboxed. Ids bare (no "#") on the card, its peek, its record, and outbound's id-less fallbacks. Missing price `$—` no longer struck (the strike doubled the dash). Card list closes with a hairline; the overflow shadow ends in one (shared `TriageListBody`, so outbound too). Link reason writes are best-effort like create | `exception-codes.ts` (+ test seed list), migrations `2026-09-28c_reason_codes_claim_unspecified_seed.sql`, `2026-09-28d_recode_backfilled_tickets_by_identity.sql`, `docked-record-state.ts`, `DockedReceiptsLedger.tsx`, `inbound-lane.ts`, `carton-card-model.ts`, `CartonCard.tsx`, `carton-record-facts.tsx`, `record-fact.tsx`, `TriageListBody.tsx`, `zendesk-claim/link/route.ts`, outbound `order-card-model.ts`, `OrderRecordView.tsx`, `PaperworkRecentRail.tsx`, `OutboundOrdersLedger.tsx`, `OrderRecordSummaryBar.tsx`, `MorphingRowActionMenu.tsx` | Recode dry run = apply: 122 rows (103 CLAIM_UNSPECIFIED · 14 DEFECTIVE · 5 SHORT), rerun 0. :3050: pills Unfound 259 · Claim 119 · Short 128 · Unboxed 1,482; `?dflag=CLAIM` chips "Claim #9943", "Short #9983"; corner "Sep 17, 9:06 AM · David"; page 1 ids "53339" (no "#"); no double dash; list `::after` hairline 1px |
| **Unboxed identity + operator fact** (owner 2026-09-30): the top-left identity is the matched order / PO id; an unmatched carton shows its carton number and never promotes tracking into that slot. Tracking is secondary context only when an order id exists. The far right always reads **Unboxed by _staff_**; the list projection carries both completion and first-open actors, preferring completion and falling back to the opener (`Not recorded` only when neither actor exists) | `history/cards/carton-card-model.ts`, `history/cards/CartonCard.tsx`, `receiving/lines/{build-sql,normalize-row}.ts`, `receiving-line-row.ts` | Model regression: order-first across every line, no tracking fallback, completion / opener precedence, mandatory staff fact. :3050 smoke: 100 cards / 100 unboxer labels; known order `21-15107-47310` is the first identity button before tracking; unmatched carton 53519 reads `Carton 53519`; actor `David`; right inset 16px |
| **One Find: the header's, never the bar's** (owner 2026-09-28): the triage bar's own Find (sidebar closed) is gone from every triage page (inbound and outbound); `TriageFeed.search` is read-only (`onChange` cut from OrderCardList, LabelsDocsDesk, Docked / Incoming ledgers). With the sidebar closed the global header's field is the page's `NavFind` (was the everywhere palette face), so typing narrows the list and `F` lands there (hidden sidebar field no longer answers). Bulk: a pasted id list on Unboxed / On the way / Unbox matches any id (`receivingFindNeedles`); outbound already locates pasted lists (`?refs=`) | `TriageSelectBar.tsx`, `TriageCardList.tsx`, `GlobalHeaderSearch.tsx`, `NavFind.tsx`, `receiving-line-search.ts`, `DockedReceiptsLedger.tsx`, `IncomingDeliveriesLedger.tsx`, `ReceivingLinesTable.tsx`, `OrderCardList.tsx`, `LabelsDocsDesk.tsx`, `pinned.json` (FindField law) | :3050 nav closed: one visible input each page ("Find unboxed" / "Find orders to ship" at the header), no `*-inline-find`, `F` focuses it. Paste 4 ids on Unboxed (2 PO #, 1 tracking, 1 Goodwill PO) → 3 cartons, each named. Paste 3 order # on To ship → located list, 3 found. Guard `data-table-search-url.guard.test.ts` red before this change (another session's `?find=` edit in `ReceivingLinesTable.tsx`) |
| **Card-view contract** (2026-10-03, ledger `record-card-view-contract`): every `TriageViewDecl` declares its card's anatomy slots — `status` plus `slots: { identity, channel, person, quickLook }`, each with an explicit `none` — declared through `triageView({…})` so they stay literal. `RecordCard` takes the `view`: its model is `ViewCardModel<view>` (only the declared status kind; `null` channel / person where `none`) and `quickLook` is required iff `peek`, absent iff `none` (`quickLook={null}` no longer compiles). Cards fixed to their views: Stock paints a DATE status (last counted / moved, PT), the rack total on hand as its trailing fact and a real quick look (every position's count + move); On the way paints its delivery state; Imports runs / orders paint their status / outcome; the FNSKU desk paints Printed / Not printed; Docked's no-promise fallback is an untoned deadline. Views fixed to their cards: Unboxed → `none` (the unboxer is the far-right fact, owner 2026-09-30), Local pickup → `state`, Labels & docs print cards → `none` (owner 2026-09-27), Uploads → `state` (to print / all printed) | `triage-view.ts`, `RecordCard.tsx`, `lib/triage/views/*`, `card-view-contract.ts`, `card-view-adapters.ts`, `scripts/card-views-guard.ts` (`ds_card_views`), every `RecordCard` adapter, `inventory/stock/{stock-card-model.ts,StockRackPeek.tsx}` | `triage-views.test.ts` runs each adapter's real model builder over sample records against its view (21 views); mutation proof: `quickLook={null}` on Stock / FNSKU and a `state` status on Stock fail `tsc`, the status drift also fails the test |

Open for the owner: Inbound Exceptions (`?lane=exceptions`) is a wire lane, not a nav view — make it
`incoming.exceptions` with its own declaration? · `isAppleModPlatform` is still copied in four files (other
sessions' code) · Unboxed's first read is `limit=150` lines, then the full read (≤ 3,000): pill counts settle
when it lands · the "At the dock" middle view (`view=scanned`) is proposed, not built.

### Dev red observed 2026-09-27 (not owned by this run)

- ~~`/api/orders` 500 on `work_type_enum: "PICK"`~~ — cleared once the QC/Pick session applied
  `2026-09-27_work_type_pick.sql`.
- Hydration mismatch on every `/shipping/orders` load: `ShippingDeskLayout` → `DeskPageChrome` `<h1>`
  renders "Shipping" on the server and "To ship" on the client.
- Intermittent dev-build breaks from other sessions' in-flight edits (`AmbientLayer.tsx` parse error,
  `presentFindDossier` missing export in `SearchReceivingDossier.tsx`).
- `tsc` red in files this run did not touch: `session/artifacts/PaymentArtifact.tsx:112`,
  `api/sku-stock/[sku]/route.ts:30-31`, `m/(shell)/orders/new/page.tsx:3` (missing
  `MobileOrderIntakeForm`), `lib/auth/pin.ts:159`.
- **Owner-ruling collision:** the owner asked (2026-09-27, morning) for a sort button on the Late /
  No ship-by section headers; it landed, then another session removed it the same afternoon ("the
  list's one sort control is the sidebar's `?sort=`"). Not settled by either session — owner call.

Mobile: no port above changes a `/m/*` surface; twins are dedicated phone flows.
