# CycleForge delete list — simplify to one ops spine, three faces, one contract

Status: proposed 2026-10-03. Executable, wave by wave. Line counts are `wc -l` on the
listed paths at the time of writing; evidence column says how each was proven.
Machine-checked entries for the table-engine waves live in
`docs/design-system/consolidation-ledger.json` (`pnpm verify:fast` validates them).

## Status 2026-10-03

- **Wave 0 — done.** 111 knip-orphan files deleted. Kept: the AI-lane files and
  `ops/local-ai-proxy.mjs`.
- **Wave 1 — done, `/unbox` included.** Parked compound pages, per-domain grid folders, and
  the parked field-catalog families are deleted. Also deleted by owner ruling (2026-10-03):
  Warehouse RMA (`app/warehouse/rma/**`, `api/rma/{backlog,disposition,[id]/close,[id]/mark-received}`),
  the warranty-claims surface, Settings Staff/Devices, Inventory Holds, and the `/m/pack`
  queue. Redirects: `/warehouse/rma/**` → `/unbox`, `/m/pack` → `/m/pick`
  (`parked-slot-surfaces.ts`). Ledger: `parked-compound-grids` and `compound-table-engine`
  retired. The `/unbox` Queue · Recent lines are the `receive.queue` carton card list and
  `TaskTable` selects through `GridRowCheckbox` (§3); `components/tables/compound/**` and
  `components/station/receiving-grid/**` are gone. `lib/tables/materialize-tracks.ts` stays: it
  is the keep-sheet column materializer (bins, FBA ready, CSV staging, tech-all).
- **`/search` — partly deleted.** The desk page and its query-mode spec are gone. The
  result row, tabs, preview embed, `dossier/**` and `lib/search` stay because ⌘K, the header
  preview and the rails use them.
- **Not done:** Waves 2–4 belong to other lanes. The dead-dependency sweep has not been run.
- **Data loss — tell the owner.** Wave 0 deleted four orphans that held someone else's
  uncommitted edits: `src/components/layout/QuickAccessButton.tsx`,
  `src/components/packing/PackProfileEditor.tsx`, and
  `src/components/quick-access/{ActionsSection,QuickAccessPopover}.tsx`. Nothing imports
  them. Candidate blobs are in `cycleforge-app/.git/lost-found/other/`:
  QuickAccessButton `4c85a7d…`, `9458a73…`; PackProfileEditor `3cec609…`;
  ActionsSection / QuickAccessPopover `3990e51…`, `3cfc6b2…`. Diff each one against `HEAD`
  before restoring it.

## 0. First principles — what must survive

A physical e-commerce business runs one loop. Every line of code either serves a step
of it or is deleted.

| # | Job (the operator's verb) | Live surface (desk · phone) | Face |
|---|---|---|---|
| 1 | Know the SKU (title, photo, listing) | `/products` · `/m/products`, `/m/pair/*` | card list → record |
| 2 | Expect inbound (PO, tracking) | `/incoming` · `/m/receiving` | card list |
| 3 | Receive / unbox / photo | `/unbox` · `/m/receiving` | card list (grid today — port, §3) |
| 4 | Test / QC / label | `/test`, `/inventory/qc-labels` · `/m/qc` | station + card list |
| 5 | Put away, move, count a bin | `/inventory/locations` · `/m/loc`, `/m/stock` | DataTable (bins) + record |
| 6 | Know stock | `/inventory/stock` · `/m/stock` | card list |
| 7 | Take orders in | `ingestInboundOrder` (one writer) | — |
| 8 | Allocate → pick → pack → label → scan out | `/shipping/orders` · `/m/pick`; `/pack`; `/shipping/label-intake`; `/fulfilled` | card list + stations |
| 9 | FBA | `/shipping/fba` | DataTable (keep-sheet) |
| 10 | Returns, repair, warranty, support | `/repair`, `/support`, `/pickup`, return scan in `/unbox` | card list |
| 11 | Counter / walk-in sale | `/counter`, `/kiosk/v2` | station |
| 12 | Read the day | `/reports?tab=packer`, `/m/reports` | DataTable / report |

### The three faces (nothing else renders a list)

1. **Card list** — `TriageCardList` + `RecordCard`, one `TriageViewDecl` per nav view
   (`src/lib/triage/views/*`). Default for every work queue.
2. **Spreadsheet** — canonical `DataTable` with a direct `TableSurfaceBinding`. Only for
   keep-sheets: ≥5 compared columns, desk-only, sort/edit-in-place (CSV staging, FBA
   ready, Bins, Reports).
3. **Record** — `DeskRecordPlane` / `DetailHubScreen` built from `record-ledger/*` blocks.
   Used when the steady-state result is one row.

The choice comes from the display-method formula in `pinned.json` → `DataTable.law`.

### The one contract — the same actions on every page

| Action | Key / place | Owner |
|---|---|---|
| Find | sidebar field, `F`; paste many ids | `NavFind` / `FindField` |
| Sort | sidebar `?sort=` only | nav decl |
| Filter | state chips in the bar, `⌥1…⌥n` | `TriageViewDecl.chips` |
| Select | check / `X`, shift-range | face |
| Quick look | `Space` | `RecordCard.quickLook` (required, §4) |
| Open record | `Enter` / click | face → record plane |
| Walk | `J` / `K`, `↑` / `↓` | face |
| Back / clear | `Esc` | face |
| Act on 1 or N | selection bar: 3 visible + `⋮`, destructive last, two-press | `RecordActionStrip` + `ArmedDangerButton` |
| Export | bar overflow | `DataTableExportMenu` |

Card anatomy is fixed (`HANDOFF-record-card-families.md` "One anatomy"): rail · check/status ·
line 1 identity · channel · person · chips · note … top-right = the page's priority
status · lead line photo · title · facts · `+N items` · quick look. A page supplies
**data**, never layout.

## 1. Wave 0 — dead code, zero importers (delete now)

Evidence: `npx knip --reporter json` (2026-10-03), cross-checked by grep. **115 files,
14,667 lines.** Excludes `ops/local-ai-proxy.mjs` (systemd unit
`ops/systemd/cycleforge-structured-ai.service` runs it).

Full list in Appendix A. Highlights:

- Pre-contextual sidebars and header switchers: `components/sidebar/{AuditLog,Operations,Products,Studio}SidebarPanel.tsx`,
  `SidebarNavOverlaySlider.tsx`, `sidebar/audit-log-panel/*`, `components/layout/{GlobalScanDock,HeaderDailyTasks,HeaderPageSwitcher,HeaderPinsSwitcher,LiveSyncIndicator,SidebarSection,header-chrome-menu}.tsx`.
- Orphaned FBA station input and sidebars: `components/fba/{StationFbaInput.tsx,sidebar/*,station-input/*,hooks/*}`.
- Dead packer bench: `components/PackerTable.tsx`, `station/StationHistoryTable.tsx`, `station/bench-grid/*`, `hooks/station/*`.
- Dead pairing queue and manuals library browser: `components/products/pairing/*`, `components/manuals/{LibraryBrowser.tsx,library/**}`.
- Dead task workspace pieces: `features/tasks/{TaskWalkSidebar,useTaskComposerSections}.tsx`, `features/tasks/workspace/*`, `features/tasks/grid/*`.
- Unused deps (knip): `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `@gorules/zen-engine-wasm`, `ai`,
  `animejs`, `lenis`. Dev deps `dependency-cruiser` and `eslint-config-next` are knip-flagged; check
  `.dependency-cruiser.cjs` and `eslint.config.*` before removing.

**Procedure:** delete, `pnpm verify:fast`, then re-run knip. Every wave below exposes a new
layer of orphans. Repeat until knip reports zero unused files.

## 2. Wave 1 — the slot (compound) table engine and its parked pages

The compound engine is the second table system. Every page it renders is already
redirected by `src/lib/routing/parked-slot-surfaces.ts`, except §3. The redirects stay as
URL compatibility; the code behind them goes.

| # | Group | Paths | Lines | Evidence |
|---|---|---|---|---|
| 1.1 | Compound engine | `src/components/tables/compound/**` (minus §2.R), `useCompoundSpreadsheet.tsx` | 7,627 | Only live importers are §2.R relocations and §3 ports |
| 1.2 | Parked grid folders (29) | `components/inventory/{allocations,bulk-allocate,drift,events,holds,returns,sku-allocations,sku-bins,sku-ledger,tsn-links,units}-grid`, `inventory/{cycle-counts,cycle-count-lines}`, `components/reports/report-*-grid` (6), `components/search/hits-grid`, `components/settings/{audit-log,kiosk-devices,kiosk-slot-events,sessions,staff-directory}`, `components/station/bench-grid`, `components/walk-in/grid`, `components/admin/sourcing`, `components/products/catalog/catalog-grid` | 11,098 | Each mounted only under a parked route (proxy) or nowhere (knip) |
| 1.3 | Parked field-catalog families (88 files) | `src/lib/tables/field-catalog/{admin-*,audit-log*,auth-sessions*,catalog-link*,cycle-count*,import-exception*,inventory-events*,kiosk-*,part-compatibility*,report-*,search-hits*,sku-*,staff-directory*,unit-allocations*,unit-tsn*,units*,walk-in*,warranty*}` | 11,086 | Importers are only 1.2 grids and their tests |
| 1.4 | Slot registries | parked entries in `components/tables/registered-bindings.ts`; `cell-map-registry.ts` (not `lib/tables/materialize-tracks.ts` — it builds the live keep-sheets' columns) | ~390 | Exist only to materialize compound slot columns |
| 1.5 | Parked inventory pages | `src/app/inventory/{units,cycle-counts,health,bulk-allocate,holds,returns,events,activity,alerts,bins,counts,pulse,skus,throughput,reason-codes,favorites}/**`, `src/app/admin/inventory/**` | 4,263 | `PARKED_INVENTORY_PATHS`, `isPathOrChild('/inventory/health'…)`; reason-codes / favorites parked by `lib/nav/parked-tabs.ts` |
| 1.6 | Parked settings pages | `src/app/settings/{audit,devices,sessions,staff}/**`, `settings/sections/{SessionsSection,KioskDevicesSection}.tsx` | 1,090 | `PARKED_SETTINGS_PREFIXES` — see ops gaps §5 |
| 1.7 | Review desk | `src/app/review/**`, `src/features/review/**` (relocate `OutcomeChip.tsx` first; `MobilePackingRow` uses it) | 3,333 | Every `/review` URL redirects |
| 1.8 | Search desk | `src/app/search/**`, `components/search/**` **except** `SearchResultRow`, `search-tabs`, `SearchFindPreviewEmbed`, `dossier/**` (used by `CommandBar`, `PickOrderWorkspace`, `ToteRecord`) | 3,012 | Every `/search` URL redirects |
| 1.9 | Walk-in sales history | `src/app/walk-in/**`, `components/walk-in/**`, `components/dashboard/DashboardSalesView.tsx` | 690 | `/walk-in` and `/dashboard?mode=sales` → `/counter` |
| 1.10 | Warranty claims **table only** | `components/warranty/WarrantyClaimsTable.tsx`, `components/warranty/grid/**` | 562 | `/support?mode=warranty` parked. Keep the claim dialog, chips, lib and API (live in the order record and support) |
| 1.11 | Orders-queue compound rows | `components/dashboard/orders-queue/{OrdersQueueTableRow,OrdersIndexCells,QueueGroupRow(+test),useOrdersSpreadsheet,orders-queue-descriptor,orders-table-definition}` | ~2,738 | Consumers are 1.7 review tables and dead bench grid. **Keep** `useOrdersQueueFeed/Plane/Rows/Selection`, `helpers`, `queue-row-*` (data layer of `OrderCardList`) |
| 1.12 | Pre-DS pane headers | `src/components/ui/pane-header/**` | 925 | Callers are 1.5 pages; delete after the 1.5 cascade proves zero importers |

**Wave 1 total ≈ 47,000 lines.**

### 2.R Relocate before deleting `compound/` (live outside tables) — done 2026-10-03

| Module | Live importers | New home |
|---|---|---|
| `StageStaffAssignPopover.tsx`, `staff-stage-lane.ts` | `NavFilters`, `OrderIntakeForm`, `OrderAutoAssignSlot`, `MorphingRowActionMenu`, `outbound-orders-ledger-editors`, `MarkAsShippedForm`, `TestingQcAssignee`, `FbaCreateShipmentForm`, `CheckoutAssignments`, `record-ledger/{InlineStageAssign,record-model}`, `lib/nav/context/schema.ts` | `src/design-system/components/` (pinned staff picker) |
| `compound-row-model.ts` types that live resolvers use | `lib/orders/*`, outbound order views, live field-catalog resolvers | `lib/tables/field-catalog/slot-value.ts` (`SlotValue`, `StageStepFacts`, `NextStep`, `Delay`, …) and `lib/tables/row-view.ts` (`RowView`) |
| `scrub-number.ts` | `LabelPrintRunNumField` | `components/labels/scrub-number.ts` |
| `compound-row-plane.ts` | `MorphingRowActionMenu`, `morphing-row-action` | `lib/tables/row-plane.ts` |
| `ignoreRowSelectFromSubtitle` | `useOrdersQueuePlane` | deleted (nothing paints a subtitle part any more) |
| `CompoundSelectStatusFace`, `compound-select-status.ts` | `features/task-board/TaskTable.tsx` | `GridRowCheckbox` plus one static resting glyph |

## 3. Port, then delete — done 2026-10-03

| Surface | Was | Now | Deleted |
|---|---|---|---|
| `/unbox` Queue · Recent (`ReceivingLinesTable`) | `receiving-grid/useReceivingSpreadsheet` compound rows | `TriageCardList` + `ReceivingCartonCard`, view `receive.queue` (`receiving/unbox/UnboxCartonCards.tsx`). Display formula: scan-and-act at a desk station, ≤ 50 queue cartons, one carton per card → card list | `components/station/receiving-grid/**`, `lib/receiving/receiving-{compound-view,group-rollup,group-identity}.ts`, `lib/tables/field-catalog/receiving{,-resolve}.ts`, `lib/tables/data-table-line-{qty,money}.ts`, the receiving `PRODUCT_TABLES` entry |
| `/` task board `TaskTable` | compound select face | `GridRowCheckbox`; the resting gutter shows one static glyph (overdue, else urgent, else done) | the select-face modules and the rest of `components/tables/compound/**` |

Not carried to the card face: the org custom-field columns on receiving lines (`CustomFieldCell`,
`useCustomFieldDefs`, `custom-fields/column-model.ts` deleted with their only mount), the per-staff
column picker and row paint-bucket fills, and the serial copy chip on the row (serials stay in the
line workspace). `materialize-tracks.ts` is not part of this engine and stays (see Status).

**Dropped, not ported:** subtitle drag-reorder tracks, rAF edge-rail pulse (`motionTransition.edgeMarkPulse`
deleted), the Space row-detail band (the card's quick look replaces it).

## 4. One contract — remove the per-page drift that makes tables "all different"

Not a deletion of files; a deletion of **freedom**. Pages today can ignore their own
declaration:

| View decl says | Adapter paints | File |
|---|---|---|
| `inventory.stock` `status: 'state'` | `{kind:'none'}`; date stuffed into `trailing`; rack total only in aria | `StockLedger.tsx:783,801,809,861` |
| Space opens quick look | `quickLook={null}` (Space flips `aria-expanded`, shows nothing) | `StockLedger.tsx:880`, `FnskuPrintDesk.tsx:364` |
| `imports` `status: 'state'` | `{kind:'none'}` | `ImportRowCard.tsx:95`, `ImportRunCard.tsx:106` |
| `incoming.pipeline` `status: 'state'` | `{kind:'none'}` | `receipt-card-model.ts:119` |
| `print-station.fnsku` `status: 'state'` | `{kind:'none'}` | `FnskuPrintDesk.tsx:330` |

Fix: make `TriageViewDecl` declare every anatomy slot (`identity`, `channel`, `person`,
`status`, `facts`, `quickLook`, with `'none'` as an explicit value). Type the adapter's
`RecordCardModel` against it so drift fails `tsc`, and extend `triage-views.test.ts` to run
each family's card builder on a fixture. Then "add the table to the next page" means
writing one declaration and one adapter, never a layout.

## 5. Ops gaps — parked jobs with no live work queue (decide before deleting their data paths)

Parking hid these pages. The job still exists on the floor. Each becomes one
`TriageViewDecl` card view, never a revived compound grid. The UI rows in Wave 1 can go
either way; keep their **lib/API/DB**.

| Job | Was | What still works | Gap |
|---|---|---|---|
| Work warranty claims to closure | `/support?mode=warranty` | log a claim from the order record (`OrderWarrantySummary`) | no queue of open claims |
| Add / deactivate staff, PINs | `/settings/staff` | avatar/photo only (`StaffPhotoCard`) | no staff admin |
| Manage kiosk devices | `/settings/devices` | kiosk runtime | no device admin |
| Disposition returns (restock / refurb / scrap) | `/warehouse/rma` (orphan, 1,190 lines incl. `/api/rma`) | return scan in `/unbox` (`ReturnScanCard`) | disposition queue [INFERENCE: verify `/unbox` covers it] |
| Clear held units | `/inventory/holds` | `onHold` state on `/inventory/stock` cards | no hold reason / release verb on a list |
| Count campaigns | `/inventory/cycle-counts` | per-bin count (`BinCycleCountSheet` on locations / rack) | no campaign list (fine for a small floor) |
| Audit trail | `/settings/audit` | rows still written | no reader (acceptable; query on demand) |

## 6. Wave 2 — orphan routes (no nav entry, no inbound link)

| Group | Paths | Lines | Note |
|---|---|---|---|
| Data wipe station | `src/app/wipe/**`, `components/wipe/**`, `api/serial-units/[id]/data-wipe` | 654 | nav comment "temporarily absent" |
| Work-order calendar | `src/app/calendar/**`, `components/work-orders/calendar/**`, `api/work-orders/calendar` | 360 | zero hrefs |
| Pick-face replenishment desk | `src/app/warehouse/replenishment/**`, `api/replenishment/tasks/**` | 408 | `/replenish` already → `/inventory?section=replenish`; check `ExceptionsRow` count reader first |
| Motion+ demo | `src/app/motion-plus-button/**`, `components/demo/**` | 319 | dev-only, 404 in prod |
| Pure redirect pages | `src/app/{packer,tech,receiving,manuals,admin,signals,replenish,tracking-exceptions,warehouse}/page.tsx` etc. | ~450 | Move each redirect into `proxy.ts` table, delete the page. Keep `receiving/lines/[id]` and `bin/[barcode]` (`/m/l/*`, `/m/b/*` rewrites) |
| Mobile pack queue | `src/app/m/(shell)/pack/**` | 123 | `SURFACE_LAW.md:125` says deleted 2026-09-14, "do not recreate" |
| RMA desk | see §5 | 1,190 | only after the returns decision |

## 7. Wave 3 — subsystems outside the ops loop

| Group | Paths | Lines | Note |
|---|---|---|---|
| Tool-forge (AI that builds tools and commits to git) | `src/lib/tool-forge/**`, `src/app/api/tool-forge/**`, its 4 tools in `lib/assistant/tools/index.ts` | 1,852 | Not an ops job; **owner call** |
| Legacy Anthropic agent loop | `lib/assistant/agent-loop.ts` (+test) | ~780 | `grok-agent-loop.ts` is live |
| Uncalled AI endpoints | `api/ai/{search,tunnel-session,chat-health,usage}` | ~260 | zero callers |
| Inventory sync service | `src/services/InventorySyncService.ts`, `api/zoho/items/sync` | ~222 | route has zero callers. **Keep** `OrderSyncService` (cron) |
| Zen WASM rule engine | `lib/workflow/decision-eval-zen.ts` (+test) | ~290 | dep unused; TS evaluator is live |
| Workflow tap outbox | `api/cron/workflow/tap-reconcile`, `lib/workflow/tap-outbox.ts` | ~245 | not in `vercel.json`, flag default off |
| 410 / no-op stubs | `api/orders/start`, `api/webhooks/zoho/orders`, `api/zoho/webhooks` (untokenized), `api/scan-tracking` | ~209 | zero callers |
| Inbound bypass writers | direct inserts in `api/receiving/lookup-po` | ~400 | route through `ingestInboundOrder` (AGENTS.md one-writer law) |

## 8. Wave 4 — docs, scripts, tests, assets

| Group | Paths | Lines |
|---|---|---|
| Sidebar refactor sprint dump | `docs/refactors/sidebar/**` except `PARITY.md`, `BACKEND-RESULTS.md` | 23,348 |
| Superseded / landed handoffs | `docs/design-system/HANDOFF-{paperwork-print-shipstation,pick-edge-to-edge,inbound-record,card-list-port,desk-record-actions,inventory-records}.md`, `docs/HANDOFF-{outbound-ops-e2e-order-to-scan-out,to-ship-bulk-delete-swipe,to-ship-simplify-pick-facts-square,tasks-board-phase-3,tasks-board-follow-ups}.md` (keep `HANDOFF-welcome-simple-variant.md`: no landed note) | 1,649 |
| Unreferenced scripts | `scripts/tmp-*`, `scripts/.dbscale-*`, `scripts/.backfill-*.json`, `scripts/.heal-*.json`, `scripts/_qa/*.png`, `scripts/test-{endpoints,webhooks}.*`, `scripts/e2e-{mobile-stock-qol,mobile-receiving-scan,receiving-workflow-views}.mjs`, `scripts/jetson/*`, `scripts/qr-audit-*`, one-off backfills (31 files) | ~2,550 |
| Unreferenced tools | `tools/qc-hub-agent/**` | ~1,165 |
| Stray assets | `public/USAV Solutions - Sales Receipt.zip`, `public/platform to id/*.csv` | — |
| npm lockfile in a pnpm repo | `package-lock.json` | 15,780 |
| Root scratch | `.cards-qol.mjs`, `.smoke-qc.mjs`, `search-identifiers.txt`, `upload-env-to-vercel.sh` (superseded by `pnpm vercel:env:push`) | ~250 |
| Tests of Wave 1 code | field-catalog and compound tests go with their subjects | (in Wave 1) |
| Source-text pinning tests | `src/components/mobile/stock/mobile-on-hold-stock-contract.test.ts`, `mobile/v2/fulfillment/mobile-v2-allocate-layout.test.ts`, `sidebar/contextual/chat-session-rows.test.ts`, `app/m/(shell)/qr-auth/qr-auth-desktop.test.ts`, `lib/reports/mobile-reports-v2-contract.test.ts` | ~400 |

Keep the `*.guard.test.ts` files and `scripts/design-consolidation-guard.mjs`. They are the
mechanism that stops retired forks from returning.

## 9. Looks deletable — must stay

- `src/design-system/components/record-ledger/**`: building blocks of every record view (`RecordEvidence` 40 importers, `RecordGroup` 37).
- `components/dashboard/orders-queue/{useOrdersQueueFeed,useOrdersQueuePlane,useOrdersQueueRows,useOrdersQueueSelection,helpers,queue-row-*}`: data layer of Allocate.
- `components/warranty/{WarrantyLogClaimDialog,chips,WarrantyWorkspace…}`, `lib/warranty`, `api/warranty`: live claim logging; packing reports read warranty.
- `components/search/{SearchResultRow,search-tabs,SearchFindPreviewEmbed,dossier/**}`, `lib/search/**`: ⌘K and record dossiers.
- `DataTable`, `NonlinearTableHost`, `LedgerGrid`, `VirtualGroupedSections`, `GridRowCheckbox`, `queue-row-chrome`: the spreadsheet face.
- `TriageSections` / `TriageScrollLayout` (form host, not a list), `MobileDataListRow`, `DetailHubScreen`, `DetailSummaryCard`.
- `ui/button.tsx` (Radix `asChild` base), `ui/sidebar.tsx`, `ui/calendar*.tsx`, `CopyChip`, `AnimatedCheck`, `SignaturePad`.
- `ReceivingSurfacePage`, `PackerSurfacePage`, `TechSurfacePage`, `ReceivingDashboard`, `DashboardSidebar` (mobile drawer), `CommandBar`.
- `src/app/{receiving/lines/[id],bin/[barcode],open-links,inventory/qc-labels}`.
- `OrderSyncService`, `api/v1/picking/*` (phone picker), `api/reports/operations-live`.
- `ops/local-ai-proxy.mjs`, `scripts/gcs-bucket-cors.mjs`, `scripts/debug-transfer-order-match.js`, `scripts/{register-server-only-shim,shim-server-only}.cjs`, `scripts/verify-profile.mjs`, `tests/shot*.mjs`, `public/pdfjs/**`.

## 10. Order of execution

```
Wave 0 (knip dead) ─► Wave 1 relocations (§2.R) ─► Wave 1 deletes ─► knip again
      ─► §3 ports (/unbox, TaskTable) ─► delete compound/ ─► §4 contract
      ─► §5 decisions ─► Waves 2–4
```

After each wave: `pnpm verify:fast`, proxy redirect smoke at `:3050`, knip re-run. Then flip
the ledger entry to `retired` with `deletedPaths` + `forbiddenSource`.

**Total:** ≈ 70,000 lines of source (Waves 0–3) plus ≈ 45,000 lines of docs, lockfile and
scripts (Wave 4).

## Appendix A — Wave 0 knip-unused files (lines per directory)

- `./` (200): `.cards-qol.mjs`, `.smoke-qc.mjs`
- `scripts/` (87): `tmp-ai-chaos-drill.mts`
- `src/components/` (138): `PackerTable.tsx`
- `src/components/admin/` (735): `FbaCatalogSidebarPanel.tsx`, `LogsSidebarPanel.tsx`, `StaffScheduleSidebarPanel.tsx`, `admin-sections.ts`
- `src/components/audit-log/` (522): `AuditLogFilterStrip.tsx`
- `src/components/dashboard/` (137): `GettingStartedChecklist.tsx`
- `src/components/fba/` (195): `StationFbaInput.tsx`
- `src/components/fba/hooks/` (120): `usePendingCatalog.ts`, `useTodayPlan.ts`
- `src/components/fba/sidebar/` (1068): `FbaCatalogSidebar.tsx`, `FbaFnskuScanToast.tsx`, `FbaSidebar.tsx`, `FbaWorkspaceScanField.tsx`, `FbaWorkspaceSidebar.tsx`, `fba-sidebar-shared.ts`, `fba-workspace-hooks.ts`, `fbaShipmentTracking.ts`, `index.ts`
- `src/components/fba/station-input/` (1399): `FbaPendingPlanQueue.tsx`, `FbaPlanPreviewList.tsx`, `FbaQtyStepper.tsx`, `useFbaPlanFlows.ts`, `useFbaScanRouting.ts`, `useFbaSelectMode.ts`, `useFbaStationInput.ts`
- `src/components/labels/` (185): `ProductLabelsRecentRail.tsx`
- `src/components/layout/` (977): `GlobalScanDock.tsx`, `HeaderDailyTasks.tsx`, `HeaderPageSwitcher.tsx`, `HeaderPinsSwitcher.tsx`, `LiveSyncIndicator.tsx`, `SidebarSection.tsx`, `header-chrome-menu.tsx`
- `src/components/manuals/` (138): `LibraryBrowser.tsx`
- `src/components/manuals/library/` (625): `BulkMoveSheet.tsx`, `FileButton.tsx`, `FolderButton.tsx`, `FolderView.tsx`, `LibraryChrome.tsx`, `LibraryPrimitives.tsx`, `manuals-library-api.ts`
- `src/components/manuals/library/hooks/` (452): `useManualDragDrop.ts`, `useManualNavigation.ts`, `useManualSelection.ts`, `useManualsData.ts`, `useManualsTree.ts`, `useThumbnailBackfill.ts`
- `src/components/orders/` (30): `NewOrderEntryOverlay.tsx`
- `src/components/outbound/ready/` (29): `ReadyModeBody.tsx`
- `src/components/photos/photo-library-grid/` (250): `PhotoAttachGrid.tsx`
- `src/components/products/catalog/catalog-grid/` (91): `catalog-compound-row-view.ts`, `useCatalogSpreadsheet.tsx`
- `src/components/products/pairing/` (784): `AddOrPairSkuModal.tsx`, `PairingQueueList.tsx`, `PairingUnmatchedSection.tsx`, `usePairingQueue.ts`
- `src/components/receiving/inventory/` (739): `InventoryPoHeader.tsx`, `InventoryPoLineList.tsx`, `useInventoryPoDossier.ts`
- `src/components/receiving/workspace/line-edit/` (160): `ReceivingPhotoPeek.tsx`
- `src/components/repair/` (2): `index.ts`
- `src/components/reports/report-packer-day-grid/` (87): `useReportPackerDaySpreadsheet.ts`
- `src/components/right-rail/` (27): `useRightRailOccupant.ts`
- `src/components/shipped/details-panel/` (97): `ShippedNotesComposer.tsx`
- `src/components/sidebar/` (995): `AuditLogSidebarPanel.tsx`, `OperationsSidebarPanel.tsx`, `ProductsSidebarPanel.tsx`, `SidebarNavOverlaySlider.tsx`, `StudioSidebarPanel.tsx`
- `src/components/sidebar/audit-log-panel/` (542): `AuditSectionPickers.tsx`, `ReceivingPOPicker.tsx`, `SidebarListPicker.tsx`, `TraceSerialPicker.tsx`, `audit-log-panel-shared.ts`, `useAuditSectionList.ts`
- `src/components/sidebar/dashboard/` (183): `DashboardRecentsPanel.tsx`
- `src/components/sidebar/operations/` (227): `HistoryBrowseFilters.tsx`
- `src/components/sidebar/rail-shell/` (93): `LabelPrintRailFilters.tsx`
- `src/components/station/` (285): `StationHistoryTable.tsx`
- `src/components/station/bench-grid/` (174): `bench-row-view.ts`, `useBenchSpreadsheet.ts`
- `src/components/tables/compound/` (117): `useCompoundRowDetail.tsx`
- `src/components/ui/` (70): `checkbox.tsx`, `separator.tsx`
- `src/design-system/providers/` (23): `useModeFeedback.ts`
- `src/features/tasks/` (364): `TaskWalkSidebar.tsx`, `useTaskComposerSections.tsx`
- `src/features/tasks/grid/` (91): `task-desk-compound-view.ts`
- `src/features/tasks/workspace/` (1143): `TaskDocumentFace.tsx`, `TaskDocumentsSection.tsx`, `TaskEvidence.tsx`, `TaskLinksSection.tsx`, `TaskScheduleSection.tsx`
- `src/hooks/` (296): `useEntitlements.ts`, `useFixedBandHeight.ts`, `useListingGallery.ts`, `useNewOrderParam.ts`, `useReceivingPhotoTakenCount.ts`, `useRecentDetailStacks.ts`
- `src/hooks/station/` (193): `usePackerTableController.ts`, `useStationDetailsSelection.ts`, `useStationReconnectSync.ts`
- `src/lib/` (90): `inventory-triage-status.ts`, `sidebar-titles.ts`
- `src/lib/ai/` (139): `turn-limits.ts`
- `src/lib/fba/` (135): `plan-helpers.ts`
- `src/lib/inventory/` (120): `sale-ledger.ts`
- `src/lib/nav/context/` (16): `index.ts`
- `src/lib/quick-access/` (70): `page-label.ts`
- `src/lib/search/` (24): `resolve-receiving-linked-order.ts`
- `src/lib/selection/` (3): `station-scopes.ts`
