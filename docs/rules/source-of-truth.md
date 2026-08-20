# Source-of-truth invariants

Each concern below has exactly one source module. Read from it; never inline, copy, or re-derive the mapping.

**This is the only list.** Root [`AGENTS.md`](././AGENTS.md) links here rather than carrying a compact
twin — a second table drifts from this one the first time a row changes in just one place.

## Presentation kinds (UI waist — data drives display)

Views **assemble** resolved facts; they do **not** invent label maps, hues, or chip types. When rendering domain
fields, pick the presentation kind and import from the SoT below (Kinetic Ledger law 4 — [kinetic-ledger.md](kinetic-ledger.md)).

| Facet / kind | Source |
|---|---|
| Civil day / instant / warehouse zone | `src/utils/date.ts` |
| Condition grade → label | `src/lib/conditions.ts` (`conditionLabel`) |
| Condition grade → tone | `src/lib/condition-tone.ts` (+ `useConditionGradeStyle`) |
| Source platform → label / tone | `src/lib/source-platform.ts` (+ org catalog via `usePlatformMeta`) |
| Platform accent hex → ink / soft fill | `src/lib/color-contrast.ts` (`platformPaintFromHex`) — `platforms.color_hex` only |
| Carrier brand → mark / native hex | `src/lib/carrier-brand.ts` (+ `CarrierMark`) — **never** tenant-overridable; marketplace platforms stay in `source-platform.ts` |
| Receiving type → label / tone / icon | `src/lib/receiving/receiving-type-meta.ts` |
| **Cross-entity urgency** ("make *this* urgent") | `src/lib/urgency/` — vocabulary `urgency-targets.ts` (client-safe) · routing `promote-urgency-core.ts` (pure) · entry `promoteUrgency` (`promote-urgency.ts`). Binary rung `urgent \| normal` over order · carton · ticket; richer per-record scales stay in their own modules. **Never** a fifth single-purpose urgency writer. See **Cross-entity urgency** below. |
| Typed identifiers (serial, FNSKU, tracking, …) | `CopyChip` family + `src/lib/copy-chip-format.ts` |
| **Stacked row identity** (title → keys) | `StackedRowIdentity` (`src/components/ui/StackedRowIdentity.tsx`) + `joinStackedIdentityKeys` / `StackedIdentityKeySep` — long title / subject on row 1; typed `CopyChip` keys (ticket # · order # · PO · tracking · SKU · FNSKU · serial) on row 2. **Narrow / small-width two-row face** for drill parent maps, pickers, sync rows, repair trays, mobile sheet headers, inventory pulse, unfound match, FBA selected lines, **and multi-select batch rosters** (`RailSelectionRoster` / `RailSelectionRosterRow` in Order · Receiving · Repair right-rail shells) — never a hand-rolled `flex-col` title/meta twin or single-line `title \| mono id`. Ticket pick lists compose thin `TicketPickRow` on top. Golden: Unbox History `LedgerDrillParentMap` · Move photos · Orders import sync · Support ticket subject / `SupportTicketRow` · `TicketPicker` family · repair `ProductSelector` tray · carton-add `ResultRow` · mobile packing/carton/testing headers · `OrderRailShell` selection roster. **Never** park a short durable key trailing (or leading as mono `#{id}`) on the title row. See **Stacked row identity** below |
| **Compact activity row** (ops feed face) | `CompactActivityRow` (`src/components/ui/CompactActivityRow.tsx`) + `RailRowBody` — status mark · title · **one** fact · short age (`formatLaneAgeCompact` → `4h` / `30m` / `3d`). Golden: station recent rails (`RailRow`). Portable: GlobalHeader inbox (`ActivityInboxPopover`). **Never** a large kind glyph, prose `4 hrs ago`, or chip/pill parade on this face — that job is StackedRowIdentity / detail. See **Compact activity row** below |
| **Inbox surface by job** | Header bell (`ActivityInboxPopover`, ephemeral + dismissible) · Home → Inbox (`HomeInboxMode` over `staff_inbox_items`, durable `unread/read/done/snoozed`) · Home → Tasks (`/api/ops-plans/inbox`). `staff_inbox_items` = the system ledger; `staff_messages` = the human DM store — **sibling tables, never merged**. See **Inbox surfaces** below |
| Staff / org identity mark (avatar circle) | `@/components/identity` — `StaffAvatar` (photo → colour+initials) / `IdentityMark`; initials from `staffInitials` |
| Capability / provider nouns | `src/lib/integrations/capability-labels.ts` (+ server connections) |
| Cross-entity search row | `SearchHit` / `src/lib/search/search-hit.ts` + hybrid retrieval |
| Printed barcode payload (**encode**) | `encodePrintMatrix` in `src/lib/qr/platform-link.ts` — see **Printed code ↔ scan round-trip** below |
| Scanned / typed payload (**decode**) | `routeScan` in `src/lib/barcode-routing.ts` — see **Printed code ↔ scan round-trip** below |
| Lifecycle / status dots | lifecycle tone registries / `workflowStageDot` (do not invent status maps) |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Motion **intent** (which physics for this job) | `src/design-system/motion/roles.ts` — `motionRole.swap.scan` · `swap.focus` · `push.rail` · `gesture.press` · `feedback.pulse` · `procedure.advance` (**deferred** — flat ProcedureDeck unused). Six roles; a seventh means a new JOB, never a new duration. Catalog (`framerPresence` / `framerTransition`) stays the implementation — see **Motion roles + import path** below |
| Motion **physics tokens** | `src/design-system/motion/tokens.ts` — `springSnappy` (utilitarian spring) · `fadeInstant` (opacity flash). Named presets + dense primitives (`DenseRowReveal` · `DenseList` · `ActionFlashRow`) resolve here |
| Motion **import path** (the engine) | `@/design-system/motion` — the ONLY motion import in `src/`; `framer-motion` / `motion/react` banned outside `src/design-system/motion/**`. |
| Typeface cuts (sans **Inter** · condensed **Plex** · mono **Plex**) | `src/lib/fonts.ts` + `typography/families.ts` (stacks mirrored in `styles/globals.css`) |
| Type role → size/leading/tracking/weight/family/numerals | `tailwind.config.mjs` `fontSize['role-*']` + the CF Type plugin |
| Font weight ceiling (600) | `typography/weights.ts` (`MAX_FONT_WEIGHT`) |
| Spacing scale + intents | `src/design-system/tokens/spacing.mjs` (+ `Stack`/`Inset`/`Row` primitives) |
| Focus affordance | `src/design-system/tokens/focus-ring.ts` (`focusRing(archetype, tone)`) |
| Depth elevation (flat · raised · overlay) | `src/design-system/tokens/shadows.ts` (`elevationClass`) — **planes, not gutters**; see **Depth elevation** below |
| Depth-as-planes (exact flush work frame) | Surface steps `bg-surface-canvas/sunken/card` + `elevationClass` + `nestedCorner` / `nestedCornerClass` on **one shared ground** (`app-surface.ts` · `CONTEXT_PANEL_HOST` in `context-panel-column.ts`). Outer `m-*` islands between push columns are **not** depth. See **Depth elevation** · **Frame column budget** |
| Frame column budget (center floor · yield ladder) | `src/lib/right-rail/frame.ts` (`MIN_WORK_SURFACE_PX`, `STATION_PUSH_CENTER_FLOOR_PX` = 720, `resolveRightRailFrame`) + `station-dual-rail.ts` + **Flex-Grow Sandwich** (`StationScanPaneHost` + `StationDisplaysPushColumn` — middle LOCK 720; Displays `flex-1` always fills leftover; no hard-coded host gutters) + `CONTEXT_PANEL_RESIZE` / `DETAIL_STACK_RESIZE` — open rails must leave the center lock; see **Frame column budget** below |
| **Paint content order** (Tier-1 LCP · P0–P3) | `src/lib/observability/tier1-paint-order.ts` + `paint-timing.ts` — shell → primary → context → trailing; never `ssr: false` on the declared LCP without an SSR stand-in. See **Paint content order** below · [`docs/performance/HANDOFF-lcp-streaming.md`](././docs/performance/HANDOFF-lcp-streaming.md) |
| Ops table / spreadsheet surface shell | `src/design-system/tokens/table-surface.ts` — `TABLE_SURFACE_CLIP_CLASS` (framed card) · `TABLE_SURFACE_SHEET_CLASS` (flush Sheets plane) · `TABLE_FROZEN_HEADER_CLASS`; Workbench sheet body/chrome hosts: `WORKBENCH_SHEET_HOST` · `WORKBENCH_SHEET_CHROME` |
| **Table-engine fan-out (History first)** | New spreadsheet capabilities dogfood on Unbox History (`ReceivingGridHost`) before any other `entityFamily`. Live custom fields = `CUSTOM_FIELD_LIVE_ENTITY_TYPES` only. See **Table engine fan-out (History first)** below |
| Sticky LedgerGrid column-header row (select-all · sort · frozen · tip) | `@/design-system/components/grid` `LedgerGridColumnHeader` + layout API — Receiving / Incoming / Pickup / Catalog / Repair adapters thin; **Orders header is the permanent allowlisted fork** (`OrdersQueueColumnHeader` — resize + viewport force-hide; shell mounts `LedgerGridSurface` with `forceHidden`; column order pinned to layout SoT like Unbox History). Inner label: `GridHeaderLabel` — **text (+ sort chevron)**; type glyphs are **not** default (narrow-track glyph-only or an explicit `glyph` override only). Do **not** half-port Orders onto the factory. **Casing:** Sentence case via `tableHeader` (`presets.ts`) — source `label` / `gridLabel` as-is; never CSS `uppercase` (that stays for eyebrows · chips · field/section labels). Golden consumer: Unbox History. |
| Grid surface features (triage wash · multi-select · in-cell edit · Fields · day bands) | `@/design-system/components/grid` `GridSurfaceCapabilities` on `GridSurfaceDescriptor` — see **Grid surface capabilities** below |
| LedgerGrid parent→child **drill** (linked dual panes) | `@/design-system/components/grid` `LedgerDrillHost` + `LedgerDrillParentMap` + `ledger-drill-layout` (`LedgerDrillUrlContract`) — WMS-wide; domain adapters (e.g. receiving History `ReceivingDrillHost`, Orders `OrdersDrillHost`) stay thin. **List** = flat leaf sheet (no in-grid PO/order summary); **Drill** = parent map holds rollups; **compare** = independent panes — never conflate. Law: [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md) → Collection layouts. |
| Grid leaf-row fill (selection · optional triage · card) | `ledgerRowFillClass` in `src/components/ui/queue-row-chrome.ts` (gates flag wash on `capabilities.rowTriageFlags`) |
| Grid row paint fills (Sheets-like) | Unbox `HistoryRowPaintChrome` · To-ship `OrdersRowPaintChrome` + `GridRowPaintTrigger` + `GRID_HIGHLIGHT_PRESETS` → `staff_preferences.tableColumns[t].rowFills` (`receiving` / `orders`) — left of List\|Drill; see **Grid row fills** below |
| Navigator row selection (facet · saved-view · day-tree · Desk segment) | `NAV_ROW.selectedClass` in `src/components/ui/queue-row-chrome.ts` — quiet sunken wash; never `QUEUE_ROW.selectedClass` (that is record pick) |
| Grid leaf-row shell (fill · template · map columns) | `@/design-system/components/grid` `LedgerGridLeafRow` — domain `renderCell` stays per family |
| Grid cell chrome (inset · row hairline · frozen sticky · row shell) | `@/design-system/components/grid` `ledgerGridCell` / `LEDGER_GRID_FROZEN_CELL` / `ledgerGridRowShellClass` — **BOTTOM row rules only** (no vertical column cage); see **Grid cell chrome** below |
| Grid column justification (end vs start) | `@/design-system/components/grid` `resolveGridColumnAlign` / `gridCellAlignClass` / `gridHeaderCellAlignClass` — see **Grid column justification** below |
| Grid ROW anatomy (dot · chip · stamp) | **A fact belongs to its own COLUMN, not a neighbour's cell.** No status dot in an identity cell (`ui-design-system.md` → One row anatomy); the status track is a dot **inside** the house chip via `GridStatusCellValue` (`@/components/ui/grid-cells`), tone from the lifecycle registry (pastel badges only — `workflow-stages.ts` / `ui-design-system.md` → Eyebrow headers + chips; Unbox History is the golden consumer); a civil day and its stamp share ONE column, never two. Full set with reasons: [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md) → Row anatomy |
| Grid frozen-pane sticky offset | `gridFrozenLeft(columns, key)` in `@/design-system/components/grid/grid-column-geometry` — takes the SURFACE's own columns, and its width fallback is the track's rem FLOOR. Never re-hand-roll it; never fall back to `col.width` (a `minmax` string), which is illegal in `calc` and silently computes `left: auto`. |
| Grid identity columns (freeze · lock · never in-cell edit) | Column model `frozen: true` → `gridFrozenKeys(columns)` (per surface); house default + editability floor: `GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` — see **Grid identity pane** below |
| Grid column visibility (per-staff) | `@/design-system/components/grid` `useGridColumnVisibility` / `useGridFields`; operator entry = `GridColumnGutter` → `GridColumnDetailsPanel`. **Band-3 portal is the norm (2026-08-06):** every table with a `WorkbenchTriageBand` passes its controls slot as `columnTriggerPortalTarget` so the `▦` sits with staff / filter / week / sort; card-corner hover-reveal is the fallback for tables with no Band-3. One door either way — see **Grid column visibility + sort** below |
| Grid column WIDTH (per-staff drag-resize + Columns Display) | `ColumnResizeHandle` + `useGridColumnWidths` → `staff_preferences.tableColumns[t].widths`; staff min/max via `widthBounds` (`useGridColumnWidthBounds`); applied as `--cf-col-*` via `LedgerGrid` `columnVars`. Exact Width · Min · Max also in `GridColumnDetailsPanel`. Which columns carry a grip: `isGridColumnResizable` — see **Grid column visibility + sort** below |
| Grid column sort (URL-durable) | `@/hooks/useUrlColumnSort` → `?colsort=` / `?coldir=` — see **Grid column visibility + sort** below |
| Collection-surface action planes | `display/workbench.md` — in-cell · row-scoped · multi-select · record, one primary plane each |
| Workbench branch (Layer C recipe) | `SURFACE_REGISTRY.workbenchBranch` + `WORKBENCH_BRANCH_IDS` in `src/lib/stations/surface-keys.ts` — `ops-queue` · `master-detail` · `board` · `fact-stack` · `service-workspace`; null on Station/Monitor/Canvas. Law: `display/workbench.md` + child recipe files |
| **Scan-station primary work surface** | **Main Unbox (dogfood):** PO-line ledger + label (`POUnboxingSection` + `UnboxLabelPreview`) under carton context; capture in `UnboxDockHost` — see **Unbox centre (main)** below + full walk [`display/unbox-station.md`](display/unbox-station.md). Centre **Procedure focus deck** stays parked. Sibling ports: [`display/station-port-from-unbox.md`](display/station-port-from-unbox.md). |
| **Scan-station centre lines display** | The centre is **ops-flow only** — that station's exact triage / I/O: the carton's **lines** (PO **items** or **unfound** lines via `LinePoItemsSection` / `UnmatchedItemsSection`) under identity, dock below, plus station-owned ops content (Unbox label preview · Arrival Classify · dock Staging · Testing verdict slots). That is the work surface. **Never centre advisory** banners, “needs attention” strips, ticket history, claim wizards, or dossier summaries — those are **contextual detail** and open as right-edge **Displays** leaves beside the middle (`StationDisplaysPushStack` / `StationDisplaysPushColumn`: Ticket · Pairing/Linkage · Photos · Timeline · …) — never a centre `SectionTabsSlider` strip and never a `RightRailHost` occupant. **QC (Testing):** on line open, linked ticket / fail→claim auto-opens Ticket Displays (`resolveTestingTicketContextOpen` + `TicketDisplayHost`); middle stays PO lines + Pass · Print. **Arrival port (2026-08-09):** centre = one white door-flow plane (`DISPLAYS_FLUSH_HOST` + `appSurfaceFillClass('chrome')`) = items **without units chrome** (no condition · serial · Units) + **Classify**; **Staging** is the flush dock Band 1 ACTION (`ArrivalStagingDockControl` via `UnboxDockHost`); dogfood strip = Save-for-unbox (no Omnichannel notes — notes live on Unbox); Displays = **Pairing** only. **Labels** keeps Print · Documents · Timeline as centre tabs on a flush `StationPanelRoot` (Unbox pad grammar — not Displays push). Unbox (`LineEditPanel`) is the golden; Arrival · Testing · Pack · Shipping · Packer review compose Displays; Labels composes the flush column shell. Operator copy: **Open displays** / **Hide right panel** (`StationDisplaysEdgeToggle`) — not “inspector” / “details editor”. Law: [`display/station-workbench.md`](display/station-workbench.md). |
| **Station PO line row (work)** | `PoLineRow` + `PoLineMetaGrid`: nested CSS grid `48px_1fr` (flush thumb \| content — thumb keeps structural `border-r`); title **wraps**; boxed meta `auto×3 + 1fr serials + auto price` with `border-t` + **`gap-x-3` whitespace** (no meta `divide-x` / vertical column hairlines — inline PO meta favors horizontal alignment + gap so the eye can sweep the row). Serials cell = truncated recent last-8 preview + **View All** as a **gap-separated** peer (no `border-l`) → Units Displays (`openDisplays('units')`). Structural vertical `divide-x` stays only on joined scan instruments (`SerialCard` / Units). Identity classify pills use flush `STATION_IDENTITY_GROUP_CLASS` (`gap-0`), same abut grammar as Photos · Claim — flat faces (`shadow-none`), never soft drop shadows or `gap-1.5` air between urgency · platform · type. **Dual edit loci:** when `dockOwnsCapture` (main Unbox), bottom dock owns scanner/procedure; condition · serial chips forward via `onEditConditionInDock` / `onEditSerialInDock` → `focusStep` (+ `receiving-focus-scan`) **and** select the line; the **active line** mounts `ActiveLineConditionSerial` under the row for mouse go-back edit (`autoFocusSerial` off — wedge stays dock); dock + under-row share `useUnboxLineController` writes (no third path). When `!dockOwnsCapture` (Testing / unmatched), `activeRowSlot` may mount under every editable line (qty>1 → N unit slots). No title collapse chevron (removed 2026-08-08). No progressive multi-panel stack under every SKU. Per-serial deep edit also lives in Units Displays. See **Unbox centre (main)**.test.ts` + +. |
| Collection map keep-alive | Prefer `display:none` over unmount when focus overlays the map — reference `ReceivingRightPane`. Service-workspace forbids unmounting the queue on ticket open — `display/workbench-service.md` |
| Return-to-scan chrome CTA | **Every** scan-station hybrid page (Unbox · Testing · Pack · …): solid primary in `WorkbenchTrailingCluster.actions` — top-right of the workbench context bar (`WorkbenchChromeHeader` trailing), **at or above any KPI display, never below it** — on **every** strip tab. **It RESUMES** (ruled 2026-08-03, superseding close-overlay-first): resolve the station's MRU record → land the bench tab **without clearing the pick** (`clearLine: false` — `setUnboxView` clears by default) → **open** that record → focus the scan bar. The button sits in the station's own chrome, so "go here" is not something it can mean; the operator is already here, and what they want is the carton they left. Landing a bare table instead read as a no-op: the MRU comes from `view=unbox_opened` while Recent is `view=viewed` (different memberships), and `useReceivingRowSelection` nulls a highlight absent from its rows — so the row pulse frequently could not fire at all. On a rail that takes a selected id, ONE `receiving-select-line` opens the record **and** marks the left sidebar — never a second parked-cursor field beside it. A failed/empty MRU lookup leaves any open record alone. Reference: Unbox `UnboxWorkspaceHeader` (“Unbox”). Law: `display/workbench.md` → Multi-region pages (+ `display/station.md` § hybrid). **Porting this to Testing · Triage · Pack · Shipping · Labels: `docs/todo/return-to-scan-PORTS.md`** — the per-surface registry, the copy-this handler recipe, and the traps (feed mismatch · `clearLine`) live there, not here |
| Workbench chrome flush (ops CTA / tab radius) | Ops chrome is flush-square — solid trailing CTAs (Unbox / Import / Add / Check), tab bands and the Unbox History week calendar compose `cornerClass('flush')` (`rounded-none`). `WORKBENCH_CHROME_PILL_CLASS` (`workbench-shell.tsx`) is now `cornerClass('flush')`; soft radius and horizontal pill bands are debt. Band-1 leading Pin-list cube (when earned) abuts the tab rail via `WORKBENCH_CHROME_BAND_FACE` (`gap-0 p-0`). See **Workbench chrome flush** below |
| **Workbench Band-1 strip** (system tabs · list-pin · resolve) | House chrome for every workbench page: **fixed process/system tabs** (same for every staffer — never Chrome-style staff-hide) + optional **closed-catalog Pin-list extras** (cap `UNBOX_PINNED_EXTRA_TABS_MAX`, staff→role→org via `resolveUnboxPinnedTabs`) + Band-3 Views + GlobalHeader page-pin. Golden system strip: Unbox `UNBOX_WORKSPACE_TABS` (Inbound · Queue · Recent · History) in `unbox-workspace-state.ts`; list-pin UI: `UnboxAddListPopover` + `unbox-extra-tabs.ts` + `unbox-default-pins.ts`. Pin-list cube is **earned** when a surface has a closed foreign-collection catalog; otherwise omit. Strip membership ≠ `saved_views`. Scan periphery ≠ Workbench Views; embed prefs ≠ L1 desk (`incoming_embed` vs `incoming`). See **Workbench Band-1 strip** below · `display/workbench-ops-queue.md`. |
| Host vs content pad (column = the card) | Outer hosts are flush (`p-0` / named sheet·rail tokens) — never decorative column `p-*` / outer `m-*` islands. Content pad lives on the row via `inset-field` / `inset-cozy` / `SIDEBAR_SCAN_DOCK_LEADING_ROW`. Desk golden: To-ship (`DashboardOrdersView` + `OutboundWorkspaceHeader`). See **Host vs content pad** below |
| Chrome-pinned inline KPI readout (`WorkbenchChromeHeader` `middle` slot) | Additive, optional prop on `WorkbenchChromeHeaderProps` (`workbench-shell.tsx`) — a single-line stat cluster between `tabs` and the right cluster, `undefined` for every consumer but Unbox (`UnboxChromeKpiCluster.tsx`). Never `OpsKpiBand`/`KpiTile` here — those are body/rollup card sizing. Paired with the Unbox-local **data-table triage band** (`UnboxTriageBand` — search left, refine + week filter right) as row 2 of the same pinned `chrome` slot. Detail: `display/workbench-ops-queue.md` → Sticky docking, Scoped exception |
| Workbench KPI Band 2 snap-collapse | `WorkbenchKpiBand` + `WorkbenchKpiCollapseToggle` + `WORKBENCH_KPI_SURFACE` (`workbench-kpi-collapse.tsx`); triage `kpiToggle` hosts the toggle in the **right view-toggle zone** (immediately left of History `trailing` inspector when present — never left of search, never over the select gutter); prefs `staff_preferences.kpiCollapsed[surface]` via `useWorkbenchKpiCollapsed`. Unbox Band 2 body = `UnboxKpiCanvas` compact Usage strip (`text-role-micro` quiet `?urange=` · `KpiChartCard density="compact"` spark-only; `?ukpi=` filters the table; no LedgerGrid / viz switch / gauge). Data: `GET /api/receiving/unbox-kpi`. **Instant binary snap** (`hidden` ↔ visible — never `collapseHeight` / opacity / layout tween that pushes the sheet). Not continuous resize. Golden: Unbox History. Detail: `display/workbench-ops-queue.md` → Sticky docking, Scoped exception · **Ops chrome binary show/hide** below |
| Procedure step ACTION (the button that advances a step) | The bottom dock's LEADING zone — `UNBOX_STEP_DOCK_CONTROLS` (`line-edit/steps/dock/`) rendered by `UnboxStepDock`, keyed on the active step. **A step CARD never carries an action button**: the body renders the step's CONTENT (photos taken, label face, line list, grade on record) and nothing clickable. A step with no action declares that in `UNBOX_STEPS_WITHOUT_DOCK_ACTION` *with a reason* — neither map, or both, fails CI. The TRAILING terminal stays carton-scoped (Print · Receive) and never re-labels. Per-step table: [`display/unbox-station.md`](display/unbox-station.md). Law: `display/station-workbench.md` → *The dock's LEADING zone is the step's ACTION surface*. |
| Scan-station cockpit KNOW (`railLeaf`) | `UNBOX_STEP_RAIL_LEAF` (`line-edit/steps/rail/`) — Displays leaf auto-shown for the active capture step; either-or twin `UNBOX_STEPS_WITHOUT_RAIL_LEAF`. Driven from the same `useUnboxProcedureSteps` as the dock ACTION (never a second store). Contract: [`display/scan-cockpit.md`](display/scan-cockpit.md). |
| Sibling station port from Unbox | Identify twins → delete → compose Unbox shells + station-local maps. Playbook: [`display/station-port-from-unbox.md`](display/station-port-from-unbox.md). Never port N stations in one pass; never raise a baseline. |
| Station column shell / wash | `@/components/station/workbench` (`StationWorkbench`, `StationPanelRoot` + `StationAmbientWash`, `STATION_WORKBENCH_*`) — **Station region** shell, not Workbench contract. Rule: `display/station-workbench.md` |
| Procedure step vocabulary (`done`/`active`/`pending`/`skipped`) | `@/design-system/components/procedure` `ProcedureStepRow` — `skipped` is a waiver, never a check. Law: `display/instrument-panel.md` |
| Procedure views (centre deck · edge checklist) | `@/design-system/components/procedure` — **`ProcedureDeck`** (centre, primary) + `ProcedureChecklist` (right-edge reference). ONE derivation (`useUnboxProcedureSteps` on Unbox). Geometry: **flat 40px faces**; selection = outline ring only; evidence mounts under the list. No peek/covered/layout motion. Checklist is secondary navigation; the deck is the work. Law: **Scan-station procedure focus deck** below |
| Scan progress chrome (procedure completion) | `ScanStationProgressControl` + `ScanStationProgressRing` — bare 16px, no numeral; Displays column top-band **`rightSlot`** (Unbox: `StationDisplaysPushStack`); closed Displays opens via `←|`; **never `GoalRing`**, which is daily-goal pace in GlobalHeader |
| Right-rail inspector body facts | `OrderFactList` / `OrderFactRow` (`@/components/order-record`) — label + value, mono on retypable ids. Law: `display/right-rail-inspector.md` → Body |
| Order surface by job | Durable edit/notes = desk tabbed `ShippedDetailsPanel` @ `/shipping/orders?openOrderId=` · Search feedback = `SearchOrderFeedback` @ `/search?sel=order:…` (`searchOrderFeedbackHref` / `searchHitHref('ORDER')`) · Non-desk right-rail open = `CompactOrderPeek`. `/o/[id]` is retired (permanent redirect → search feedback). Never route search feedback through `ShippedDetailsPanel`. |
| Search order feedback identity | Disposition + facts paint durable IDs via `OrderIdChip` / `PlatformMark` / `TrackingChip` / `SerialChip` / `SkuScanRefChip` (+ `useOrderChannelLabel` → `sourcePlatformMetaFromLabel` / `usePlatformMeta`). Never `Order #…` prose, yellow platform status pills, or bare `OrderFactRow mono` for marketplace ids. Section chrome = `FlushSection`. See **Search order feedback identity** below |
| Surface / box shell | `Panel` (generic) · `SectionCard` (monitor) · `CardShell` (rows) — never hand-roll |
| Honest absence (missing fact) | `GridCellDash` / ledger `fallback` default quiet `—` (`text-text-faint`) — never blank, never `"N/A"`, never loud `--------`, never centered `--` on LedgerGrid tracks; qty mutes when received is `0` |
| Spatial predictability (locked triage boxes) | Fixed pipeline / fact clusters stay mounted; empty = `PipelineStageRow` emptyFallback or honest `—` **in bounds** — never progressive-hide rows that shift muscle-memory layout. Golden: `OrderPipelineSection` · `ReceivingCartonPipeline` · search `OutboundMilestones`. See **Spatial predictability** below |
| Photo gallery viewer | `@/components/shipped/photo-gallery` — `usePhotoGallery` + `PhotoViewerPortal` → `PhotoViewerModal` (composed launcher: `PhotoGallery` / `launcherLayout`). Never a page-local lightbox or `createPortal`+`AnimatePresence` fork around the modal. Read surfaces pass `{ url }` only (omit numeric `id` / upload targets so delete/upload stay off). |
| **Media Library display** (`/ops/photos`) | **RAIL-LESS** (Pattern E) via `CONTEXT_PANEL_ROUTE_KEYS` — never by widening `isRaillessOrderFeedSurface` (that predicate is the To-ship ORDER feed). Three bands in one `WORKBENCH_SHEET_CHROME` host: **1** tabs + media-type cube (`PhotoLibraryScopeBand` — the ONE writer of `sourceScope` / `imageType`) · **2** search (`PhotoLibraryWorkspaceHeader`; row-narrowing facets ride `trailingSuffix`) · **3** path strip (`PhotoLibraryHeader`). Band 2 = search / Band 3 = breadcrumb is a **documented inversion** of Band 2 = KPI / Band 3 = find (no KPI band exists; search is the approved entry path; a path strip is a context readout at KPI altitude). Tile click = viewer; select 1 = inspector (`detail:photo`); **select ≥2 = the batch RAIL** (`PhotoBatchInspectorPanel` / `detail:photo-batch`, push) — armed verb rows over `useArmedCursorList` + `armed-cursor-face`, with **Delete as the flush trailing child of `InspectorActionFloor`, never a verb row** (2026-08-10). The chrome toolbar that swapped itself over Bands 1–3 is **deleted** — the bands stay mounted under selection. **The surface runs no motion** (no motion barrel, no `layoutId` under `src/components/photos/`); the armed face composes the shared tokens **without** `ARMED_CURSOR_MARKER_PULSE_CLASS` — a recorded divergence from the Unbox golden. Stream stays a media stream — **not** `LedgerGrid` (History dogfoods first). Recipe: [`display/media-library.md`](display/media-library.md). Spec: `tests/e2e/photos-railless-frame.spec.ts` |
| Receiving line contents (reference) | `ReceivingLineContentsRow` + `receivingLineContentsTitle` (`src/components/receiving/contents/`) · image SQL `RECEIVING_LINE_IMAGE_URL_SQL`. Zoho thumb · title pinned top · details pinned bottom · host gallery. Hosts: `UnboxItemsPanel` · carton-read `ContentsList`. **Never `PoLineRow` for read** (D6 — work accordion stays Triage/Testing). |
| Carton read surface | `/carton/[id]` → `CartonInspector` → `inspection/CartonInspectionPage` + `carton-inspector-model.ts`. Read model + atoms only (D6 / `pattern-evolution.md`). Contents rows compose `ReceivingLineContentsRow` (Zoho thumb). Photos = DispositionBar → `CartonPhotoTriage` + shared viewer. Work escape = one quiet `openInUnboxHref` control — never `"Open in Unbox"` spam on findings/header. IA: disposition header; col1 contents·record; col2 Panel+ReceivingCartonPipeline·findings·activity·history. Linked PO suppresses Unmatched. Not Station column shell — recipe: `display/carton-read.md`. |
| Order note (annotation on an order) | `order_notes` **only**, via `POST /api/orders/[id]/notes` (`src/lib/orders/order-notes.ts` + `useOrderNotes` / `OrderNotesTrail`). The scalar `orders.notes` is **read-only legacy** — displayed, searched, counted, never written by the product. |
| Receiving note vs label text (**per line item**) | `receiving_line.notes` = operator item note · `receiving_line.label_note` = durable printed face center · `receiving_line.zoho_notes` = Zoho line description · `receiving.zoho_notes` / `support_notes` = PO-header / carton. **Unbox overview:** dock draft live-drives the carton sticker center (preview + Print · Receive); dock save still patches `notes` only; carton print stamps `label_note`. Label editor still owns durable `label_note` edits. |
| Received / Qty surfaces (**Unboxed ≠ Received**) | Rail Received meter: `inventoryReceivedDisplayQty` / `RAIL_QTY` (`rail/quantity.tsx`). Qty tips: `floorQtyFractionTip` (verb **counted**, never "received"). Status dots: `getStatusDotBg` — emerald from stage only, not qty-complete. Triage read-only qty: `ScannedBadge` (not `ProgressBadge`).— see **Unboxed ≠ Received** below |
| Label kind → grain (what the sticker goes on) | `src/lib/print/workspace-label-kinds.ts` — `KIND_META.grain` + `workspaceLabelGrainLabel(kind)` (`PO / carton` · `Per item` · `Container`), carried into every picker by `labelOptionsForSelect`. Never hand-type a kind's name or grain at a call site |
| Dialog / AlertDialog | `@/design-system/components/Dialog` · `AlertDialog` · `requestConfirm` / `ConfirmDialogHost` — never hand-roll `fixed inset-0` scrims for new modals; station floor confirms stay on `ConfirmSheet` |
| Switch / Checkbox | `@/design-system/primitives` `Switch` / `Checkbox` |
| Dropdown / Context menu | `@/design-system/primitives` `DropdownMenu` / `ContextMenu` |
| App chrome / canvas / wash / work-canvas depth | `src/design-system/tokens/app-surface.ts` + `appContentShellClass` (`appWorkCanvasEdgeClass` owns the depth-edge hairline on every desktop page). Receiving rail+workspace share `CONTEXT_PANEL_HOST` ground (`context-panel-column.ts`); Unbox/Triage under that host use `appWorkCanvasLayoutClass` (no full-bleed card sibling) |
| Global detail-stack overlay shell | `@/design-system/shells/detail-stack` (`DETAIL_STACK_LAYOUT`, `DETAIL_STACK_RESIZE`, `DETAIL_STACK_COLLAPSE`, `detailStackAsideClassName`, `detailStackAsideStyle(widthPx?)`, …) |
| Left context-sidebar wrapper | `ContextPanelLayout` + `context-panel-column.ts` (`CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE`) — every route rail beside the workspace (dashboard included). **Display collapse:** `TechRailSearchBar` `variant="rail"` auto-seats `RailFilterCollapseButton` under `ContextPanelCollapseProvider` (age column / bottom-right); hosts may override via explicit `trailingAction`. Secondary gesture: drag-past-min on the trailing resize edge (sash is drag-only — no sash-top collapse chevron; trailing **inset** hairline paint thickens the panel `border-r` in place). **Parked strip:** whole-strip click / Enter / Space restores — **no foot expand button** (deleted 2026-08-19: a second door onto the one action the whole strip already performs, in the corner where a 32px column can least afford it; the strip carries its host's `testId`). Top-of-strip **mini scan cell** (`CollapseStripScanCell` via `usePublishCollapseScan` from primary `StationScanBar` — `h-10` Plus idle with staff-themed hover; focused = same bottom-up `ScanBandGlowHost` glow as the open band + visible caret, no placeholder); mid-strip MRU pins default on every `SidebarRecentRailBase` (`mruPinCount` / shell `usePublishCollapsePins` + selected RailRow ring; pin click selects, double-click expands; `+N` overflow expands when more than five; pin hover always opens a `RailPopover` — feed `renderPopover` when present, else shared `RailPeekCard` (copyable `CopyChip` facts via `getCollapsePinFacts` · Open →); Dashboard recents publishes separately). MasterNav / `SidebarNavColumn` is a separate push spine |
| Right-edge slot occupancy + modality | `RightRailHost` + `src/lib/right-rail/store.ts` (`RIGHT_RAIL_PRIORITY`: detail `100` > assistant `10`) — THE right details-panel wrapper; **AI and record/ticket details share one slot**. See **Right-rail modality** · **Frame column budget** below |
| Right-rail record-inspector header | `PaneHeader` + blocks **or** `DeskRailChromeRow` — **chrome → context → identity** (Row 1 close·↑↓ only; Row 2 contextual icons; Row 3 dense key); **never** `SidebarIntakeFormShell` / `stationMoreDetailsPaneHostClass` inside a Desk card / `rightSlot` close / `variant="card"` ActionBar pill / chrome props on the contextual ActionBar. Recipe: [`display/right-rail-inspector.md`](display/right-rail-inspector.md). |
| Sidebar intake / create form chrome | `SidebarIntakeFormShell` — **create · import · prefs** overlays only (`detail:new-order`, Import eBay, FBA create, grid column display). Not a record-inspector header |
| Nav search (type-to-jump over the nav registry) | `src/lib/nav/nav-search.ts` (ranked matcher) + `nav-destinations.ts` (pages **and** modes flattened) — the ⌘K palette and the MasterNav spine both compose it. NOT the cross-entity engine — see **Nav search** below |
| ⌘K / Ctrl+K ownership | `src/components/CommandBar.tsx` — the ONLY binder. No other surface may bind it (a suppressor inside a focus trap is the one exception) or advertise it. |
| Keyboard ownership (Escape / ambient hotkeys) | `src/lib/overlay-stack/store.ts` (+ `useRegisterOverlay` / `useAnyOverlayOpen`) — see **Escape ownership** below |
| Station Displays toggle (⌘/Ctrl+]) | `src/components/station/displays/displays-toggle-hotkey.ts` + `StationDisplaysEdgeToggle` — same action as `←|` / `→|`; stands down for open overlays; desk inspector keeps ⌘\ + bare `]`. |
| Station entity-context header | `@/components/station/entity-context` (`CartonContextCard` + `StationContextBar`) — Unbox / Triage / Testing / Shipping active-order |
| Workbench chrome scoped search | `@/components/sidebar/tech/TechRailSearchBar` — always-open Search glyph **inside** the field + **hover-reveal paste** (leftmost trailing control). `variant="rail"` for station rail footers; `variant="chrome"` for the **top-pinned MasterNav spine find** (2026-08-19) and for `variant="chrome"` for `WorkbenchChromeHeader` / Unbox triage / **Media Library Band 2** (flush sunken plane — no rounded bubble; edge-to-edge with the triage row). **Trailing grammar:** paste (hover) → in-field filters via `trailingSuffix` → age-column collapse via auto `RailFilterCollapseButton` when under `ContextPanelCollapseProvider` (or explicit `trailingAction` for LedgerDrill / Incoming list-paste). Never seat a field-density filter in `trailingPrefix` (that slot is for non-filter CTAs that must lead paste). **Recent-rail facet SoT:** every recent dock mounts a field-density filter in `trailingSuffix` — **except Receiving** (Unbox · Arrival · Local Pickup), which has **no footer find field at all** (ruled 2026-08-19): Preview stance turns the scan bar itself into the rail's find field — typing filters the recents live (submit is already a no-op in Preview) — and the facet popover rides the bar's right rail via the scan-band `filterSlot`, so the filter icon is present exactly when the field filters. A footer bar there was a second always-mounted door onto the same query, one rail row tall, on the column whose whole job is showing recent cartons. Every OTHER station keeps its footer. `ReceivingRecentRailFilters` (Priority·Type·Platform) on Testing (and on Receiving's scan bar); `StationHistoryRailFilters` (Platform) on Pack/Scan-out/Outbound Labels; `LabelPrintRailFilters` on Products Labels Printed; `SupportRecentRailFilters` on Support Tickets. Composes `SearchBar` → `SearchField`. The icon-first `ToolbarSearchToggle` was deleted 2026-08-03. **Entry-path bare fields:** `/search` (centered `GlobalFindCombobox` stage in `SearchFindStage`; global header launcher stays mounted and defers focus when no `?sel=`). Rationale in `ui-design-system.md` → Scoped search chrome. |
| Support reply drafting | ONE waist — `useSupportSuggestion` → `POST /api/support/suggest` → `lib/support/suggest-reply.ts`. The draft bridges into the composer via `ThreadComposerBridge.setDraft` and **never sends**; it never clobbers operator text (the overwrite rule is `seedComposerDraft` in `src/lib/threads/composer-draft.ts` — explicit confirm, one home, two composers). Tenant framing resolves from org settings (`buildSupportSystemPrompt`), never a hardcoded vendor brand. The orchestration is PURE in `suggest-reply-core.ts` (the `analyze-core.ts` split) so the lane gating and the confidence rules unit-test with zero network; `suggest-reply.ts` is the server binding. `sources` are TYPED (`thread` · `ocr` · `catalog` · `rag`) — a bare string could not say whether a draft stood on a document or on a matched row. Surface: the rail's `Assist` display — `display/workbench-service.md` |
| Image understanding (support vision loop) | ONE provider resolution — `resolvePhotoAnalyzeProvider` (org → env → `local-vision`). Deterministic OCR / labels / damage run **local-first** and persist to `photo_analysis` through `analyzePhoto`, the same writer the upload job uses — never a second persistence path, and never a re-run of a photo that already has a row. Whether a customer's image may reach a cloud model is a **safety classification with no default**: `resolveSupportVisionLane` (org `settings.support.visionLane` → `SUPPORT_VISION_LANE` → `local-only`), and `cloud-multimodal` is a REQUEST — it falls back to `local-only` when no gateway is configured, because reporting a lane that did not run tells the operator a photo left the building when it did not. **A model is never handed an app route**: `/api/photos/[id]/content` 302s behind the session gate, so `/api/support/suggest` resolves a signed storage URL itself (`resolvePhotoAccessUrl`) and the client only ever holds photo IDs |
| Decode → our-data cross-reference | `collectPhotoEvidence` (`src/lib/support/photo-evidence.ts`) — OCR tokens pipe through `routeScan` (the ONE decoder, which NORMALIZES a printed URL to its handle) then `hybridSearch` (the ONE search engine). **Never a second matching engine, and never a synthesized hit**: a token that decoded but matched no row is reported as unmatched, because a fabricated title on a customer-facing draft is worse than an honest absence. The assistant reasons over `SearchHit` data, not raw image text — that is the difference between recognising a unit and describing a photo |
| Support requester profile ("who is asking") | `GET /api/support/requester` → `resolveRequesterProfile` (pure core + `requester-profile-deps.ts`). Name/email from the ticket's `via.source.from`, falling back to the helpdesk user roster; our `customers` row by email; order count from `orders.customer_id`; prior-ticket count from the helpdesk search. Every fact degrades to `null` INDEPENDENTLY and renders `—` — **there is no LTV and no return rate, and a fabricated `0` is worse than a missing number.** Linkage comes from the `SupportContextBundle` the thread already fetches, never a second query |
| Omnichannel / chat-style composer dock | `@/design-system/primitives` `OmnichannelComposerDock` (was `StationComposerDock` until 2026-08-01 — a birthplace name on a shared shell, corrected when Support became Workbench branch `service-workspace`; the dock is not Station-contract property) — **two jobs, two placements:** (1) Unbox (`UnboxDockNotesEntry` dogfood) / Testing **carton item notes** (`receiving_line.notes` via `WorkspaceNotesCard`) float as the middle dock with carton terminal trailing; (2) **ticket replies** use the same shell inline under the thread (`SupportChatComposer`) on station Ticket Displays (Unbox + Testing — never swap the carton-notes dock) **or** as `variant="station-dock"` via `SupportTicketComposerDock` when the ticket *is* the work entity (`SupportTicketFocus`). Same elevated white shell + auto-grow height; ticket footer = VisibilityToggle · Library (`+`) · Attach (paperclip) · Send (or `trailingAction` as `<StationTerminalDock embedded>` — Send suppressed, Enter still commits). Placement SoT for floating docks: `slicedActionDockWrapperClass`. Never hand-roll a second sticky/amber ticket composer beside this shell, and never replace carton notes with ticket reply on a scan station. |
| **Ticket vs Timeline (station Displays)** | **Ticket** = helpdesk messages only (`SupportTicketDetail` `mergeFloorTimeline={false}` → `MergedRecordStream` without `events`). **Timeline** = warehouse/carrier spine on the peer Displays tab (`WorkspaceTimelineTab` / `EventTimeline`). Same `TimelineItem` waist; never interleave floor scans into station Ticket. Support service workspace may opt into `mergeFloorTimeline` until a Floor toggle ships. Law: [`display/workbench-service.md`](display/workbench-service.md) · [`display/reference-timeline.md`](display/reference-timeline.md). |
| Resizable document PDF slide-over | `@/design-system/components/DocumentSlideOver` (+ `DocumentPreviewFrame`, `useHorizontalEdgeResize`) — Labels Print, Testing manuals |
| Horizontal pane edge resize grip | `@/design-system/components/HorizontalEdgeResizeHandle` (+ `useHorizontalEdgeResize`) — context rails (`ContextPanelLayout`) + non-modal detail inspectors (`RightRailHost`); wide hit sash + hover-reveal **4px** (`w-1`) full-height hairline **on the panel seam** (`placement="inset"`); never hand-roll a second grip for the same job. **RightRailHost / Displays / left context:** paint is the panel's own edge seam (display hairline), not an outset overhang into the work surface. Drag-only — never a sash-top collapse chevron. Left context parks via filter trailing + drag-past-min; RightRailHost / Displays park via `→|` + Band 3. |
| Recent-rail scrollport / more-below lip | `@/components/sidebar/rail-shell/SidebarRailScrollport` (+ `useMoreBelow` / `SCROLL_MORE_BELOW_CLASS` in `tokens/scroll-edge.ts`) — station + SidebarShell-hosted recent feeds **and** LedgerDrill parent maps; never hand-roll a second bottom fade. `SidebarRailShell` is content-sized and does **not** own vertical scroll |
| LedgerGrid h-scroll edge cues | `applyGridOverflowXClasses` / `overflowXFromMetrics` in `@/design-system/components/grid/grid-overflow-x` — toggles `cf-grid-overflow-start` / `-end` (+ `cf-grid-scrolled` for the frozen pane) from scroll + ResizeObserver; CSS inset shadows in `globals.css`. Never hand-roll a second pair. |
| LedgerGrid sticky bottom X scrollbar | `GridStickyXScrollbar` + `useSyncedHorizontalScrollbar` (self-scroll flex sibling; split-x `sticky bottom-0`) — body keeps `no-scrollbar`; dense/`DataTable` use `TableStickyXScroll`. Never hide triage X behind `no-scrollbar` alone. |
| Buttons | `src/design-system/primitives` `Button` |
| Micro row actions (single-row icon) | `IconButton` `size="md"` (`h-8 w-8` `rounded-none`) on the far-right of a full-bleed hairline row — never a primary blue text `Button` in a repeating list |
| Macro panel / Displays terminal CTA | `FlushTerminalFooter` (`bleed` \| `cluster` \| `spread`) — in-flow column floor, `p-0` hairline, flush `Button`; `spread` = equal fill-width peer hit columns (`FLUSH_TERMINAL_SPREAD_PEER_CLASS` / `IconButton size="fill"`) — never floating `w-11` islands; not `StickyActionBar` / station dock / `ConfirmDock` |
| Workbench inspector action floor | `InspectorActionFloor` + shared peers `FloorIconButton` / `FloorOverflowButton` + `FLOOR_DELETE_PEER_CLASS` (`src/components/right-rail/`) — **icons-first ONE row** (`⋯` overflow · icon verbs · flush trailing `InspectorFlushDelete` child; `IconActionFloor` spread) + optional `above`, for desk triage `RightRailHost` peeks (Incoming · Orders Order-tab · Unfound · Repair · Bin · SKU · History); **never a labelled `actions` cluster** (legacy path deleted). Intake overlays (Import CSV / Add inbound) compose `FlushTerminalFooter` directly, not this floor. Never Station Displays / host chrome on `RightRailHost`. |
| Station Displays carton Macro verbs | `StationDisplaysHeaderActions` + `CartonDisplaysActionFloor` (`src/components/station/displays/`) — the column's **top-right** band cluster (ruled 2026-08-18, replacing the bottom `h-11` floor): `Refresh? · Print? · Edit · ⋮`, `⋮` **always last** so it anchors one corner on every station. Delete + Resolve live **inside** `⋮` (`tone="danger"`, plus the existing undo toast) — never an exposed peer. `IconButton size="sm"` in `STATION_DISPLAYS_HEADER_ACTION_CELL`. The **filter is row 2** (`subHeader`) and the column has **no bottom band** (ruled 2026-08-19). No progressive-collapse machinery — the band cannot overflow at `STATION_DISPLAYS_MIN_WIDTH_PX`. Unbox golden via `UnboxDisplaysActionFloor`. Still never desk `InspectorActionFloor` on Displays. |
| Product icon glyphs | `@/components/Icons` (`src/components/icons/*`) — never duplicate nav primitives |
| Station page + L2 child-page nav icons | `src/lib/nav/station-nav-icons.ts` + semantic aliases `src/components/icons/stations.tsx` — glyphs unique via `STATION_GLYPH_KEYS`, and **bare**: stroke weight is the drawing surface's, via the one `NAV_ICON_STROKE_CLASS` (`icons/nav-weight.tsx`), never baked into an icon export |
| **Navigation header height** | `TOP_CHROME_ROW_FACE` (`h-10 shrink-0` / 40px; `TOP_CHROME_ROW_PX`) in `src/components/layout/header-shell.ts` — GlobalHeader + MasterNav spine top band (`SpineTopPins`). `TOP_CHROME_BAND_FACE` = atom + `border-b border-border-soft` so both bottom hairlines meet at one Y. Assistant dock offset uses `TOP_CHROME_ROW_PX`. **Never** alias this to the denser station row below. |
| **Station column footer seam** (scan-station floor Y) | `STATION_COLUMN_FOOTER_SEAM_CLASS` (`border-t border-border-hairline`) + `STATION_COLUMN_FOOTER_BAND_FACE` (`h-8` + seam) in `src/components/layout/header-shell.ts` — Context filter / recent receiving · utility `←|` · Displays `→|` · Unbox dock Band 2 · spine sign-in. Twin of `TOP_CHROME_BAND_FACE` for the floor. Never fork `border-t border-border` or `border-border-soft` on these |
| **Primary chrome row height** (ops bands under GlobalHeader) | `PRIMARY_CHROME_ROW_FACE` (`h-7 shrink-0` / 28px) in `src/components/layout/header-shell.ts` — MasterNav L1 · scan bar · workbench tab/triage bands · grid column headers · PaneHeader. Secondary eyebrow stays `STATION_SECONDARY_BAND_FACE` (`h-6`). |
| **Station carton / Displays top row** | `STATION_CHROME_ROW_FACE` (`h-7 max-h-7 min-h-0 shrink-0` / 28px) in `src/components/station/entity-context/station-identity-chrome.ts` — carton identity row 1, Displays push top, and desk inspector chrome share this box so their bottom hairline is one Y. Children **fill** that row (`h-full` / `self-stretch` / `aspect-square`). Same pixel height as `PRIMARY_CHROME_ROW_FACE`; the extra `max-h-7 min-h-0` is what stops the row from growing. |
| Top-band chrome icon **display** (glyph face) | `src/components/layout/header-shell.ts` — `TOP_CHROME_ICON_FACE` (16px box + the one nav stroke) for **every** glyph on the 40px beam: GlobalHeader toggle / Pins / Recents / page face / search / goal / inbox / assistant **and** the spine's own `SpineTopPins`. `TOP_CHROME_ICON_GLYPH` is the size-only atom (shared off-beam by condition pills / inline notices). The old "native stroke only, never layer `navIconStrokeClass`" rule is retired (2026-08-19) — it made the two halves of one beam differ in weight at an identical 16px. Glyph *identity* stays Icons / station-nav |
| Page switcher + Recents (a page's children + cross-page MRU) | `HeaderPageSwitcher` + `HeaderRecentsSwitcher` in `GlobalHeader` — data = `SIDEBAR_PAGE_NAV` (+ `APP_SIDEBAR_NAV` fallback) / `useSidebarChildNav` / `useRecentPages`. **The page face is icon + display name on EVERY page** — modeful opens a child menu, modeless renders the same face as a static chip (one `PAGE_FACE_CLASS`); station peers come from `stationSubgroupMembers`, never legacy `receiving.children`. Never a sidebar pill-band twin; no MRU chips in the spine org band. See **GlobalHeader zones** below. |
| Header chrome menu (Page · Recents · Pins panels) | `HeaderChromeMenu` + `HeaderChromeMenuItem` in `src/components/layout/header-chrome-menu.tsx` — rounded card, `min-w-[11rem]`, icon + label rows, active = sunken + trailing `Check`. Every header dropdown composes it; never re-declare the panel/row classes in a switcher. See **GlobalHeader zones** below. |
| Header pin stations (Quick Access pins) | `HeaderPinsSwitcher` in `GlobalHeader` nav cluster (after toggle, before Recents · page; one icon → sortable menu rows + pin-this-page; **no divider or padded wrapper**; list order **is** `⌘/Ctrl+1–9` via `pin-hotkeys.ts`, capped by `MAX_PIN_HOTKEY_SLOTS`. The icon strip + `MAX_HEADER_PIN_ICONS` overflow are deleted — see **GlobalHeader zones** below) — data = `useQuickAccess` / `cf.quickAccess` cache; durable SoT = `staff_preferences.prefs.quickAccess` via `<QuickAccessSync/>`. Never remount a pin list in a Quick Access / staff menu. The desktop `GlobalHeaderActions` rail is **search · pace-and-next · inbox · AI (far-right)** (see **GlobalHeader zones**); Sparkles opens the assistant right-rail occupant at the edge it owns; no staff avatar on desktop. **A persistent top-right icon is earned by FREQUENCY, not by existence** — clipboard history, the phone sign-in QR and the kiosk preview moved to the spine account overflow 2026-08-01 (they were reached once a shift, and six unranked peers read as a toolbar). A fourth icon displaces one of the three or names a new kind. Mobile keeps its own clipboard + phone-QR cluster: it has no spine, so it has no overflow to move them into. |
| Per-staff queue depths ("where is my work") | `InboxQueueLinks` at the top of `ActivityInboxPopover` — `MyDayFeed.queueCards` (Orders · Arrival · Packing · Testing · FBA prep · Support), permission-filtered, zero-work queues already dropped. **Not the MasterNav spine** (ruled 2026-08-02, reversing the chrome-altitude brief's D8; **re-argued 2026-08-03 — see below**) and **not the header badge** — that counts dismissible `ActivityInboxItem`s, and a queue depth is not a thing you dismiss. Shares `useMyDayFeed`'s `['my-day']` key and mounts only when the popover opens, so it costs nothing at rest. **The ruling now rests on ONE leg, and it is the load-bearing one:** `nav-search.ts` re-ranks the whole registry on every keystroke, and that is safe *only* because the registry does no I/O — a live depth on a nav row makes navigation depend on a query. Two of the original three legs are gone and saying so is the point: "a page badge is invisible until you drill" died with the drill (2026-08-02), and "the spine's trailing count already means structural cardinality" died when that count was **deleted** (2026-08-03 — a right-aligned numeral read as a notification, which is exactly what a queue depth would legitimately be). **So the spine is now MORE hospitable to a depth badge than when this was first ruled, not less** — the slot is empty and the shape is free. Do not read that as an opening: the empty slot is the *reward* for deleting a badge that was pulling attention it could not repay, and re-filling it with live data would buy back the I/O cost as well. A future ruling may overturn this; it must overturn it on the I/O argument, not by noticing the vacancy. |
| Identity mark (org + staff circle) | `@/components/identity` — `IdentityMark` (circle · ring · image-or-initials · `xs`…`2xl`) and `StaffAvatar` (photo → colour+initials, resolved by staff id). **Never hand-roll a `rounded-full` + initials span**, and never fork a local `initials` — the SoT is `staffInitials` (`StaffBadge.tsx`). See **Staff profile photo** below |
| Org / workspace switch | **DELETED from the spine 2026-08-03** — single-org is the norm for small business, so a permanent 40px row naming it restated something that never changes. Identity now reads from the `StaffAccountFooter` ⋯ menu header (`organizationName`); switching lives in Settings → Organization (`WorkspaceSwitcher`). The 40px band STAYS but is empty — the spine is a flex sibling of the header, so that face is what holds both bottom hairlines on one Y. Historic: `OrgWorkspaceControl` in the MasterNav 40px top band — current `organizationName` on a **circle `IdentityMark`** (same `sm` density as the staff footer) + an **always-mounted dropdown trigger**, single-org included. Switch path = `useSwitchOrg` / `requestSwitchOrg`. **No “Current” label in the menu** — the open chevron is enough. **Menu is a child of the trigger** — `AnchoredLayer` `bottom-stretch` + dense `SIDEBAR_SPINE_MENU_*` chrome. |
| Clipboard history (chord + panel) | `ClipboardHistoryHost` (mounted by `ResponsiveLayout`) owns **⌘⇧V** and the single desktop mount of `ClipboardHistoryPopover`; the spine ⋯ row is a trigger that calls `openClipboardHistory`. See **Clipboard history placement** below. |
| Throw a task (chord + panel) | `ThrowTaskHost` (mounted by `ResponsiveLayout`) owns **⌘⇧U** and the single desktop mount of `ThrowTaskPanel`; the spine ⋯ row is a trigger that calls `openThrowTask`. Same placement ruling as clipboard history (D5) — a chord + a ⋯ row, **never a sixth `GlobalHeaderActions` icon** (that cluster is capped at five, and a persistent icon is earned by frequency). Scan/paste resolves through `POST /api/scan/resolve` — client `routeScan` has **no tracking vocabulary**, so a local parse silently fails on the commonest input — and the answer is read back by `resolveThrowTargets` (`src/lib/tasks/throw-targets.ts`), the one place that knows `/m/rs/{id}` is a repair id and not a carton. |
| Staff account (spine footer) | `StaffAccountFooter` below Settings/Admin — `StaffAvatarEditor` (click mark → colour + photo, self-service, no Settings trip) · name · role · more · sign-out. **The ⋯ menu IS the desktop account overflow**: phone history · **throw a task** · clipboard history · open-on-your-phone QR · kiosk shell preview · report an issue · Quick Access settings. Mobile keeps a compact account avatar in `GlobalHeaderActions`. When the spine is collapsed (0 width), org + staff are unreachable — same as Admin/Settings; open via header toggle / edge peek. **⋯ menu is a child of the footer row** — `AnchoredLayer` `top-stretch` + dense `SIDEBAR_SPINE_MENU_*` chrome; **org name in the menu header is load-bearing** (`SIDEBAR_SPINE_MENU_ORG_CLASS`, never eyebrow). |
| Staff profile photo | `staff.avatar_photo_id` → the photos platform (`STAFF` entity type). Read it with `<StaffAvatar>`, never a per-surface photo join — see **Staff profile photo** below |
| Scan Stations (spine section) | `STATION_GROUPS` (+ `icon`) + required `stationGroup: 'floor'` on `kind: 'station'` rows in `sidebar-navigation.ts`; membership via `SPINE_SECTIONS` / `spineSectionIdForPage`. **`floor` is the only station group** — the `desk` twin died 2026-08-01 (see the domain row below). Members, in pipeline order: Receiving subgroup (Arrival / Unbox / Local Pickup / Repair Service) + Testing / Packing / Scan out. Subgroup header from `STATION_SUBGROUPS`. **Never move a scan bench into a domain group** — an operator at the dock answers to their input model, not to the domain of the records they touch. **Top-pinned** `TechRailSearchBar` (`variant="chrome"`, `data-spine-find`) sits under the 40px band and above the Scan Stations row — find is above the list it searches, the same seat as Displays row 2 and the Unbox sheet's Band 3, so an operator never hunts for the box (moved off the footer 2026-08-19). It swaps the flat map for ranked destinations; Settings/Admin + `StaffAccountFooter` keep the. |
| Main Operations (spine section) | `MAIN_GROUPS` (+ `icon`) + required `mainGroup` on `kind: 'main'` rows. **Operations** (was `Live Ops` / `Analytics Monitor`) = Operations only (Live / TV) — it is the only `main` group. Home / Search / Media / Chat top-pinned. Law: `display/workbench-master-detail.md` (spine context). |
| Workflow Studio (footer pin, **not** a section) | `kind: 'bottom'` row above **Admin** in `APP_SIDEBAR_NAV` (footer renders in array order: **Workflow Studio · Admin · Settings**). Left `MAIN_GROUPS` / `SPINE_SECTIONS` 2026-08-02: defining the operation is a standing-back act, not one of the places browsed through in a shift. **A pinned row never draws children** (`showChildren = !pinned && …`), so `/studio/catalog` is an L2 **mode** of `studio` in `SIDEBAR_PAGE_NAV` — named by ⌘K, the spine's flat search and the GlobalHeader Mode switcher, but no longer a spine row. Footer pins wear the same neutral treatment every spine row now wears (`SPINE_NEUTRAL_ACCENT` — the per-section hue map died 2026-08-02, see the accent row below). |
| MasterNav spine type ladder | Org band `OrgWorkspaceControl` trigger = `text-role-body`; **identity menus** (org switch + staff ⋯) = dense child — names + actions `text-role-caption`, meta `text-role-micro`, marks `xs`; **a DESTINATION is `text-role-body` semibold (14px)** — L1 page rows, subgroup headers, search-result labels (the section-button and drill-title rows that also carried it are deleted, 2026-08-02); **L2 modes stay `text-role-caption` medium** (12px) so they read as the nested tier; counts = `text-role-micro`; staff footer name = `text-role-caption`. Bumped from an all-12px spine 2026-08-02: pages and modes differed only by WEIGHT — the thinnest signal in the system — and 12px sat under every peer navigator (VS Code 13 · Linear 13 · Notion 14 · Slack 15 · Vercel 14). Density-aware, so `--cf-density` + the Settings text-size control still scale it. Never bare `text-sm` on these surfaces; never sentence-case `text-role-eyebrow` for destinations. Idle page labels use default ink (icons stay muted); idle modes stay default ink. Law: `display/workbench-master-detail.md`. |
| MasterNav spine accent (**one hue per section, reinstated 2026-08-07**) | `spineAccentFor` / `SPINE_SECTION_ACCENTS` / `SPINE_NEUTRAL_ACCENT` / `REPAIR_ICON_TINT` in `src/lib/nav/spine-section-accent.ts`. **The eight section hues (deleted 2026-08-02) are back** — sky (Operations) · amber (Scan Stations) · teal (Inbound) · emerald (Products) · cyan (Inventory) · indigo (Shipping) · green (Sales) · orange (Support) · **violet (Sourcing, new)**. The 2026-08-02 deletion argued colour restated a fact the row already carried; the reversal is that this stopped being true the moment three registries assigned "repair" a colour and two of them disagreed (violet in `receiving-type-meta.ts` vs. orange in the functional-hue table / `TicketChip`) — a neutral spine could not be *right* about a colour it opted out of having. `SPINE_SECTION_ACCENTS` is a **total** `Record<SpineSectionId, …>`; a new section with no hue is a type error. **Repair is a station, not a section, and gets its OWN tint** — `REPAIR_ICON_TINT` (`text-orange-600`, matching `functional.repair`) overrides only the Repair row's icon inside Scan Stations' amber Receiving nest; its wash/fill stay the section's. **Contrast still governs shade, not symmetry:** amber/teal/green/orange/cyan sit at 700 (600 fails AA 4.5:1 on white 12px text for those five), sky/emerald/indigo/violet clear AA at 600. **The neutral ladder is unchanged for non-sections** (top pins, footer, unmapped) — `SPINE_NEUTRAL_ACCENT` still uses the 2026-08-03 two-soft-rungs treatment (hover = `bg-surface-hover`, selected/expanded = one shared `bg-surface-sunken` wash, no ring); that ruling was never about section identity and this reinstatement does not reopen it. |
| MasterNav row hover/press travel | **There is none — nothing in the spine moves** (2026-08-02). `SPINE_ICON_LIFT_CLASS` is deleted: a structural anchor in a 20-row column should not travel under the pointer, and the neutral wash that landed with the de-chroming answers hover on its own — two answers to one question is one too many. *(The 2px `motion-safe:` lift it replaced was correctly built — the framer `MotionConfig` floor cannot see a Tailwind transform, so the gate was doing real work. It was removed on placement, not on a reduced-motion defect; do not repeat that as the reason.)* The older bans stand unchanged because they are about **cost**: **never** a framer `whileHover` on a spine row (a re-render per mousemove across 20 rows for travel the compositor gives free), **never** a row-level `scale` (breaks the baseline dense siblings align to), **never** a hover/active `font-*` shift (reflows text mid-pointer). Hover is `transition-colors` and nothing else. |
| MasterNav spine flush chrome | **Column = the card** (2026-08-05) — peer of GlobalHeader (`HEADER_INSET_X` / `HeaderChromeMenu`) and scan-dock rails (`SIDEBAR_RAIL_INSET_X`). Scrollport + footer-pin hosts are `p-0`; L1 / nested / search / drill-back rows are `rounded-none` with internal `px-2` only (content pad, not an island gutter). Identity menus use `SIDEBAR_SPINE_MENU_*` with `rounded-none` + `p-0` action host — never soft `rounded-lg` chips. Depth is the `bg-surface-sunken` wash, not outer. |
| Spine row membership (the TWO registries are one declaration) | `APP_SIDEBAR_NAV` (flat rows) + `SIDEBAR_PAGE_NAV` (child-page registry) — `MasterNav`'s `toPageNav` merges them as `{ ..page, icon, label }`, so for any page owning a `SIDEBAR_PAGE_NAV` entry the child registry **wins** every membership field (`kind` · `mainGroup` · `stationGroup` · `stationSubgroup` · `domainGroup` · `href` · `requires`) and the flat row's copy is inert. A disagreement does not error and does not double-render — it silently ships one answer while the other reads as documentation. Declare membership in both **identically**. |
| A page's sub-destinations are CHILD PAGES, never "modes" | `SidebarPageNav.children: SidebarChildPage[]` + `resolveChild` (`sidebar-navigation.ts`); nav helpers are `filterPageChildren` · `applyChildTarget` · `resolveSidebarChild` · `useSidebarChildNav` · `useActiveSidebarChild` · `useRecentPages`; the GlobalHeader control is `HeaderPageSwitcher`. **Renamed 2026-08-03** — the answer was already in the code: every child carries `to: { pathname, params }` and every parent a `resolveChild(location)`, and the two round-trip, so they are distinct, deep-linkable, reload-safe URLs (`nav-destinations.ts`: *`/products?view=qc` is a place, not a setting*). The spine flatten made it structural — a child is an ordinary spine row beside its parent, so "mode" named a drill that no longer exists. **`?mode=` ON THE WIRE IS UNTOUCHED and must stay so**: `/dashboard?mode=sales`, `/support?mode=voicemail`, `/review?mode=catalog-link` are bookmarked and `getSidebarNavPageId` parses them. Never rename a param key or value, and never the `sidebar.recentModes` localStorage key. Note the seam: `?mode=` on `/dashboard` and `/support` means "which DOMAIN", which is why one word could not keep doing both jobs. `PACKING_MODE_ICONS` keeps its name — packing styles (standard/fragile/multi) are a genuine mode vocabulary, not child pages. |
| Business-domain sections (spine groups) | `DOMAIN_GROUPS` (+ `icon`) + required `domainGroup` on `kind: 'domain'` rows. **Shipping** (`fulfillment`) = Shipping (Postage · Ready · FBA · Packing Review) — page glyph is Truck. **Sales** · **Inbound** · **Support** · **Sourcing** (own section, 2026-08-03) · **Products** (`catalog` id, spine label Products — browse mode stays Reference) · **Inventory** = Inventory · Locations. Root order: **Scan Stations → Shipping → Sales → Inbound → Operations → Support → Sourcing → Products → Inventory**. |
| Print is a TASK, never a section | There is no Print Stations drill and no `kind: 'labels'` / `'documents'`. Product labels = Catalog → SKU Barcodes (`/products?view=labels`); bin/rack labels = Inventory → Locations (`/warehouse`, Bin Tags tab); carton stickers = the Unbox bench. Every former Print row was an ALIAS of a URL a canonical page already owned, which is how `/products?view=labels` came to resolve to a nav id (`print-labels`) that was not the page it opened. **Carrier postage is not a print destination** — `/shipping/labels` stays Outbound → Postage and never folds into a label workspace. |
| Dashboard boards are domain homes, not an L1 | `/dashboard` owns no spine row. `getSidebarNavPageId` reads the `?mode=` DOMAIN and hands the URL to the owning page: `inbound`/`receiving` → Inbound desk (`/incoming`, Docked via redirect), `sales`/`pickup` → Sales, everything else → Outbound › Shipping › To ship. The Inbound desk is a single leaf at `/incoming` (Pipeline \| Docked lanes). Guard: `sidebar-navigation.test.ts`. |
| Review splits by job (`/review`) | `/review` owns no spine row and no `SIDEBAR_PAGE_NAV` entry. Packing QA (bare URL) is Outbound › Shipping › **Packing Review**; `?mode=pairing` and `?mode=catalog-link` are Catalog work and highlight Catalog › Pairing / Listing match. `getSidebarNavPageId` reads `?mode=` to pick the owner. The three workspaces are untouched — merging Review pairing into Catalog pairing is a separate LedgerGrid job, deliberately out of scope. |
| Hollow sections + hollow pages are forbidden | A section with no visible page renders nothing on the root map (`SidebarNavList`), and a page that DECLARED modes but had every one permission-filtered is dropped wholesale via `isSidebarPageReachable` (composed by `MasterNav` **and** `buildCommandBarNavGroups`). A nav row can carry only one `requires`, so a page needing two gates (Sales: `dashboard.view` route + `walk_in.view` front desk) would otherwise ship a dead header. Absent, never disabled. |

If a facet has no SoT yet, **add or extend one** (pattern evolution) — do not fork a page-local map “just for this screen.”

## Dates & times (civil day vs instant)

- Source: `src/utils/date.ts`. Warehouse business zone is `WAREHOUSE_TIME_ZONE` (`America/Los_Angeles`).
- Keep **three types separate** — never collapse them into one ad-hoc `Date`:
  - **Instant** — timeline moment → ISO-8601 with `Z`/offset; store as `timestamptz`; format with `formatDateTimePST` / `formatTime12hPST` / `formatApiInstant`. Dense ledger stamps (no year): `formatMonthDayTimePST` → `Jul 13, 4:15 PM`.
  - **Civil date** — calendar day with no time → `YYYY-MM-DD` only; use `parseDateKey`, `addDaysToDateKey`, `diffDaysDateKey`, `formatDateKeyShort`, `getCurrentPSTDateKey`, `toPSTDateKey`.
  - **Zoned wall-clock** — instant + explicit zone (SQL: `timezone('America/Los_Angeles', ts)::date`).
- **Banned**:
  - `new Date(\`${dateKey}T00:00:00\`)` or any local-midnight reparse of a civil key
  - `new Date('YYYY-MM-DD')` then `getDate` / `toLocaleDateString` for warehouse labels
  - Host-local `ymd(new Date)` for warehouse “today” — use `getCurrentPSTDateKey`
  - Bare `toLocaleDateString` on ops surfaces that must match warehouse day buckets
- **Calendar widgets only:** `dateKeyToLocalDate` / `localDateToDateKey` (same local frame both ways). Do not pass those `Date`s into zoned formatters or `toISOString` for day logic.
- **Day bounds for SQL/API:** `warehouseDayUtcBounds(dateKey)` or SQL `timezone('America/Los_Angeles', ts)::date`.
- **Compact lane / activity age** (dense ops feeds): `formatLaneAgeCompact` → `4h` / `30m` /
  `3d` (tone via `getLaneAgeTone`). Used by `CompactActivityRow` / `railRelativeTime`. Never
  invent a prose relative twin (`4 hrs ago` / `formatDistanceToNow`) on those faces.
- Unit tests for civil math must pass under `TZ=UTC` (see `src/utils/date.civil.test.ts`).

## Condition grade → label

- Source: `src/lib/conditions.ts`, function `conditionLabel(code, variant)`.
- 6 variants: `pill` / `table` / `compact` / `label` / `full` / `option`.
- Never inline a grade→label map anywhere else; add a variant here instead.

## Condition grade → color (picker + inline badges)

- Source: `src/lib/condition-tone.ts` (`CONDITION_GRADE_TONE`, `conditionGradeTextClass`, `conditionPillClass`).
- UI hook: `src/hooks/useConditionGradeStyle.ts` — label + text class for inline readouts.
- Never hardcode per-grade Tailwind colors in components; import from here so pills and meta rows stay in sync.

## Z-index

- Source: `src/design-system/tokens/z-index.ts`, wired into Tailwind as named utilities
  (`z-panel`, `z-modal`, `z-panelPopover`, `z-toast`, `z-tooltip`).
- **Toasts:** `@/lib/toast` + `AppToaster` (`toast-theme.ts`) — light semantic fills; never Sonner `richColors`.
- **Never `alert` / `window.alert`** — native alerts steal keyboard-wedge focus on station benches and are a
  data-loss vector. Station pass/fail belongs on the active card (`.claude/rules/display/station.md` §6); elsewhere
  use `@/lib/toast` or a blocking DS modal/`confirm` primitive.
  (shrink-only; escape `ds-allow-alert` on the same line or line above).
- Never hardcode `z-[NNN]` or inline numeric `zIndex`. Add/adjust a named token instead.

## Motion roles + import path

Full law + the region matrix: [`display/motion-crossfade.md`](display/motion-crossfade.md).
Two invariants live here because they are single-source mappings, not recipes:

- **Intent resolves in exactly ONE place** — `motionRole` (`src/design-system/motion/roles.ts`).
  Each role names a JOB and binds it to physics the house already ships; a role never invents a
  curve. `swap.scan` **must** keep its `duration: 0` exit (the station-cadence contract) and
  `push.rail` **must** stay a tween — a spring on a push width overshoots the value every
  sibling lays out against, so the work surface rubber-bands on every open.
  **`procedure.advance` is deferred** — flat `ProcedureDeck` does not wire it; step
  advance uses `swap.scan` + `procedureFocusBody` only. Do not revive layout settle
  on the deck without amending SoT. Detail: **Scan-station procedure focus deck** below.
- **House spring / fade physics resolve in exactly ONE place** —
  `src/design-system/motion/tokens.ts` (`springSnappy`, `fadeInstant`). Named
  `framerTransition.*` springs and opacity flashes reference those objects; dense
  primitives (`DenseRowReveal`, `DenseListItem`, `ActionFlashRow`) compose them.
  Do not invent stiffness/damping/duration inline in feature code.
- **The engine is named in exactly ONE file** — `src/design-system/motion/framer.ts`
  (`motion/react`). Everything in `src/` imports `@/design-system/motion`. The barrel is what
  makes the package a dependency decision instead of a 220-file migration.
- **The preset catalog is not deprecated.** `framerPresence.*` / `framerTransition.*` are the
  physics roles resolve to, and remain legal for surfaces no role covers. Do **not** sweep
  existing call sites onto roles for symmetry — migrate a surface while you are already
  editing its motion.
-
  major + role↔preset identity).

## Unbox centre (main)

**Full walk (per-step ACTION / KNOW / gates / photo stages):**
[`display/unbox-station.md`](display/unbox-station.md).
**Sibling ports:** [`display/station-port-from-unbox.md`](display/station-port-from-unbox.md).

**Main dogfood ships dual edit loci** with a bottom Action Dock (2026-08-09):
carton context sticky → `POUnboxingSection` (`dockOwnsCapture` — PO meta is the
condition · serial **ledger**; chips **forward** via `onEditConditionInDock` /
`onEditSerialInDock` → `focusStep` + select line; **active line** mounts
`ActiveLineConditionSerial` progressive bar for mouse go-back —
Condition expands left → collapses → Serial middle → collapses left → Photos
peers (Upload · Send-to-phone trailing) expand then collapse when shots land;
`autoFocusSerial` off so the wedge stays dock-owned; dock + row share
controller writes — no third path; active line only) →
`UnboxLabelPreview` → **`UnboxPlacementSection`** (commit `stage` — scrolls into
view after print; never sticky-lock / collapse the capture centre) → dogfood
`data-unbox-dogfood-print` (always-on Print · Receive above the floor) →
`UnboxDockHost` (step CTA; Band 1 trailing null; after print Band 1 arms
`LocationScanDockControl` for the location barcode) with flush scan-progress
cell in the under-dock `progress` row (right-aligned — **not** Displays
`rightSlot`). Commit order is **print → stage → receive**. Capture order for
the item trio is **Serial → Condition → Photos** (`FOUND_CAPTURE` /
`RETURN_CAPTURE`). Displays push column is the step cockpit
(`railLeaf` via `useUnboxProcedureSteps` — [`display/scan-cockpit.md`](display/scan-cockpit.md))
plus operator browse (Pairing · Photos · …). **Classify is NOT a display**
(dropped 2026-08-19) — urgency · platform · type are `InlinePillPicker` menus on
the carton identity bar, so a leaf was a second editor for those three fields;
the `classify` step is reference-less (`UNBOX_STEPS_WITHOUT_RAIL_LEAF`). Arrival
keeps its centre `TriageClassifySection` (its Displays column is Pairing only).
Ring-only `checklist`
is procedure status / back-nav, not a centre deck twin.

### Unbox dock flush floor (geometry — NEVER regress)

**Law:** Band 1 + Band 2 are edge-to-edge flush instruments. Host = `w-full` ·
`p-0` · `gap-0` · `items-stretch`. Every button is a **full-height abutting
segment** (hairline `border-l` / `divide-x`). Content pad lives *inside* a
segment (wedge `px-3`, pager label truncate) — never host `px-*` / `gap-*` air
between siblings.

| Zone | Flush contract |
|---|---|
| Band 1 procedure waist | Compact `w-8 shrink-0` scan cell (parked-rail `CollapseStripScanCell` twin — Plus idle · `ScanBandGlowHost` + caret when focused · **no placeholder**) — **always left** on shared-entry steps (incl. photo). Serial/classify own the band alone (serial field **is** the waist). |
| Band 1 photo steps | Left compact waist + right `PhotoStepDockStrip` — three equal thirds **Link a photo \| Upload photos \| Send to phone** (`UNBOX_PHOTO_STRIP_KEYS`); never “Enter to continue” / “Enter when ready”; never icon-only camera; host `gap-0` |
| Band 1 other CTAs | `flex-1` full-height segment (Contents match · grade `barDistribute` · serial · classify) |
| Band 1 trailing | **null** (dogfood) — Print · Receive is not co-mounted with step studio |
| Dogfood print strip | `data-unbox-dogfood-print` above host — always-on embedded `SlicedActionDock` `rounded-none h-11` (Displays-independent) |
| Band 2 pager | `w-full` · sentence-case label **LEFT** · › hugs text · white `bg-surface-card` on every step |
| Band 2 progress | named `data-unbox-dock-progress-cell` (`w-8`) · **RIGHT** edge · `variant="floor"` fills it · white card face |

**Dual scan loci (Unbox golden):** left-rail `StationScanBar` = **ingest** (new Ticket · Tracking · PO); dock Band 1 left waist = **procedure** (current carton beat). **⌘.** arms ingest only; dock focus = `receiving-focus-scan` / `⌘; m → s`. Detail: [`display/unbox-station.md`](display/unbox-station.md).

**COUNTER-EXAMPLE (banned — 2026-08-09 operator screenshot):** content-sized
`SHIPPING LABEL` pager chip + floating progress spinner in dead Band-2 white;
Band-1 soft ghost CTAs / icon-only camera with `gap-*` air; photo strip alone
with no left procedure waist; wide “Enter to continue” field stealing Band 1.
Photo steps = left compact `w-8` scan cell + right three labeled thirds,
abutting.

**Return match evidence (Option B, 2026-08-06):** centre stays **lines** — do not
reshape into an order dossier. After a genuine return serial match,
`SerialMatchResult` pins testing + packing thumbs (`ReturnOutboundEvidenceStrip`
via `unitTimelinePhotosQuery`); **Full history** opens Displays → Timeline
(Units). Full genealogy stays on Timeline; inbound carton photos stay on Photos
Displays. Brief: `docs/todo/returns-unbox-centre-history-GEMINI-RESEARCH-BRIEFING.md`.

Centre `ProcedureDeck` / `UnboxProcedureDeck` stay **parked** — do not remount
without an explicit product redirect. Step **action** lives in the dock
(`UnboxStepDock` + `UNBOX_STEP_DOCK_CONTROLS`).

## Scan-station procedure focus deck (parked lane)

> **RATIFIED + Unbox Phase 1 LIVE (2026-08-09) — the DO / KNOW split
> supersedes "deck = centre hero."** RFC:
> [`docs/todo/scan-station-cockpit-do-know-split-RFC.md`](././docs/todo/scan-station-cockpit-do-know-split-RFC.md).
> The **centre + dock hold the one armed action** for the current beat (*what do
> I DO now*); the right-edge Displays column is a **step-driven cockpit**
> (*what I need to KNOW for this step* — manual · spec · position · one fact).
> The centre step-LIST (`ProcedureDeck`) is **retired on main Unbox**; the deck's
> two jobs split — *do this now* → work plane, *where am I / what I need* →
> cockpit rail. One derivation (`deriveProcedureSteps` / `resolveActiveStep` via
> `useUnboxProcedureSteps`) yields, per step, both the **action** (dock control)
> and the **`railLeaf`** (which Display the rail auto-shows). Exact Unbox table:
> [`display/unbox-station.md`](display/unbox-station.md). Contract:
> [`display/scan-cockpit.md`](display/scan-cockpit.md).
> **The word "everything" does NOT survive** — reference moves to the rail, the
> action stays centre; an everything-in-the-rail noticeboard is banned.
>
> **Sibling ports (Testing · Shipping · Pack · Arrival)** follow
> [`display/station-port-from-unbox.md`](display/station-port-from-unbox.md) —
> one station at a time, only after that station's flush dock + centre ops-flow
> match Unbox. Do not remount a centre `ProcedureDeck` as the hero on a port.

### Prominence hierarchy (derived-procedure benches — Unbox golden)

| Priority | Region | Role |
|---|---|---|
| **1 — Primary** | **Work plane** (centre ops-flow + dock Band 1 ACTION) | *What do I do right now?* One armed control for `activeKey`; Print·Receive only on settle. |
| 2 — Reference | **Cockpit rail** (`StationDisplaysPushColumn` → `railLeaf`) | *What do I need for this beat?* Step-driven leaf + position; operator-closable. |
| 3 — Context | Centre PO lines + label preview | What's in the box / what prints — ledger, not a competing CTA wall. |
| 4 — Navigation | Displays browse (Index · Photos · Ticket · …) | Operator-picked tools; cockpit auto-follow yields until the next step advance. |

**Anti-patterns:** remounting centre `ProcedureDeck` as hero; a tab strip that
splits attention with ops-flow; raised soft docks; advisory banners in the
locked middle; an everything-rail noticeboard.

### Step-advance feedback (flat foundation)

When the procedure pointer moves — a step fact satisfied, pager commit, checklist
focus, or face click — faces stay **40px** (outline moves) on any remaining deck
surface; evidence bands crossfade content only:

- **Evidence body:** `framerPresence.procedureFocusBody`
- **Travel:** `scrollIntoView({ block: 'nearest' })` on the host port
- **Retired on this surface:** in-face expand / eyebrow chrome, `motionRole.procedure.advance`,
  `runProcedureStackAdvance`, `layout="position"` pile settle, peeks, covered tuck,
  crown scrub (catalog role may remain deferred)

Law: `display/station-workbench.md` → Procedure Focus Deck.

### Modules (compose, never fork)

| Concern | SoT |
|---|---|
| DS primitive | `@/design-system/components/procedure` `ProcedureDeck` (parked on main) |
| Unbox adapter | `UnboxProcedureDeck` (parked) |
| Derivation | `useUnboxProcedureSteps` + `deriveProcedureSteps` |
| Dock ACTION | `UNBOX_STEP_DOCK_CONTROLS` |
| Cockpit KNOW | `UNBOX_STEP_RAIL_LEAF` |
| Layout geometry | `procedure-stack-layout.ts` → face/gap rem constants |
| Vocabulary | `src/lib/stations/procedure.ts` — **named flows** (`found` · `unfound` · `return`) + shared step catalog + modifiers (`isLocalPickup` · `needsClassify` · optional `captureOrderOverride`); not co-occurring boolean variants |
| Capture order override | Org setting `receiving.unboxFlowCaptureOrder` (JSON map per flow) — dogfood right-rail checklist DnD; applied inside `resolveProcedureSteps` so surfaces cannot disagree. Studio Lane E may supersede later without a second store. |
| Pointer | `procedure-pointer.ts` + `procedure-focus-store.ts` |
| Step bodies / dock | `UNBOX_STEP_BODIES` · `UNBOX_STEP_DOCK_CONTROLS` |
| Full Unbox walk | [`display/unbox-station.md`](display/unbox-station.md) |

ONE derivation drives dock ACTION + cockpit `railLeaf` + any remaining checklist.
Unbox selects a **named flow** from intake/pairing (`resolveUnboxFlow` /
`resolveContextFromFlags`); local pickup is a within-flow modifier, not a fourth SOP.
Capture order is code flow defaults **or** the org override from right-rail DnD (dogfood).
Handoff: `docs/todo/unbox-procedure-flows-HANDOFF.md`.

## Grid column visibility + sort

- **Visibility resolves in exactly ONE place** — `useGridColumnVisibility` (descriptor `tier` + staff
  delta + viewport force-hide → the visible track list, which the header, rows, summaries and the grid
  template all consume). Column `tier: 'core' | 'optional'` is the default-set SoT: grids open **lean**,
  staff opt in from the **column-display control** (`GridColumnGutter`; chrome
  `GridFieldsMenu` was deleted 2026-08-02), and prefs persist as a **delta** in
  `staff_preferences.tableColumns[tableId]`.
- **The control RESERVES NOTHING on the grid, and that is the whole ruling.** Three placements were tried on
  2026-08-02 and two charged standing rent for an action used a few times a shift: a permanent
  `w-9` header track plus `pr-9` charged every ROW of every grid, and a page gutter beside the card
  charged every PAGE. (Between them, dropping the padding without moving the control let it cover
  the last column's label — `TRACKING`.) Default: hover-revealed over the card's top-right corner:
  `group-hover` **plus** `focus-within` (hover alone is keyboard-unreachable) **plus** `open` (a
  trigger that left with the pointer would strand the rail it opened), with `pointer-events`
  following visibility so an invisible box never eats the header cell's clicks. **Band-3 portal is
  now the norm (generalized 2026-08-06, from the Unbox 2026-08-03 exception):** every workbench
  table that HAS a Band-3 passes its `WorkbenchTriageBand` controls slot as the grid's
  `columnTriggerPortalTarget` (→ `GridColumnGutter` `triggerPortalTarget`), so the `▦` sits resident
  among the refine icons (staff / filter / week / sort) instead of hover-revealing over the column
  header. This does **not** reintroduce reserved space — the Band-3 is an existing band, not a new
  header track or page gutter — so the "reserves nothing" ruling still holds. **Card-corner
  hover-reveal is the fallback** only for a surface with no Band-3. Still one door either way (open
  state + rail stay on the gutter). Neither `LedgerGridColumnHeader` nor `OrdersQueueColumnHeader`
  may take `onOpenColumnDetails` — the guard bans the prop, the marker and `pr-9` in both, and the
  E2E asserts invisible-and-inert at rest on any surface still using the card-corner fallback.
- **Width is a drag, and there is ONE handle** — `ColumnResizeHandle`. It mutates only the surface's
  `--cf-col-<key>` var, so header, rows, summaries **and the frozen pane's sticky-left `calc`**
  reflow together with no React render; the width commits once on drop via `useGridColumnWidths` to
  `staff_preferences.tableColumns[t].widths`. `isGridColumnResizable` decides who gets a grip:
  variable-content tracks yes; `select` and the fixed-format types (`number` · `id` · `location`) no,
  because those cells render a last-8 chip or a short numeral run and a drag only moves whitespace.
  A genuine exception sets `resizable` on the column model. Mid-grid keeps Airtable left-owns-divider
  (one trailing grip per resizable column). **At the frozen identity edge**, when the frozen column
  itself is resizable, title's trailing grip is flush (no overhang into the scrollable pane) and the
  first resizable column after `frozenEdgeKey` also mounts a leading grip (`resolveColumnResizeEdges`)
  so grabbing Incoming By resizes that column, not Product. When the frozen edge is
  locked (Receiving / Unbox History: `order` is `resizable: false`; Orders: Product is
  the frozen edge and the only resizable track), Product keeps a right (`end`)
  grip only — never invent a left grip. **Columns Display also sets exact width + per-staff
  min/max clamps** (`tableColumns[t].widthBounds`) for resizable columns — numeric Width · Min · Max
  in the rail; drag and panel share one clamp (`resolveColumnWidthClamp` / `clampColumnWidth`).
  **Width · Min · Max are Figma-scrubbable** (hold label or value, drag left/right; Shift = fine):
  Width live-mutates `--cf-col-*` on the card's `[data-cf-grid]` during the drag (same path as the
  header grip) and commits prefs on release / blur. Absolute rails **64…2000** px; unset staff max
  defaults to house **720**. A persisted px pref outside the live floor/ceiling is clamped on LOAD
  before painting `--cf-col-*` (`clampPersistedGridColumnWidths`). **Reset to default clears widths
  and widthBounds too** — a Reset that left the grid visibly non-default would be lying about what
  it did.
- **Receiving leftover width (2026-08-06):** Product owns slack — `title` is
  `minmax(8rem, 1fr)` + `resizable: true` + `minTrackRem: 8` (clamped **8rem…720px**).
  Product is the only `1fr` track and sits before the fixed facts, so resizing a fixed column
  (e.g. Status) drains toward Product's floor — widen Status and Product shrinks to absorb it,
  leaving Qty · Price · Loc · Tracking still, until Product hits its floor and the right columns
  h-scroll. **The floor is `8rem`, not a sliver** (corrected): an earlier 4rem drain floor
  rendered the header as a bare type glyph, because `gridHeaderShowsLabel` measured the floor
  (< the 8rem label-fit) rather than the flex column's real 1fr width. Two rules now guarantee the
  "Product" word: `gridHeaderShowsLabel` **always** shows a flex (`1fr`) column's label (its floor
  is not its rendered width — see **Grid header flex-label rule** below), and the 8rem floor keeps
  Product legible under drain/drag. Deterministic fact tracks stay content-hard; no trailing
  structural `_fill` on Unbox / History. Spreadsheet zoom scales rem floors via `--cf-density`
  (`gridTemplate` / `gridFrozenLeft` / `ledgerGridWidthVarValue`).
- **Grid header flex-label rule (2026-08-06):** a flex (`1fr`) column is exempt from
  `gridHeaderShowsLabel`'s width gates — it always renders its text label (unless
  `headerGlyphOnly`), because a `minmax(Xrem, 1fr)` FLOOR is not the rendered width; the track is
  the surface's slack absorber and renders at its 1fr share. Every flex-title grid (Product on
  Receiving · Catalog · Repair · Ready · Pickup · Unfound · Warranty) therefore shows its label
  regardless of a small drain floor. SoT: `grid-column-geometry.ts` (`gridHeaderShowsLabel`).
- **Unbox History / Receiving / Orders To Ship resize (2026-08-06):** Receiving exposes
  drag grips on **Product** (flex `1fr`) **and Status** (content-hard `6rem` floor, widened
  via `--cf-col-status` on the same generic `gridTemplate` var). Order · Date · Qty · Price ·
  Loc · Tracking · Serial · Vendor stay `resizable: false`.   Orders has **no Status column** — only
  **Product** resizes there; Order · Late · Qty · Tracking (and Tested who/when) stay
  `resizable: false`. Visibility /
  optional tiers still go through Fields. **Cond** is its own column after Product
  (Unbox adjacency) with the Unbox flush grade face (`conditionGradeTextClass` +
  `conditionGradeTableLabel`); note / OOS corners stay on Product.
- **Typed date track floors (2026-08-04):** `dateFace` (`day` · `stamp` · `duration`) +
  `resolveGridColumnMinTrackRem` in `grid-column-type-track.ts` — same discipline as
  `ALIGN_BY_TYPE` / `ColumnTypeGlyph`. Stamp = day+time (`Aug 3 4:54 PM`) → **12rem**; day
  default 4.5rem; duration 3rem. SoT width must clear the floor; drag-resize clamps to it
  on surfaces that still allow resize. Receiving History DATE declares `dateFace: 'day'`
  at **4.5rem** (full stamp on hover).
- **Typed external (platform) track floor (2026-08-04):** `type: 'external'` → **4rem**
  (`MIN_TRACK_REM_EXTERNAL`) — cell inset + `PlatformMark` (`h-5 w-5`) + hairline breathing so
  the channel mark cannot jam onto the TRACKING rule. Matches the house drag-resize floor
  (64px). Incoming keeps an optional platform track; Unbox / History dropped the column.
- **Never call `useIsColumnHidden` from a grid family** — it is the retired cell-granularity path
  that left an empty ruled band instead of removing the track. It survives on **four** surfaces, and
  the list is pinned shrink-only by: the chip/meta SLOT
  primitives `ChipColumns` / `RowMetaColumns` / `OrderIdentityChips` (each paints inside a cell the
  row already owns, so there is no track to remove) plus the pre-LedgerGrid
  `StationRowColumnHeader`, which migrates with its surface.
  *This row said "only `ChipColumns` / `RowMetaColumns`" while four surfaces called it — the guard
  exists because a rules file cannot fail. See `pattern-evolution.md` → Always #6.*
- **Sort is URL-durable — always.** A column sort held in `useState` dies on reload and cannot be
  sent to a colleague, which is the whole reason it lives in the URL.
- **Which param depends on what `?sort=` already means on that route.** There are two vocabularies
  and they are *not* drift — they answer different questions:

  | Param | Question it answers | Engine | Surfaces |
  |---|---|---|---|
  | `?colsort=` / `?coldir=` | "which column header did the operator click" | `useUrlColumnSort` (default pair, `grid-column-sort-params.ts`) | Receiving / History · Incoming · Catalog · Pickup |
  | `?sort=` / `?dir=` | "what display ORDER is this list in" — incl. composite non-column modes | `useQueueDisplaySort` · `useRepairDisplaySort` | Orders (`/dashboard`) · Repair |

  - **Reach for `?colsort=` by default.** On those four routes `?sort=` is already a **server**
    ordering vocabulary — `useIncomingFilters` (`zoho_newest`, …), `normalizeHistorySort`,
    `/api/sku-catalog?sort=az` — so a header click writing `?sort=` would silently rewrite the API
    query with a value it does not understand.
  - **`?sort=` on Orders / Repair is correct, not legacy.** Nothing server-side owns it there, and
    the vocabulary carries **composite modes** (`priority`, `newest`) that a pure column-sort param
    cannot express. The `QueueSortSwitch` dropdown and the grid header click write the same param on
    purpose: one surface, one answer to "what order is this list in".
- **One sort param per surface.** Two on the same list makes the header and the dropdown disagree
  about what is sorted. If a `colsort` surface later grows a composite mode, extend its column
  vocabulary or its server order — do **not** add a second `?sort=` beside it.

## Grid surface capabilities

- Source: `@/design-system/components/grid` `GridSurfaceCapabilities` on every
  `GridSurfaceDescriptor` (passed to `makeGridSurfaceDescriptor` — **required, no silent defaults**).
- **One shell, declared features.** Every Workbench spreadsheet mounts `LedgerGrid` /
  `LedgerGridSurface` with a descriptor that names what the surface may do:
  `rowTriageFlags` · `multiSelect` · `inCellEdit` · `fieldsMenu` · `dayBands`.
- **Triage wash is opt-in.** Only Orders sets `rowTriageFlags: true` (domain vocabulary in
  `src/lib/orders/order-row-flags.ts`). Catalog · Receiving · Incoming · Repair · Pickup ·
  station-history · FBA · warranty set `false`. Leaf rows paint fill via
  `ledgerRowFillClass({ selected, flagClass?, capabilities })` — a flag class is ignored when the
  capability is off, so Catalog cannot grow a staff row colour without changing its descriptor
  (and failing the guard).
- **A bag is required to MOUNT the grid, not just to build a descriptor.** A surface with no bag is
  **unclassified, not feature-free** — that is what let `StationListTable` (Tech/Packer history) and
  `FbaBoardTable` reach `LedgerGrid` with no declaration, and what let `OrdersQueueTableRow` resolve
  a bench row against `ORDERS_GRID_CAPABILITIES` by import. Two surfaces legitimately declare a bag
  **without** a descriptor because they have no column model of their own
  (`station-history-capabilities.ts`, `fba-board-capabilities.ts`); a column model authored only to
  satisfy the descriptor factory would be a stale second declaration of geometry nothing renders from.
- **A shared row component takes `capabilities` as a REQUIRED prop** and gates the flag **once, at
  derivation** — never imports one surface's const. `OrdersQueueTableRow` is the reference: it
  renders both the outbound grid and the station benches, so a default would silently give the
  benches outbound dispatch vocabulary.
- **Do not invent a second table shell** for a new spreadsheet — add a column model + descriptor
  with explicit capabilities + thin `renderRow`. Domain cell registries stay per family (different
  row types); the SoT boundary is shell + capabilities + shared atoms (`grid-cells`, `QUEUE_ROW`).
-
  **plus a disk walk of every `<LedgerGrid` / `<LedgerGridSurface` mount** asserting each is
  registered against a declared bag (only `LedgerGridSurface.tsx` itself is exempt). The hand list
  alone stayed green through both undeclared mounts above.

## Grid cell chrome

- Source: `src/design-system/components/grid/grid-cell-chrome.ts` — `ledgerGridCell` /
  `LEDGER_GRID_FROZEN_CELL` / `ledgerGridRowShellClass` / `LEDGER_GRID_WIDTH_VAR`.
- **One chrome helper for every LedgerGrid family.** Header, leaf rows, and group summaries
  compose `ledgerGridCell({ rule, inset })` so insets cannot drift. Surface layouts
  may keep thin aliases (`incomingGridCell`, `ordersQueueGridCell`, …); new code imports the DS
  names. Do not re-declare cell border classes beside the SoT.
- **Structural noise law (1B, 2026-08-04):** LedgerGrid / airtable sheets use **BOTTOM row
  dividers only** — no per-cell `border-right` column cage. Data contrast outranks structure.
  The `rule` arg stays for call-site compatibility but does **not** paint a vertical rule.
- **`inset: 'grid'`** (airtable skin) owns both axes of padding + `overflow-hidden`; `'cell'` is
  horizontal-only for board skins; `'none'` is the select gutter.

## Grid identity pane

- **The frozen pane is declared on the column model** (`frozen: true`), and the key list is
  **derived** with `gridFrozenKeys(columns)` — never re-typed beside the model. One declaration
  drives sticky-left today. **Operator-editable freeze**
  (pin any column like Google Sheets) is the intended future capability — do not treat today's
  identity-pane freeze as the final freeze UX. Column *order* is pinned to each table's layout SoT
  (Unbox History parity) — no staff drag-reorder.
  hard-coded panes as permanent product law beyond the select gutter floor.
- **It is a per-surface answer to "what stays pinned while facts scroll."**
  - **Unbox Sheets golden (major SoT, 2026-08-05):** freeze **`select · order`**.
    The PO is the unique row handle; Date and Product scroll with the sheet.
    Consumers: Unbox Recent / Queue / Testing · Unbox History. **Incoming
    Pipeline** stays **`select` only**.
  - **Unbox click-select (Sheets golden, major SoT, 2026-08-04):** plain **click**
    toggles bulk membership; **double-click** (Enter when focused) opens the
    record. Select track stays for **header select-all** (`GridRowCheckbox`
    `chrome="sheets"` paints {@link GridClickSelectFace} when all/mixed — same
    flush accent wash + check as the body); body paints a decorative **full-cell**
    check face (`GridClickSelectFace`) when selected / mixed — row wash
    (`ledgerRowFillClass`) is secondary. Not an interactive gutter
    checkbox (row owns `role="checkbox"`).
    - **Unbox History:** open = carton READ (`/carton/[id]`); row paint is the
      triage-band paint-bucket left of List|Drill (`HistoryRowPaintChrome`), not
      a grid header cell. Gate is `embedded && isHistoryMode` only.
    - **Incoming Pipeline:** open = right-rail inspector (`detail:incoming`).
      Gate is `isIncomingMode`. **1-check opens the inspector** (same target as
      dblclick / Enter); 2+ yields to `detail:receiving-line-batch`. Unpaired
      (no Zoho PO) rows expose a leading **Pairing** topic composing
      `CartonMatchHub` (`tabSet="arrival"`, `chrome="bare"`) — desk inspector
      topic, not Station Displays push. Carton-anchored empty-PO rows open
      (receiving_id); toast only when there is no PO · shipment · inbound · carton.
    Recent / Queue / Docked keep the select gutter (`'always'` chrome + two-plane
    law).
    Orders to-ship click-select keeps `'always'` interactive checkboxes on
    header **and** body (same painted square as Pack / Labels); row click still
    toggles bulk and double-click opens.
  - **Orders** freeze **`select · order · age · title`**: the sales order is the
    *container* an operator arrives by; Late (`age`) stays beside it (urgency before
    the long product title) so sanitize cannot shove Product ahead of days-late;
    Product is the frozen-edge flex / sole resize track.
  - **Catalog · Repair · Pickup** freeze **`select · title`** — Catalog has no order context,
    Repair's desk quotes an `RS-####` ticket rather than an order, and Pickup's order is already
    the group header, so freezing it would pin a duplicate of the row above.
  **Do not widen `GRID_IDENTITY_COLUMN_KEYS`** to serve one surface — it remains the two-key house
  default and the key-only **in-cell edit** floor (identity ≠ freeze).
- **The pane must be a contiguous leading prefix** of the canonical order, starting with
  `select`. Sticky-left offsets sum the widths of the frozen columns *before* a given one,
  so a frozen column sitting after a scrolling one pins at the wrong origin.
- **A frozen column carries no `hideKey` and no `tier`** — it is structural, so the column-display rail
  can never take the row's identity away (`isGridColumnVisible` rule 1). Promoting a fact column
  into the pane therefore *retires* its pref key; a stale `hidden: [..]` delta goes inert on its
  own, which is the whole migration.
-
  prefix, never hideable, always in the default set).

## Grid row fills

- **Same palette as column highlights.** `GRID_HIGHLIGHT_PRESETS` /
  `LEGACY_GRID_COLUMN_HIGHLIGHT_HEX` (Blue · Amber · **Rose** · Emerald + Sheets
  extras) — never a twin list for rows.
- **Consumers:** Unbox History (`HistoryRowPaintChrome` → `receiving`) and
  To-ship (`OrdersRowPaintChrome` → `orders`). Paint-bucket left of List|Drill
  applies a fill to currently selected rows via `useGridRowFills` →
  `staff_preferences.tableColumns[t].rowFills`. Top-left of the sheet stays
  **select-all** — never park paint there.
- **Selection wash outranks custom fill** while the row is selected
  (`ledgerRowFillClass`); the custom fill returns on deselect.
- **Never** a per-cell color UI or a Fields-panel twin for row paint — column
  Fields keeps Paint column; row paint is the triage chrome icon only.

## Grid column justification

- Source: `src/design-system/components/grid/grid-header-align.ts`
  (`resolveGridColumnAlign` · `gridCellAlignClass` · `gridHeaderCellAlignClass`).
- **Hard rule — MAGNITUDES end, LABELS + IDs start.** Header and cell resolve the SAME decision
  from the column model; never re-decide with a per-surface ternary or a hand-typed
  `justify-end` / `text-right` on the cell. Helpers emit **both** `justify-*` and `text-*`
  so shrink-wrapped chips and full-width faces share one edge.
  | Type | Align | Examples |
  |---|---|---|
  | `number` · `price` · `date` | **end** | Qty · unit cost · civil day / stamp / duration |
  | `text` · `longtext` · `tag` · `external` · `location` · `tracking` · `id` | **start** | Product title · condition · status · platform · bin · tracking last-8 · order # · SKU · serial |

  **The test is magnitude vs label/ID, never digit-ness.** A magnitude is compared *down* the
  column — the eye reads the ones place, so the right edge has to stack. A label or ID is *read*,
  one row at a time, from the left edge. `location` / `tracking` / `id` are often made of
  digits and are still start (2026-08-04 — Law of Strict Alignment: text + IDs left; numbers +
  dates right). `date` is a magnitude you compare (“which line is sooner?”) and end-aligns with
  qty / price (ruled 2026-08-03).
- **All `id` columns start (2026-08-04).** The earlier 2026-08-02 split (order start /
  SKU·serial end) is superseded by the Law of Strict Alignment: text + IDs left;
  numbers + dates right. `ALIGN_BY_TYPE.id` is **`start`**. Explicit `align: 'start'`
  on `order` columns remains for clarity, not as an exception. A surface that
  genuinely needs an end-aligned id sets `align: 'end'` on that column model.
- **`location` / `tracking` are ADJUDICATED `start` (ruled + shipped 2026-08-02; glyph
  split 2026-08-04 — folded map vs MapPin); `date` is ADJUDICATED `end`
  (ruled + shipped 2026-08-03).** Tracking last-8s in an 8rem track left ~3rem of empty track on
  the LEFT of every row when end-aligned, so the eye could not run a straight line down the
  identifiers — which is the entire job of a column. That bench finding still holds for
  both. Civil days and durations are the opposite: operators compare them down the column
  the same way they compare qty (“which line is sooner / overdue?”), so `ALIGN_BY_TYPE.date` is
  `end` with `.number` / `.price`.
  - Blast radius, checked: `date` types `date` / `sla` / `age` / `tested` / `logged` / `created` /
    `last_counted` / `due` / `testedAt` — all civil days, stamps, or durations, all end.
    `location` (bin / staging), `tracking` (carrier #), and `id` — all start. `DataTable`
    derives from the same SoT, so the admin / settings lifecycle tables move with the grids.
- Explicit `align` on the column model is the ONLY override — use it where a column's *type*
  disagrees with its *content* (rare after the 2026-08-04 id→start flip). Also correct for a
  column that is numeric-looking for the header glyph but whose *cell* is prose or a
  categorical chip (catalog `inventory`). Declare the exception once on the layout SoT.
- **Headers match the data they name** — both call `resolveGridColumnAlign`. Never center an
  empty face under a start- or end-aligned header; empty cells compose `GridCellDash` as a flex
  child of the aligned cell (Law of Strict Alignment / quiet display 2B).
- **Tabular numerals on magnitude scan faces** — qty · price · date (and dense chip
  mono on id/tracking) carry `tabular-nums` so ones places stack. Caption-dense `ledgerCell` /
  `text-role-caption` does **not** bind tabular intrinsically — opt in on the value face
  (Law of Tabular Numerals).
-test.ts`). Every LedgerGrid
  row / summary / header must compose the SoT helpers — never fork alignment per surface.

## Collection-surface action planes

- Four planes, one primary each: **in-cell** (cell-anchored editor) · **row-scoped** (hover controls +
  single-row menu) · **multi-select** (push right rail — `RailSelectionBand` / `RailActionRegion`) · **record** (detail inspector / full
  page). Full decision table: [`display/workbench.md`](display/workbench.md).
- **Actions diverge by lifecycle stage; column layout and grid components diverge only by data domain.**
- The **record plane stays a complete superset** wherever the in-cell plane is conditionally
  unavailable (mobile, non-airtable skin) — otherwise a field becomes unreachable on the surface that
  cannot show its primary plane.
- **Identity columns (`select` · `title`)** — frozen, immovable, and **never in-cell editable**
  (`GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` in
  `src/design-system/components/grid/grid-column-editability.ts`). Correction at the record plane.

## Left-edge occupant (the context column is earned, not a default — ruled 2026-08-09)

The left context column is **not** free chrome every surface gets. Each region
contract earns (or forgoes) it, and what it may hold is fixed:

| Region contract | Left edge | What it holds | Why it is earned |
|---|---|---|---|
| **Scan Station** (`floor`) | **Recents rail** | the MRU / resume set (`SidebarRecentRailBase`) | hands are on the scanner — the left is where you pick up the carton you left, not a browse map |
| **Workbench — `master-detail`** | **Record picker** | the collection navigator (`SidebarShell` / `SidebarRailShell`) | the record has no other address; the picker **is** how you select it |
| **Workbench — `ops-queue`** (desk triage) | **No context column** (Pattern E) — Band 1 is lifecycle tabs only; page-scoped **Views** lives on Band 3 trailing find | `WorkbenchViewsMenu` (flush Lucide Bookmark icon; tooltip = Views / active name) | the table rows **are** the record picker; tabs own stage (outer board), KPI owns attention, saved filter combinations are an **inner refinement** next to find — never a Band-1 peer of tabs. A left rail could only restate them |
| **Monitor** | **Nothing** (filter band only) | — | observe-only; no durable selection |

**The one test — does the left hold something the tabs, the KPI band, the
page's own Views control, and the table rows cannot express?** For a scan
station that is the recents/resume set; for a master-detail workbench it is the
record picker. For a pointer-driven triage queue there is nothing left over — so
it is **rail-less**, and the reclaimed width goes to the table (the Zendesk /
Linear / Shopify-Admin shape; report Pattern E / D9 / D10).

### A control's SCOPE decides its home — never conflate three pin scopes into one control

**Ruled 2026-08-09, corrected same day after two wrong placements; strip list-pin
named as a third scope 2026-08-09.** The mistake happened twice in one session
and both times had the same root cause: treating "where is there empty space"
as the deciding question instead of "what does this control mean, and who else
on the app needs the exact same meaning." Write the law from the failure, not
just the fix:

| Control | Scope | Means | Home | Store |
|---|---|---|---|---|
| **Page-pin** (`HeaderPinsSwitcher`) | **WEBSITE-WIDE** | "jump me to this whole PAGE from anywhere in the app" | **GlobalHeader nav cluster, unconditionally, on every route** | `useQuickAccess` / `cf.quickAccess` |
| **Strip list-pin** (`UnboxAddListPopover`) | **STATION Band-1** | Mount a **foreign system collection** from a closed catalog onto this strip (not a filter, not a page jump) | **Leading boxed Pin cube** abutting the tab rail (`STATION_CONTEXT_BOXED_CUBE_CLASS` / `WORKBENCH_CHROME_BAND_FACE`) — earned only when a closed catalog exists; otherwise omit | `staff_preferences.unboxPinnedExtraTabs` + `resolveUnboxPinnedTabs` (staff → role → org → `[]`) |
| **Saved views** (`WorkbenchViewsMenu` on ops-queue / Band-3 desks) | **PAGE-WIDE** | "remember this FILTER COMBINATION on this one surface's own params" (personal by default; optional org-share via `is_shared`) | **Band 3 trailing find** (flush Bookmark icon, right of search, before layout toggles + Show inspector) — never Band-1 beside lifecycle tabs | `useSavedViews` (per-`storageKey`) |

- **A control's home is decided by its SCOPE, never by which button already
  exists nearby or which button's dropdown "has room."** Website-wide, station
  strip, and page-wide are different questions; proximity on one Band-1 face is
  not identity.
- **Never suppress, relocate, or gate the website-wide page-pin for a
  page-scoped reason.** `HeaderPinsSwitcher` renders unconditionally in the
  GlobalHeader on every route — a rail-less desk's frame change is not a reason
  to move it, hide it, or grow it a second tab. The first wrong attempt did
  exactly this (`GlobalHeader` gated on `useIsRaillessOrderFeed`) and it is
  banned outright, not just discouraged.
- **Never grow the page-pin's dropdown a second TAB for a page-scoped
  concern**, even when the tab strip is gated to appear "only on surfaces that
  have one." A tabbed dropdown reads as "these are two facets of the same
  thing"; they are not — one is `useQuickAccess`, the other is `useSavedViews`,
  and conflating the stores behind one trigger is the second wrong attempt this
  session made, and it is banned outright too.
- **Never merge strip list-pin into page-pin or Views** — different stores
  (`unboxPinnedExtraTabs` vs `quickAccess` vs `saved_views`), different homes,
  different jobs. Never put pin glyphs on **system** tabs (Chrome-style
  pin/unpin of process stages is banned). Never use list-pin for a filter facet.
- **A page-scoped control is its own component, with its own icon, in the
  page's own chrome** — never inside, beside-as-a-tab, or borrowing the chrome
  of a global control. `WorkbenchViewsMenu` shares nothing with
  `HeaderPinsSwitcher` but the underlying popover primitive
  (`AnchoredLayer` + `HeaderChromeMenu`) — no import of `useQuickAccess`, no
  `[role="tab"]`, no `Pin` icon. Never mounts in Band-1 `leading` (that falsely
  promotes an inner refinement to an outer scope next to lifecycle tabs).
  Band-1 `leading` is reserved for the strip list-pin cube when earned.
- **Personal scope (My queue) is the right-inspector staff filter** on the desk
  (`OrdersViewTopicsCluster` `StaffFilterButton`) — the right edge is record
  **detail** / assistant (one slot, detail outranks assistant; see **Right-rail
  modality**), and the staff filter rides its View-topics cluster. It is not a
  left-rail Focus row and not a tab on either header control.
- *(Home → Today is not an `ops-queue` desk — its rail holds saved views
  because that is its one navigational job; it does not compete with this
  ruling.)*
-
  renders unconditionally and never imports `useSavedViews`/`role="tab"`, and
  that `WorkbenchViewsMenu` never imports `useQuickAccess`/`HeaderPinsSwitcher`,
  and that To-ship Band 3 (not Band 1) mounts the Views control. Strip list-pin
  contract:.
- **Lifecycle stage → tabs. Attention (urgent · out-of-stock · exceptions) →
  KPI band.** A left "Focus" row that restates either is a duplicate — every
  facet has exactly one owner in `OUTBOUND_FACET_OWNER` (report P1/P5/P8).
- **Rail-less is a routing predicate, and it is the extension point.**
  `isRaillessOrderFeedSurface` (`sidebar-navigation.ts`) → `useIsRaillessOrderFeed`
  → `ContextPanelLayout` `hasPanel` (the same collapse `/search` already uses). A
  new rail-less desk **extends that predicate**; it never re-derives the frame or
  returns `null` into a reserved column (the `?mode=inbound` void bug).
- **Never** a monitor rollup (ROI / throughput) or an onboarding checklist in a
  working triage rail — ROI → KPI band / Operations analytics, onboarding →
  Home → Today (report P6/P10). Frame mechanics: **Frame column
budget** · **Right-rail modality**. Band-1 grammar: **Workbench Band-1 strip**.

## Workbench Band-1 strip (system tabs · list-pin · resolve — house chrome)

**Every workbench page's Band-1 follows one grammar.** Unbox is the golden
exemplar; peer lifecycle strips (To-ship · Testing · Pack · Shipping · Incoming ·
Labels · …) obey the same laws even when they omit Pin-list (honest absence —
no closed foreign-collection catalog yet).

| Kind | Who defines | Staff-hideable? | Home | Store |
|---|---|---|---|---|
| **System / process tabs** | Product (fixed strip per surface) | **No** — same for every staffer | Band-1 tab rail | URL / workspace-state SoT (e.g. `UNBOX_WORKSPACE_TABS`) |
| **Pinned extras** | Closed catalog + staff/org/role | Yes — pin/unpin **only these** | Band-1 after system tabs; trigger = leading Pin cube | `unboxPinnedExtraTabs` + defaults |
| **Saved views** | Operator (facet combo) | N/A (not strip membership) | Band 3 Views | `saved_views` / `useSavedViews` |
| **Page-pin** | Staff (cross-app jump) | N/A | GlobalHeader | `quickAccess` |

**System tabs — never Chrome-style pin/unpin.** Process stages and durable
collections on the strip (Unbox: Inbound · Queue · Recent · History; To-ship:
lifecycle Pending → … → Shipped; Testing / Pack / Shipping peer strips) are
shared muscle memory. Hiding a system stage per staffer breaks shared benches,
spatial predictability, and exception visibility. Urgency is a **row / KPI**
concern, not a hideable tab (Unbox: urgent pins to the top of Queue rows;
`?unboxview=urgent` resolves to Queue).

**Pinned extras — closed catalog only.** `UNBOX_EXTRA_TAB_CATALOG` /
`sanitizeUnboxPinnedExtraTabs` / hard cap `UNBOX_PINNED_EXTRA_TABS_MAX` (2).
Trigger copy is **Pin list** (pushpin), never bare `+` ("create table"). When a
catalog entry is promoted to a system tab (Inbound 2026-08-08), it leaves the
pin machinery and cannot be unpinned. Catalog growth / porting Pin-list to
other stations is a separate product freeze — do not invent Pin-list on desks
with no foreign-collection catalog (To-ship Band-1 = tabs + Import/Add only).

**Resolve ladder** (`resolveUnboxPinnedTabs` in `unbox-default-pins.ts`):

```text
staff override → role default → org default → []
```

| Layer value | Meaning |
|---|---|
| `null` / absent | Silent — fall through to the next layer |
| `[]` | Explicit clear — **wins**; no re-inherit |
| `['…']` | That layer's template wins (then sanitize + cap) |

Staff writes `staff_preferences.unboxPinnedExtraTabs`. Org/role templates:
`receiving.unboxDefaultPinnedExtraTabs` /
`receiving.unboxDefaultPinnedByRole.<role>` (folded server-side on
`/api/staff-preferences` GET). Every layer is sanitized so a stale template
cannot widen Band-1 past the vocabulary budget.

**Regional + embed splits (ratified with Pin-list harden):**

| Split | Law |
|---|---|
| **Scan periphery ≠ Workbench Views** | Scan left = MRU / scan history / errors only. Band-1 = system tabs (+ ≤2 extras). Saved views live on Workbench Band 3 (or a Workbench rail on non–ops-queue surfaces) — never on scan periphery, never as Band-1 peers of process tabs. |
| **Embed ≠ L1 desk** | A foreign collection mounted on Unbox (or a future station embed) is triage/read — own prefs bucket (`incoming_embed`). Rich Check · Import · Add CTAs stay on the L1 desk (`/incoming`, `tableColumns.incoming`). Same collection, two altitude contracts. |

**Modules:** `src/utils/unbox-workspace-state.ts` · `src/lib/receiving/unbox-extra-tabs.ts` ·
`src/lib/receiving/unbox-default-pins.ts` ·
`src/components/receiving/unbox/UnboxAddListPopover.tsx` ·
`src/components/receiving/unbox/UnboxWorkspaceHeader.tsx`. Detail / cohort
exemplars: [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md).

**Not this section:** Unbox **dock** Band 1 (scan-floor step ACTION / Print·Receive)
is a different concern — [`display/unbox-station.md`](display/unbox-station.md).

## Kiosk mode spine (customer tablet — ruled 2026-08-10)

Front-desk kiosk module selection (Repair · Buy/Sell · Pickup) lives in
**`KioskModeSpine`** — a far-left **push** column to the left of the Catalog
rail. Geometry mirrors staff MasterNav (`SidebarNavColumn` snap width, no
overlay, no motion tween) but is a **kiosk-only host**: never mount
`MasterNav` / `APP_SIDEBAR_NAV` on the chromeless tablet.

- **Always-visible icons** for live `KIOSK_SERVICES`; Catalog pane header
  (`KioskSpineToggle`) expands labels (push Catalog/Detail right). Spine column
  is destinations only — never hosts its own open/close header.
- **Never bottom pills / floating docks / in-flow bottom mode segments** for
  kiosk services — including portrait. On a mounted iPad the bottom bezel is a
  palm/wrist/personal-item hazard zone; accidental mid-transaction mode
  switches are the cost of thumb-zone mobile chrome.
- Catalog (`ProductSelector`) stays the *next* left rail (product/category),
  not module selection. Pickup hides Catalog; the mode spine stays.

Service list SoT: `src/lib/kiosk/services.ts`. Chrome tokens:
`src/app/kiosk/kiosk-chrome.ts`. Region contract:
[`display/kiosk-shell.md`](display/kiosk-shell.md).

## Frame column budget (ruled 2026-08-03)

The content row is a **width budget**, not five independent preferred widths.
Ops density (Kinetic Ledger) is **exact flush** on a shared sunken/canvas ground —
not Notion-style floating column islands. Depth lives in **planes** (see **Depth
elevation**); gutters between spine · context · center · right are not a depth cue.

### Column registry (prose — compose existing modules)

| Column | Role | Width SoT |
|---|---|---|
| **MasterNav spine** | App navigator push | `SidebarNavColumn` — operator open/close; **never auto-closed** by the right rail |
| **Context panel** | Route left rail (scan + recents / picker) | `CONTEXT_PANEL_RESIZE` — min **300**, default **360**, `maxWidthPadPx` **760** |
| **Center** | Sunken work surface (station deck · grid · master detail) | Desk: `flex-1` floor = `MIN_WORK_SURFACE_PX` (**784**). Scan stations (**Flex-Grow Sandwich** via `StationScanPaneHost`): `[middle LOCK 720 shrink-0][Displays flex-1 trailing]` — middle is the permanent anchor (`min-w`/`max-w`/`w` **720**); Displays **always fills leftover** to the pane right edge (never `ml-auto` detach / host `gap-*` / `justify-between` / gutter div / leading spacer); **open context rail + Displays are inverse-coupled on sash drag** (`station-dual-rail.ts` — `left + 720 + displays = frame`); content uses `STATION_WORKBENCH_COLUMN` (`w-full min-w-0` — edge-to-edge of center; identity + notes dock share one measure; no `max-w`/`mx-auto` gutters); PhotoPeek pins `absolute right-0` on the center; **station push center floor = `STATION_WORKBENCH_LOCK_PX` (720)**; Displays-closed center is `flex-1` with the same min floor; Displays drag min = `STATION_DISPLAYS_MIN_WIDTH_PX` (**280**); `RIGHT_RAIL_GUTTER_PX = 0` |
| **Right edge** | **One** details column | `DETAIL_STACK_RESIZE` — min **360**, default **420**, `maxWidthPadPx` **960** · occupants via `RightRailHost` / `RIGHT_RAIL_PRIORITY` |

Hard rule: `sum(open rail widths) ≤ available − centerMin`. If false, **shrink
the right panel's resize cap** (desk: center hugs `MIN_WORK_SURFACE_PX`;
station Displays: center floor **720** — middle never yields below the
workbench lock) — never auto-close the left context rail.

**Scan-station Flex-Grow Sandwich + dual-rail (Unbox · Arrival · Testing):**
when the context rail and Displays are both open, a sash drag on either side
redistributes width inversely while the middle stays locked at **720**
(`left' + 720 + displays' = frame`). Displays is a `flex-1` invader that
**always fills leftover** to the pane's trailing edge
(`StationDisplaysPushColumn`) — resize desire still trades with the context
rail; it must **not** leave an emergent gray band via `ml-auto` + sticky
painted width. Content inside the center is **edge-to-edge**
(`STATION_WORKBENCH_COLUMN` = `w-full min-w-0` — identity + notes dock share
one measure; never page-local `max-w-[720px] mx-auto` gutters). Unbox
`LineEditPanel` is the golden; siblings are ratcheted by +
`docs/todo/scan-station-edge-measure-CI-LOOP-PROMPT.md`.
**Never** host `justify-between` / host `gap-*` / a gutter `<div>` / leading
spacer / `ml-auto` detach / `RIGHT_RAIL_GUTTER_PX ≠ 0`, and **never**
`min-w-0` or `flex-1` on the middle under Displays. Widths persist on the
existing `CONTEXT_PANEL_RESIZE` / Displays storage keys; closing one rail must
not wipe the other's preference. Desk `RightRailHost` inspectors are **not**
coupled. Host SoT: `StationScanPaneHost`. Math SoT:
`src/lib/right-rail/station-dual-rail.ts`.

Unconstrained-fit threshold for a right-rail occupant:
`RIGHT_RAIL_PUSH_MIN_FRAME_PX` (= `MIN_WORK_SURFACE_PX` + gutters + detail min
≈ **1144** content-row px with flush planes / zero outer gutters). It is
diagnostic geometry, **not an overlay breakpoint**: below it, a desktop
non-modal inspector remains an in-flow push column and the center constrains /
scrolls rather than being covered by a floating card.

### Yield ladder (operator-open multi-column pressure)

When several columns are open and the budget fails, collapse/compress in this
order before covering the work surface:

1. **Right panel width** → shrink toward `DETAIL_STACK_RESIZE.minWidthPx` via
   `resolveRightRailFrame.capPx` (desk: center hugs `MIN_WORK_SURFACE_PX`;
   station Displays: center floor **720**, middle lock holds)
2. **MasterNav** → closed / icon strip (operator-recoverable; never auto)
3. **AI assistant** → yield the right slot (ambient)
4. **Context recents** → operator park only (`CONTEXT_PANEL_COLLAPSE`) — **never**
   an ephemeral mask from opening the right edge
5. **Ticket / record detail** → park strip or close occupant (operator / Band 3)
6. **Never** float a resident inspector over the work surface

Inverse when space returns: restore by last operator intent, not blindly.

**Shipped right-rail push budget** (`resolveRightRailFrame` in `frame.ts`) is the
narrow case of this law for a single right occupant: keep the **context rail
open**, cap the details column so the center hugs its floor, and stay in flow
at the panel minimum. The spine is **not** auto-closed (navigator must not
vanish under the operator).

### Explicit bans

- **Five full preferred-width columns** (spine + context + center + ticket + AI)
  as a laptop (~1440) default — that sum exceeds the center floor.
- **Dual full-width right columns** — AI beside ticket/record details. They share
  **one** right-edge slot (see **Right-rail modality**). Wide-breakpoint dual-right
  is **not** the house default and must not ship without a budget gate + SoT growth.
- A future `column-registry` code module may grow `frame.ts`; until then this law
  **composes** `frame.ts` + `CONTEXT_PANEL_RESIZE` + `DETAIL_STACK_RESIZE` +
  `RIGHT_RAIL_PRIORITY` — never a page-local width math twin.

## Displays vs inspector (operator nouns — ruled 2026-08-05)

Three different right-edge jobs. Do not rename one with another's noun:

| Noun | Region | Opens | Operator copy |
|---|---|---|---|
| **Displays** (plural) | Station scan (`LineEditPanel`) | `StationDisplaysPushColumn` / `StationDisplaysPushStack` (`src/components/station/displays/` — Ticket · Photos · Linkage · Inventory · Classify · Units) | **Open displays** · close **Hide right panel** (`StationDisplaysEdgeToggle`) |
| **Inspector** | Desk / History table | `RightRailHost` peek (`detail:history`, …) | Band 3 **Show / Hide inspector** (select-a-row when empty); panel chrome park is `→|` |
| **LineEdit / carton work** | Station centre | Already open when scanning | Never label the Displays edge toggle “details editor” — the editor *is* `LineEditPanel` |

**Always**

- Station pane `←|` opens **Displays**; History Band 3 ▦ parks/reopens the **inspector**.
- **Chord split (Displays ≠ inspector):** Station Displays toggle = **⌘/Ctrl+]** on `StationDisplaysEdgeToggle` (open index / close column — same as `←|` / `→|`; browser Forward is intentionally stolen on the bench). Desk History / To-ship inspector park = **⌘\** + bare **]** on the workbench header — never bind ⌘] for inspector or ⌘\ for Displays. Owner module: `displays-toggle-hotkey.ts`.
- Carton `↑ ↓` beside Station `←|` are the **carton cursor**, not inspector prev/next.
- History / desk peek topics use **`DeskInspectorIndexShell`** → shared Unbox waist **`DisplaysIndexLeafStage`** (same stage body as `StationDisplaysPushStack` — upgrade index list / stage layout there and it propagates; never fork a page-local twin; never `PaneHeaderTabs` / `SectionTabsSlider density="icon"` as primary topic nav; never mount `StationDisplaysPushStack` as a rail occupant). History: `history-inspector-topics.ts` → Details · Logistics · Evidence · History; Edit = one identity primary CTA + More; View = sheet layout / refine behind a View toggle. Desk Orders twin: `order-inspector-topics.ts` + `buildOrderInspectorLeaves` — locked Order · Documents · Timeline · Conversation; Order leaf **stacks** Shipping + Product; order updates (Assign · urgent · notes · …) + flush Delete on `OrderUpdateDock` → `InspectorActionFloor` under Order; index ⋮ = handoffs; no ORDER # identity row on `detail:order`; sheet View lives on `detail:orders-view` only. Singular “Display topic” ≠ Station **Displays** column. Detail: [`display/right-rail-inspector.md`](display/right-rail-inspector.md).
- **Inspector action floor** (`InspectorActionFloor`) mounts only on desk triage record peeks when the open row has Macro commit / delete (Incoming · Orders Order-leaf · Unfound · Repair · Bin · SKU · **History**, n=1) — never on Station Displays, never as `RightRailHost` host chrome, never on an empty select-a-row / View-only shell. History's record actions (Print · Open in Unbox · Delete carton) live on this floor, not the identity band (ruled 2026-08-09).
- **Station Displays carton Macro verbs** (`StationDisplaysHeaderActions` + `CartonDisplaysActionFloor`, Unbox golden `UnboxDisplaysActionFloor`) sit in the push column's **top-right corner** — `Refresh? · Print? · Edit · ⋮` — **not** on a bottom rung (moved 2026-08-18; the `h-11` `FlushTerminalFooter` floor is retired). Three things are load-bearing:
  - **`⋮` is the trailing-most cell, always.** It is the universal anchor for secondary and destructive verbs, and it must not move when a station wires fewer optional peers — Testing has neither Refresh nor Print, and an operator's reach for `⋮` still lands on the same pixel.
  - **Delete is inside `⋮`** (`DropdownMenuItem tone="danger"`), never an exposed peer. A bench operator clicks fast; the menu's extra click plus the existing `CARTON_DELETE_UNDO_MS` toast are the two layers keeping a carton from vanishing mid-scan. `InspectorFlushDelete` is gone from this row.
  - **The filter followed it up, one day later (2026-08-19).** `Filter displays…` is now **row 2** — a full-width `TechRailSearchBar variant="chrome"` band directly under the header, above the first group eyebrow — and the column paints **no bottom band at all**. The left-rail-twin argument that had kept it down there was really about the filter sharing a band with `→|`; once the dismiss moved, the pairing was already broken and what remained was a find field sitting *below* the list it filters. Row 2 is the order the Unbox workbench sheet already teaches (chrome → find → rows) and it reuses that sheet's exact find face, so one muscle memory now covers both surfaces. Index only — a leaf inherits no list-filter chrome.
  - **The `/` leaf-command footer was deleted with the band, not relocated.** It was an opt-in stage with zero leaves opting in (both `setLeafCommands` call sites passed `null`), so `DisplaysFooterStage`, `DisplaysFooterCommand`, `setLeafCommands` and both footer components are gone. A stage nothing can paint is where the next regression hides.
  Descriptors: `station-displays-carton-floor.ts` (no “Open in Unbox”). Still never mount desk `InspectorActionFloor` on Displays (fork — ruled 2026-08-09).
- **The carton `↑↓` cursor no longer mounts in the Displays band** (2026-08-18). The corner is the verb cluster's. Consequence, accepted deliberately: while Displays is open there is **no** carton prev/next — the vertical pair on `ScanStationUtilityRail` unmounts on open, so hopping cartons means hiding the column first. Revisit if the bench reports paging with reference open.
- **Incoming desk Pairing** is an inspector **topic** on `detail:incoming` (composes `CartonMatchHub`); Arrival / Unbox / Testing keep Pairing on Station **Displays** push. Never mount Pairing as a second Displays column on Incoming.
- **Station Displays navigation (Unbox golden, 2026-08-07; SoT host 2026-08-07):** Root-to-Leaf drill-down lives in **`StationDisplaysPushStack`** (`src/components/station/displays/`) — the shared right-edge triage wrapper for Unbox · Arrival · Testing · Pack · Shipping · Review. `?display=index` Root Index = grouped status rows (`StationDisplayIndexList` + `DisplayIndexRow`; Unbox enrichment via domain `buildUnboxDisplayIndexRows`) → leaf body with sticky Back (`StationDisplayLeafHeader`). Index stage/device/density · eyebrow trailing · character-select ↑↓ wrap cursor · layout-stable armed marker: [`display/station-workbench.md`](display/station-workbench.md) → Displays Root Index. **ONE Root-to-Leaf grammar — there is no `navMode` prop** (deleted 2026-08-07). Every station drills index → leaf; Esc pops leaf → index → close; Back → index; the `←|` edge toggle lands the **index** on any station declaring 2+ displays, while a contextual `openDisplays(<leaf>)` skips it (Arrival · Pairing is the one-display case). A `navMode="leaf"` variant existed for one day: it rendered a single leaf and **no switcher at all** (`onTabChange` had no caller inside the column), so Pack (4 displays) · Shipping (2) · Review (3) shipped with every display but the one the edge toggle guessed unreachable from anywhere in the app. It was removed rather than kept for a hypothetical one-display station — an untested branch in a shared waist is where the next regression hides. **A gated-away leaf resolves to the INDEX, never `displayTabs[0]`** — silently swapping in an unrelated display is the failure the index exists to prevent. `←|` Open displays seats in the scan utility-rail **bottom** footer (`STATION_UTILITY_RAIL_FOOTER_CLASS` / `UnboxDisplaysUtilityRailBody` — left-dock expand twin) and opens index on index-nav stations; contextual `openDisplays(<leaf>)` skips index. **`→|` PARKS, it does not unmount (2026-08-19).** The header close sets the column to its parked strip; **Esc** (leaf → index → `onClose`) is the full close. Two controls, two meanings: `→|` gets the column out of the way and leaves the index one click away; Esc puts it away. While parked the column owns **⌘]** (neither edge toggle is mounted in that state) and the chord restores. **Parked Displays strip (2026-08-19):** the closed column shows the **Root Index as an icon rail** (`StationDisplaysParkedRail` via `StationDisplaysPushColumn` `parkedRail`) — same 32px strip as the left rail's pins, but a FIXED index rather than an MRU list, and a cell **opens the column on its own leaf** (a display cannot be read while parked, so select-without-expanding is not available to it). Attention tone leaks through; the last opened leaf is marked. No foot restore button on either strip. **Displays chrome rows (2026-08-19):** row 1 = the header band; **row 2 = `Filter displays…`** (`subHeader` slot on `StationDisplaysPushColumn`, full width, index-only, `TechRailSearchBar variant="chrome"` — the Unbox sheet Band-3 face); body below. **There is no footer** — never remount a bottom band, a leaf filter, or a second ⌘K. A leaf must not inherit list-filter chrome that does not refine the leaf. Checklist stays ring-only (column top-band progress chrome — never an index row). Horizontal `SectionTabsSlider` `density="icon"` topic plate is **retired** as Station Displays primary nav (Desk Orders twin may still use an icon plate). **Nested leaf grammar:** preferred = **armed-row** verb list + stack chrome (`StationArmedVerbList` / `useArmedCursorList` / `useDisplaysLeafChrome` — Photos · Inventory golden) + URL drills where used; in-tool child `TabDisplay` `appearance="segment"` (Move To·From · Prebox mode · Support Team·Activity · Claim New·Link). **Nested verb altitude** (Photos): bench first → tools → evidence — `UNBOX_PHOTO_ACTION_ORDER` = Actions · Move · Send · Compare (default Actions; absent / legacy `browse` → Actions; carton gallery browse stays on identity peek / lightbox). **Never both** an armed-row list and a nested parent `TabDisplay` on the same leaf. **Linkage · Units · Photos · Inventory** are armed-row + parent-chrome drills (no parent underline; Inventory never hand-rolls a sub-index `<ul>`). Never soft `TabSwitch` `solid` pills. **Inventory** is an armed-row **secondary drill** (Information · Lines · PO notes · Activity) — no nested Items·Notes·Activity tabs, no second Back; only Displays leaf Back → Index (trail pop via chrome). Inventory reconnect stays Settings → Integrations; Change PO opens Linkage. **Ticket is presence-exclusive** (no Chat·Claim tabs): no linked ticket → Claim; linked ticket → Chat. Claim **New · Link** is the claim-only child layer in `StationDisplayLeafHeader` trailing via `setLeafTrailing` (`appearance="segment"`).
**Never**

- Rename Station edge copy to “Open inspector” or “Open details editor.”
- Call History / Desk `RightRailHost` peek “Displays,” or mount Station Displays as a `RightRailHost` occupant.
- Conflate Band 3 inspector reopen with `StationDisplaysEdgeToggle`.
- Park exact triage detail (full IDs · qty dossiers · lineage · exception routing · diagnostics)
  under carton identity / the middle work plane as a **"Show details"** / Level-1 collapse —
  that opens in **Displays** only.

## Station Action vs Context planes (ruled 2026-08-07)

**One domain SoT · two interaction planes** — never two inventory / exception stores.
Station Displays and desk inspectors read/write the same status machine, exception
facts, and inventory dossier fetch — they are different *planes*, not different
sources of truth.

| Plane | Surfaces | Job |
|---|---|---|
| **Action** | Unbox · Arrival · Testing · Pack · Shipping · Review centre work + `StationDisplaysPushStack` | Keyboard / wedge mutations on the *active* entity; dense horizontal fact rows |
| **Context** | History / Incoming / Unfound `LedgerGrid` + desk `RightRailHost` inspectors | Queue metrics, filters, lineage; mouse OK |

**Always**

- Domain writes stay shared: `transition`, `recordReceivingException`, inventory
  sync / PATCH, `useInventoryPoDossier` (Unbox Inventory Displays + desk Incoming
  `PoTab` compose the same modules).
- **Action Plane** = Station centre work + Displays on **every** scan station.
  Densify / keyboard primitives live in `src/components/station/displays/`
  (`StationDenseFactStrip` · `StationActionDossierShell` · `useStationActionKeyBindings`);
  station builders only register leaves — never fork a page-local Action shell.
  Unbox Inventory (`InventoryDisplayHost`) is the first leaf golden.
- Action key legends mount on Displays leaves — **not** `InspectorActionFloor`
  (desk Macro only).
- **Context Plane** = LedgerGrid identity / status / aggregate metrics / sync
  stamps. Full dossier editors (connection strip · PO notes · activity lists)
  stay out of primary table cells.
- Same-session scan may seize Action selection (`scanDriven` via `scan-apply.ts`)
  even if Context had a row highlighted in-session.
- Wedge dual-path: non-editable focus → global `useWedgeScanner`; editable
  (`input` / `textarea` / `select`) owns keys. Recovery: Insert (reclaim bar) ·
  **⌘.** (clear + arm next carton on `StationScanBar`) · `receiving-focus-scan`
  (dock-first while carton open) / station scan-focus loops. No hidden perpetual
  scan field; no steal-over-notes.
- **Active Action scan sink** (`src/lib/station-scan-sink/`): module store
  (Map + active-id ref — **not** React Context / never a `GridNavigationProvider`
  twin). After cancelable `wedge-scan`, `useGlobalWedgeScanner` calls
  `dispatchScanToActiveSink` before URL redirect. Unbox dock / serial + Testing
  under-row adder register as `po-line:${id}`; Pack / scan-out / Testing bars
  register station sinks. Mouse + ↑/↓ (`record-cursor` **sibling** scope on
  `PoLinesAccordion`) call `setActiveSinkId` + `receiving-focus-scan`. Carton
  hop stays chrome `ScanStationCartonCursor` / History `record` scope — not
  ambient ↑/↓ while the carton middle owns sibling.
- Floor → desk exception “handoff” today is a **durable fact**
  (`receiving_exceptions` / carton `exception_code` ± Zendesk claim) + navigate —
  not an exclusive edit lease. Do not paint fake “locked by…” UI without a domain
  lease.

**Never**

- Fork desk-only vs station-only domain APIs for the same PO / exception fact.
- Mount Station Displays on `RightRailHost`, or call Displays “inspector.”
- Per-station private Action densify forks when a shared `station/displays`
  primitive exists.
- Put the full Inventory dossier into the History data table as primary.

## Pack placement (Ready-to-Pack · packing desks)

Physical packing benches are **`locations` rows** with `location_kind` ∈
`DESK` \| `STAGING` under a packing `ROOM` — never a parallel `packing_stations`
table, never `staff_stations` (role enum) or browser `cf.workstation` as the
count SoT. Current place for a labeled outbound order =
`order_pack_placements` (+ `order_pack_placement_events`); domain module
`src/lib/packing/pack-placement.ts`. Current place for a loose serialized unit =
`unit_pack_placements` (+ events); domain module `unit-pack-placement.ts`.

- **Orders and units keep SEPARATE ledgers + counts** on the SAME benches — no
  double-count when a unit's parent order is also on a bench. Never merge them
  into one count without product sign-off (the polymorphic option).
- **Place** at Ready-to-Pack (armed station required): an order = tech TRACKING
  scan; a loose unit = a printed unit-id sticker scanned while a bench is armed.
- **Move** station↔station / →staging via `POST /api/orders/pack-placement/move`
  · `POST /api/units/pack-placement/move`.
- **Clear** on pack complete (`/api/pack/ship`) — the order clear
  (`clearOrderPackPlacement`) and each shipped unit's clear
  (`clearUnitPackPlacement`) run in the SAME transaction. Both counts already
  exclude off-floor statuses (`SHIPPED`/`SCRAPPED`/…), so the clear only removes
  the lingering row (returns false when nothing was staged).
- Counts feed Ready to Pack station KPIs — per-bench ORDER tiles **plus** a
  compact per-bench UNIT strip (`unit-bench-strip`, kept visually separate, no
  merged number) — and To-ship **At stations** (`?packPlaced=1` / `?packStation=`).
  Post-pack dock `PACKED_STAGED` is a different job.

## Scan vs desk right-edge — C2 thin waist (ruled 2026-08-09)

**Industry default for sellable warehouse-ops SaaS:** two distinct interaction
shells + a thin shared presentational waist + one domain ledger. Research:
[`docs/todo/scan-vs-desk-right-rail-separation-GEMINI-RESEARCH-BRIEFING.md`](././docs/todo/scan-vs-desk-right-rail-separation-GEMINI-RESEARCH-BRIEFING.md)
(ANSWERED — winner **C2**). Desk recipe: [`display/right-rail-inspector.md`](display/right-rail-inspector.md).

| Layer | Share / Fork / Never | Owner |
|---|---|---|
| Tokens · flush host pad · `DisplaysIndexLeafStage` · index row model | **Share** | `src/components/station/displays/` (+ desk adapter) |
| Domain status / capability APIs (`transition`, inventory dossier, exceptions) | **Share** | domain SoT modules |
| Read-only leaf modules (timeline · photo grid paint) | **Share** when pure | feature leaves |
| Mutating leaf modalities (scale read vs inline edit) | **Fork when divergent** | station vs desk hosts |
| Host shell · resize keys · chrome · action floors | **Fork** | `StationDisplaysPushStack` vs `RightRailHost` |
| AI occupancy | **Fork** | desk = `RIGHT_RAIL_PRIORITY`; station = yield Displays on assistant open |
| Visit-history stacks | **Fork** | station-only (`displays-visit-history.ts`); desk = Esc→index / URL |
| Dismiss / park keyboard chords | **Never share** | Station **⌘]** · desk **⌘\\** + bare **]** · Esc meanings differ |
| Operator nouns | **Never unify** | **Open displays** ≠ **Show inspector** |

**Principles (falsifiable)**

1. **Distinct interaction shells** — floor scan and desk triage never share one omni-container (`isStation` flags).
2. **Contextual keyboard handlers** — Esc / park / edge toggle bind per shell; wedge-safe on stations.
3. **Immutable work centers** — station middle stays locked (~720); desk center flexes under `MIN_WORK_SURFACE_PX`.
4. **Shared pure presentation** — index→leaf stage + tokens; no page-local twin of `DisplaysIndexLeafStage`.
5. **Queue spatial awareness** — desk inspector opens beside the grid (never a forced full-detail route for light triage).
6. **Uncluttered procedural focus** — AI must not compete for station Displays space during active capture.
7. **Domain logic universality** — same ledger / `transition` from both shells.
8. **Capability-driven modularity** — leaves compose capability modules; shells stay dumb.
9. **Asymmetric navigation stacks** — station visit history is local/transient; desk peeks may deep-link via URL.

**Ask-first:** any ask to make the station tool column parkable via the same Redux/store as the desk inspector, mount `StationDisplaysPushStack` on `RightRailHost`, or share Esc park semantics across hosts — stop and escalate (mode-error risk).

**Never**

- Merge hosts (C1) for DRY convenience.
- Share visit-history or dismiss chords “so they stay in sync.”
- Expect 1:1 UI propagation from Unbox Displays into every desk peek (DRY capabilities, not contexts).

## Right-rail modality (the detail slot)

- **The step cockpit — a Station Displays column MAY open by default and
  auto-select its leaf from the active procedure step** (ratified 2026-08-09,
  ahead of implementation — RFC:
  [`docs/todo/scan-station-cockpit-do-know-split-RFC.md`](././docs/todo/scan-station-cockpit-do-know-split-RFC.md);
  golden lands Phase 1 on Unbox). This is **not** the retired ambient region
  (below): it is the **same** `StationDisplaysPushColumn` — still exclusive,
  still operator-closable via `→|` / ⌘], still one of exactly two right-edge
  grammars — made **default-open and step-driven**. The distinction that keeps
  it legal: it is the picker's **own** edge showing the picker's **current
  step's** reference (manual · spec · position · one de-risking fact), **not** a
  second edge pinned beside the picker that outranks it. The work plane
  (centre + dock) keeps the **one armed action**; the rail is **single-purpose
  and auto-swaps per step** — an everything-in-the-rail noticeboard is banned.
  **Auto-follow yields to explicit close:** the rail opens / swaps on step
  advance, but an operator `→|` / ⌘] close stays closed until the next carton
  (same precedence as "do not fight a manual Displays close"). Opening the rail
  never steals the scan bar. The procedure **checklist** ("where am I") folds
  into this cockpit as a compact position header; the scan-progress **ring**
  stays the indicator + manual re-open. Contract:
  [`display/scan-cockpit.md`](display/scan-cockpit.md). **This evolves — does not reopen — the
  "no ambient always-on right-edge region" clause below:** the "no third
  grammar" half is untouched; what changes is that the existing Displays column
  may lead with the current step rather than waiting to be opened.
- **Every resident edge PUSHES. Nothing floats over the work surface.**
  (Ruled 2026-08-01, superseding "navigators push, inspectors float".) The left
  spine (`SidebarNavColumn` / MasterNav) is a **resident push column** — it
  dictates permanent workspace layout, so opening it moves the frame. The
  **left context-sidebar wrapper** is `ContextPanelLayout` (route rail beside the
  workspace — not the spine): every mounted rail is drag-resizable + collapsible
  via `CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE`. **Display dismiss** is
  `RailFilterCollapseButton` auto-seated by `TechRailSearchBar`
  `variant="rail"` under `ContextPanelCollapseProvider` (every recent-rail
  footer — Unbox · Triage · Testing · Shipping · Packer · Dashboard · …;
  LedgerDrill parent map passes explicit `trailingAction`); secondary gesture
  is drag-past-min on the trailing `HorizontalEdgeResizeHandle`
  (`edge: 'trailing'` — drag-only sash, no sash-top chevron). Parked: whole-strip click
  restores; top-of-strip mini scan cell (`CollapseStripScanCell` /
  `usePublishCollapseScan` from primary `StationScanBar`); mid-strip MRU pins
  default on every `SidebarRecentRailBase` (shell
  `usePublishCollapsePins`; selected pin = RailRow ring; Dashboard thin-wires
  the same channel) — pin select without expanding. Right-rail **record
  inspectors** are **non-modal flush push columns** (`modal={false}`): no inset
  card, no scrim, and the workspace reflows beside them rather than under them.

  **Width budget — both side rails stay open** (see **Frame column budget**).
  Ruled 2026-08-05: opening a right-edge panel must **not** ephemeral-mask or
  auto-close the left context rail. `resolveRightRailFrame` caps the right
  panel (`capPx`) against the **open** left cost so
  `left + MIN_WORK_SURFACE_PX + right ≤ frame`. The sunken center hugs that
  floor (station workbench lock ~720 + air). Width pressure never changes a
  desktop resident inspector into an overlay; when the arithmetic is tight the
  center constrains / scrolls in flow. MasterNav remains operator-owned
  (`SidebarNavColumn` never auto-closes).

  **IMPLEMENTED in `src/lib/right-rail/frame.ts` (`resolveRightRailFrame`, pure +
  unit-pinned).** There is no park-rail rung: `ContextPanelLayout` collapses
  only on the operator's own `CONTEXT_PANEL_COLLAPSE` preference. Cap is
  measured against the resting left (open card, or the 32px strip when the
  operator collapsed it), so a ceiling the operator drags against cannot assume
  a left rail that is still on screen.

  **The unconstrained-fit threshold is derived, not a breakpoint:**
  `MIN_WORK_SURFACE_PX` (784) +
  `RIGHT_RAIL_GUTTER_PX` (0 — flush planes, 2026-08-03) + detail min 360 =
  `RIGHT_RAIL_PUSH_MIN_FRAME_PX` **1144** content-row px (no left rail). Below
  that, the inspector still pushes; this number only identifies when both
  center floor and detail minimum can coexist without constraint beside a
  closed/absent left rail.
  *(Historical 2026-08-01 float-era arithmetic used gutters and read **1160** —
  do not reintroduce that number. Historical 2026-08-01…05 park-rail rung is
  retired — do not reintroduce `parkRail`.)* The floor is deliberately ONE
  static constant and **not** a per-lane `contentMinWidthRem`: on `/dashboard`
  that value is filtered by a `ResizeObserver` on the very scrollport the push
  narrows, so feeding it back would make the decision depend on its own outcome.

  **Why push (not float).** The float covered trailing grid columns whenever
  selection mounted the rail. Operators read the panel and the row together; a
  surface that covers the row it describes is the wrong trade. Keeping the left
  context rail open preserves scan/recents while the center hugs its lock.

  Mechanism is the **deliberate PUSH toggle** already sanctioned in
  `display/motion-crossfade.md` — tween (never a spring, which would rubber-band
  the width every sibling lays out against), fired by an explicit gesture, with
  fixed-width edge-anchored content inside an `overflow-hidden` host. Copy
  `SidebarNavColumn`'s recipe; do not invent a second one.

  Modal remains reserved for blocking wizards and destructive confirms
  (delete, …) — **not** Unbox Claim (station push, same family as Ticket).
- **Panel header grammar (ruled 2026-08-01; identity density 2026-08-01;
  chrome/context split 2026-08-05).** Every **record** right-panel occupant
  wears the same header outline (full recipe:
  [`display/right-rail-inspector.md`](display/right-rail-inspector.md)):
  - **Row 1 is chrome only** — `close · up · down` (and the queue
    `N / M` readout when a cursor is published). No contextual topic icons on
    this row. Omit the row entirely when the surface has neither dismiss nor
    prev/next (honest absence). Orders: `PaneHeaderActionBar iconOnly` with
    `onClose` / `onPrev` / `onNext` and empty `actions`. Incoming-family:
    `DeskRailChromeRow` without `.actions` (History golden).
  - **Row 2 is the contextual icon / topic-tab row.** Actions are icon-only
    (`PaneHeaderActionBar iconOnly`, which keeps each `label` as the
    `aria-label`). The action set is **contextual per occupant** (orders ≠
    incoming ≠ catalog-link) — pass a per-rail `PaneHeaderActionBarAction[]`;
    never hardcode one product's icons into the shell. **Never pass
    `onClose` / `onPrev` / `onNext` on the same ActionBar instance as
    contextual `actions`.** **Never a labelled button block that duplicates
    this row** elsewhere in the panel (the dashboard inspector shipped two red
    Delete buttons because the footer action set carried its own). A single
    **primary CTA** band in the footer (Link listing / Resolve / Save) is
    allowed; it is not a twin of the icon strip.
  - **Row 3 is dense identity** (`PaneHeaderLabel` short key). Optional legacy
    section tabs may follow identity.
  - **On the chrome row, the far right is `close · up · down`, in that order**
    (amended 2026-08-02; it read `up · down · close` until then) — dismiss
    LEADS the cluster, record prev/next follow. One right-aligned cluster, not
    split across two rows (and never mixed onto the contextual icon row).
    **Why close leads:** dismiss is the control an operator reaches for without
    looking, so it takes the **stable** end. Prev/next appear and disappear with
    the queue behind the record — a panel opened from search has no cursor at
    all — and a trailing close would shift under the cursor every time they did.
    **The HOST's singleton dismiss is an `X` in the TRAILING corner (ruled
    2026-08-19, superseding the top-left `ArrowRightToLine`).**
    `RightRailHostCloseAnchor` paints it at `absolute right-2 top-0`, and
    `DeskRailChromeRow` reserves the matching `h-7` / `w-7` cell at the END of its row.
    **Why the corner moved:** the leading corner is where every occupant's own
    chrome starts — index Back, the column-display `▦`, the contextual icon
    strip — so the singleton close permanently occupied the one cell each
    occupant wanted first, and each of them had to reserve a spacer for a
    control it does not own. The trailing corner is empty on every occupant and
    is where a dismiss is reached for without looking. **This is the HOST
    control only** — a panel-owned `PaneHeaderCloseButton` still defaults to
    `intent="push"` (`>|`, parked back against the edge) with
    `intent="dismiss"` for a pane that genuinely goes away.

  - **There is ONE closer, and it runs BOTH halves — `closeRightPanel`**
    (`src/lib/right-rail/close.ts`, ruled 2026-08-19). "Close" was two
    independent things: the **host lifecycle** (`closeAndCachePanel` — capture
    the draft, park the id, toast Resume) and the **occupant teardown** (the
    panel's own `onClose` — clear a multi-select scope, drop a URL param, flip
    a parent's `open`). The host fired only the first, so every occupant that
    needed the second **mounted a second close to reach it** — a footer `→|`
    beside a submit CTA on both Incoming intake overlays, a band `→|` on every
    batch rail. Two dismiss affordances, two behaviours, one non-modal column:
    on `detail:order-batch` the visible one cleared the selection and the
    corner one left the rows checked with nothing on screen saying so.
    `closeRightPanel` composes both (lifecycle first — `captureDraft` reads
    the live view's registered getter, so a teardown that unregisters it must
    come second), which is what makes the corner control correct everywhere and
    lets every panel-owned close be deleted. **A footer is for committing** —
    never a close beside the commit. Host `X`, scrim, and Esc
    (`usePanelStoreKeyboard`) all route through it; the assistant is the one
    occupant with no lifecycle half and goes straight to its own `onClose`.
    Guard: `right-rail-inspector-header.test.ts` → *"closeRightPanel is the ONE
    closer"* + the shrink-only *"no right-rail occupant mounts a close of its
    own"* list.
    **IMPLEMENTED as one control, not a per-header assembly:**
    `PaneHeaderActionBar` takes `onClose` and renders `PaneHeaderCloseButton` at
    the head of its trailing cluster, so the order is structural. Close sitting
    in the `rightSlot` of the row *above* prev/next is exactly how the two
    halves drifted — and how two headers came to swallow the prop.
    **Desk single-card Unbox-aligned chrome (ruled 2026-08-03):** when the rail
    wants `→|` top-left (Incoming family), compose
    `DeskRailChromeRow` — one in-flow flex row. Never mount
    `stationMoreDetailsPaneHostClass` inside a RightRailHost card (that absolute
    host is Unbox pane-only). Recipe: [`display/right-rail-inspector.md`](display/right-rail-inspector.md).
  - **A pane-anchored utility row carries only what the PANE owns** — the Unbox
    pane cluster is carton `↑ ↓` only, and there is **no dismiss and no progress
    ring in it**. The scan-progress ring lives on the Displays column top band
    (`StationDisplaysPushColumn` `headerRightSlot` via Displays `rightSlot`) — checklist
    entry while Displays is open; closed Displays opens via `←|` → Root Index.
    Do not remount a second ring under the dock or in the pane utility corner.
    - **`↑` is PREVIOUS, `↓` is NEXT** (aligned with left sidebar +
      `DeskRailChromeRow`, 2026-08-06). ArrowUp / ChevronUp steps **prev**
      (toward the top of the list); ArrowDown / ChevronDown steps **next**.
      Label, `aria-label`, testid and handler all follow the ACTION. The
      2026-08-02 station invert (`↑` = next) fought the rail keyboard and Desk
      chrome and is retired — one mapping everywhere.
  - **A push column's dismiss belongs to the COLUMN footer** (ruled 2026-08-07,
    amending 2026-08-02 top-left). `ReceivingDisplaysPushStack` seats `→|` as
    `TechRailSearchBar` `trailingAction` (left-rail collapse twin); closed
    `←|` seats in the utility-rail bottom footer. Top band is
    `[fullscreen] ……… [ring] [↑ ↓]` while Displays is open.
    - **What went wrong the first time:** the `→|` lived in the pane cluster and
      closed the whole **carton**, while its glyph (park to the right edge), its
      corner (the open column's) and its `railOpen` gating all said *collapse
      this panel*. Three signals against one behaviour is not a naming problem;
      an operator reaching for it lost their carton. The glyph was never the
      defect — it moved with the button and is still `ArrowRightToLine`.
    - **A hover-revealed control is not a dismiss.** The leading edge grip's
      collapse chevron is `opacity-0 group-hover:opacity-100`, so it does not
      exist until the pointer is already on the 8px sash. A non-modal push
      column has no scrim to click off, so it needs a **visible** one.
    - **The band is a real row, never an absolute float.** Three of the four
      occupants (`SupportTicketDetail`, `ReceivingClaimPanel`, the tool bodies)
      start their own chrome at y 0; only Displays ever reserved a band, and it
      reserved it for the cluster on the *other* side. Reserving in flow makes
      overlap impossible by construction — and retires the Displays strip's own
      `pt-9`, which would otherwise hold the band open twice.
    - **The band's `→|` sits on the occupant's CONTENT gutter, and it gets there
      OPTICALLY** — `UNBOX_PUSH_TOP_BAND` is `pl-2 pr-4`, not the `px-4` every
      other row in the column carries, and the Displays strip pays the same 8px
      (`DISPLAYS_STRIP_HEADER_CLASS` = `-ml-2 -mr-4`). Ruled 2026-08-02 on the
      third report that the `→|` "is still not on the left column", against an
      E2E that measured it as aligned and passed. **A box on the gutter is not a
      mark on the gutter:** an `sm` (28px) `IconButton` around a 14px glyph
      insets 7px and a lucide glyph draws ~2px inside its own viewBox, so the
      mark landed ~9px right of the gutter its box was sitting on, while a
      heading, an avatar or a card border puts ink AT it. Measured @1440 on a
      420px column (gutter 17): `→|` ink **25.0 → 17.0**; Claim's "FILE A CLAIM"
      17.0; Displays' card border 17.0. Both corrections are scale tokens, so
      they track `--cf-density`; `-ml-px` survives unchanged, reconciling the
      shell's 28px control with the strip's 26px cell.
      - **Why it only ever looked right on Displays.** Displays is the one
        occupant whose first row is *also* a glyph in a box — indented by the
        same 8px, so the two rows agreed with each other while both missed the
        card border beneath them. It is also the only occupant anyone measured,
        which is how a band in the SHARED shell shipped tuned to the single
        surface where the defect cancels. **Never align shared-shell chrome to
        one occupant** — reference the content gutter they all share.
      - **A hit box may bleed past the content edge; the mark the operator reads
        may not sit off it.** The button's box and the selected tab's
        `bg-surface-sunken` wash now overhang by 8px — the same trade `-mr-4`
        already made on the trailing side.
      - **The ⋮ and the ring can never share an INK column**, so do not "finish"
        this on the right. `MoreVertical` is a 3.5-unit dot column in a 24
        viewBox (ink 12.7 from the edge); the ring's glyph nearly fills its box
        (ink 7.0). They matched only as svg boxes, and the ring cannot move.
      - Pinned by `unbox-displays-column.spec.ts` → *"the shell band's dismiss
        sits on the occupant's own content gutter"*, which measures **ink**
        (`getBBox` less half the stroke, scaled) on **Claim, not Displays**.
        `getBoundingClientRect` on an `<svg>` is the element box and will
        report "aligned" for a mark you can see is not — that is what the older
        *"both header rows share the same left and right gutter columns"* test
        measures, and why it is not sufficient alone.
  - **The carton cursor is NOT rail-scoped** (same ruling). `up · down` step the
    **carton**, which is on screen whether or not a column is; they were gated
    only because they shared a component with the panel-shaped `→|`. The ring is
    ungated for its own reason — it is the toggle that OPENS the column, so
    gating it would make Displays unopenable. `railOpen` survives as ONE
    derivation, now feeding only the ring's hover-peek suppression (the parked
    ticket expand strip still does **not** count: it is a restore affordance,
    not an open rail).
  - **Unbox's carton dismiss is the identity bar's leading `◁`** —
    `CartonContextCard` `onExitToList` → `receiving-workspace-close`. It is
    permanent, it is the leftmost control on the pane, and it points back toward
    the list rather than off the right edge. `LineEditPanel` therefore takes no
    `onCloseCarton`; re-threading one is how the second, wrong-shaped
    carton-close appeared.
  - **Row 2 is dense identity** — `PaneHeaderLabel` (eyebrow = mode / entity
    kind; value = a **short durable key**: order id, item #, SKU, ticket #,
    tracking). Roles only (`text-role-eyebrow` / caption-density value).
    **Never a wrapping hero title** — full `product_title` / listing sentences /
    prose belong in the scroll **body** as fact rows. Never `text-role-title` /
    `text-role-display` / intake `<h2>` for rail identity.
  - **`SidebarIntakeFormShell` is forbidden on record inspectors.** That shell
    is create/import/prefs chrome (left-circle close + wrapping uppercase
    title). Review → Listing match once put a Bose product sentence in that
    title prop — the exact anti-pattern this law bans. Intake overlays
    (`detail:new-order`, Import eBay, FBA create, grid column display) keep
    the intake shell; the moment a rail opens a **picked row**, migrate to
    `PaneHeader`.
  - **The close control is mandatory and belongs to the panel.** A non-modal
    push column has no scrim to click off, so a header that omits it leaves
    Escape as the only dismiss. Two headers actively *swallowed* the prop
    (`ShippedDetailsHeader` did `void _onClose` behind a comment claiming
    "close lives on RightRailHost (backdrop / Esc)" — untrue since the flip), so
    the lanes operators actually work had no visible dismiss at all. Pass
    `onClose` to `PaneHeaderActionBar` (which composes `PaneHeaderCloseButton`);
    reach for the button directly only outside an action row.
  - **Desk order inspector is Unbox index→leaf, not an identity header.**
    `ShippedDetailsPanel` (`detail:order`) composes `DeskRailChromeRow` +
    `DeskInspectorIndexShell` (`buildOrderInspectorLeaves` /
    `order-inspector-topics.ts`) — chrome → index→leaf → flush body. No
    ORDER # identity row; Order leaf stacks Shipping + Product; Assign is an
    inline Display (`OrderAssignDisplayHost`), never a popover. Never
    `SectionTabsSlider density="icon"` as primary topic nav. The retired
    `RecordPaneHeader` identity ladder is gone.
  - **A destructive action belongs to the record's own control, never to the
    multi-select action set** that happens to have one row in it.
- **One owner:** `RightRailHost` is THE right details-panel wrapper — it renders
  exactly the top occupant of `src/lib/right-rail/store.ts`. Panels register via
  `useRegisterRightPanel` / `DetailStackRailRegistrar` and own **no** geometry.
  Never add a private `fixed right-0 z-panel w-[420px]` element — that is the
  exact bug the store exists to fix.
- **AI and record/ticket details share ONE right-edge slot (ruled 2026-08-03).**
  Header Sparkles opens the **assistant** occupant (`RIGHT_RAIL_PRIORITY.assistant`
  = 10). A picked record / ticket inspector is `detail` (= 100) and **outranks**
  the assistant — opening detail crossfades AI out; opening AI while detail (or a
  station Ticket push) is open means the ticket/detail **yields** (park strip /
  close occupant). Never mount AI as a second full-width column beside ticket
  details. Tabs or stacked sections **inside** one rail are allowed; dual right
  full columns are not. See **Frame column budget**.
- **Exactly TWO right-edge grammars exist, and there is no third.** Both push;
  they differ in SCOPE, not in whether the work surface reflows.
  1. **App push column** — a `RightRailHost` occupant. App-wide, one at a time
     (assistant **or** record detail — never both), pushing the work surface.
     The default for a picked record; AI uses the same slot at lower priority.
  2. **Station push column** — `StationDisplaysPushColumn`. Squeezes its own station's
     workbench in-flow, exclusive within that station, never a rail occupant.
     Unbox's Displays / Ticket / Claim / tool.

  **Station Ticket push and app AI still obey “one right details column” as a
  product law:** do not leave Unbox Ticket (or Claim) fully open beside an app
  AI column. When AI claims the app right edge, station ticket/detail chrome
  yields (park / close) the same way two `RightRailHost` occupants do. Station
  exclusivity (Ticket | Displays | Claim | tool) remains; it does not authorize
  a third full right pane next to AI.

  **There is no ambient, always-on right-edge region**, and one must not be
  rebuilt. One was built for the Unbox step procedure — `procedure-store.ts` +
  `RightRailProcedureRegion` + `useRegisterRightRailProcedure` +
  `UnboxProcedureRail` — and retired within the day.

  **The live checklist that replaced it is a DISPLAY, which is the whole point.**
  As of 2026-08-02 the Unbox procedure has two views: the work **focus deck** in
  the workbench centre (`UnboxProcedureDeck`) — **the primary, most prominent
  surface on the bench** — and the live **checklist** as a ring-only Displays
  body (`UnboxProcedureChecklist`). The deck owns visual weight (flat 40px faces
  + outline selection); the checklist is secondary navigation. Checklist opens from the
  Displays strip progress ring (`rightSlot`, right of ⋮ — not a Lucide strip cell)
  and shows a **selected face**
  while live. It is always-visible *because the operator opened that display*
  persisted* — it is not a region pinned beside the picker, it does not outrank
  it, and it is mutually exclusive with Ticket / Claim / tool like every other
  Displays tab. That is exactly the shape this section prescribes: *a surface
  that should stay visible while the operator works is a display the operator
  picks, not a second permanent consumer of the edge.* Do not "upgrade" it into
  a region or a `RightRailHost` occupant.

  Two views, ONE derivation: both read `useUnboxProcedureSteps`
  (`display/station-workbench.md`). The hazard was never two views — it was two
  derivations drifting.

  Why the door stays shut: `RightRailHost` renders exactly one occupant by
  construction (`getRightRailTop`), so a region pinned beside it is a *second*
  permanent consumer of the same edge — the multi-pane right edge the store's own
  docblock says it exists to prevent. It also re-opens, for every surface
  underneath, the question the exclusion list exists to answer: *which of these
  two things am I looking at?*

  **So: a surface that should stay visible while the operator works is a
  DISPLAY the operator picks (and which then persists), not a region that
  outranks the picker.** If a third grammar ever looks necessary, that is a
  signal the surface belongs in someone's display column — not that the edge
  needs another layer.
- **Modality is per occupant, `modal` defaults to `true`** so every existing panel keeps
  blocking behavior. Pass `modal={false}` for a non-modal **inspector**: no scrim, no
  `backdrop-blur`, no body scroll lock, `role="region"` + `ariaLabel` instead of
  `role="dialog" aria-modal`. That is the correct contract for a pick-a-row-and-edit-it
  surface — the operator's context (sibling rows, KPI strip, lifecycle tabs) is exactly
  what a scrim would hide. Reserve modal for surfaces that genuinely block until dismissed.
  Occupants that already float non-modally: **record inspectors** — dashboard
  order (`detail:order`), receiving details (`detail:receiving`, keep `elevated`
  so the card clears Unbox `z-panel` workspace overlays — elevated z without the
  scrim), Incoming (`detail:incoming`), repair claim (`detail:claim`), unfound
  queue (`detail:unfound`), FBA board (`detail:fba-plan`), SKU panel variant
  (`detail:sku:<sku>`), support context (`detail:support-context:<ticketId>`),
  the global open-store loading shell (`detail:global:<stackId>`), and the
  Testing bench box / kit workbenches (`box:<id>` / `manifest:<ref>`);
  **intake / import / progress planes** (`detail:new-order`,
  `detail:incoming-import-ebay`, `detail:order-sync`, `detail:incoming-sync`,
  `detail:inventory-sync` — same non-modal metric; Import popovers stay triggers
  only); **non-Unbox station tools** (`detail:receiving-audit`,
  `detail:photo-note`, `detail:move-photos` — the `*Rail` wrappers Testing /
  Triage / carton read / the photo gallery mount; Unbox mounts the same bodies on
  its push column instead). Receiving details
  also pass `closeOnOutsideClick` so an invisible dismiss layer restores click-off
  close without darkening; **every other non-modal occupant leaves that flag off** —
  the dismiss layer is `fixed inset-0`, so it would swallow the very sibling-row
  clicks the modality flip exists to keep live. A non-modal panel therefore owns
  an explicit close control in its own header (Escape on the host still works);
  do not ship one whose only dismiss was the scrim you just removed.
  **Ids are stable where row→row is the loop.** `detail:order`, `detail:incoming`,
  `detail:claim`, `detail:unfound` and `detail:fba-plan` are NOT keyed on the
  record: the host keys its `AnimatePresence` on the occupant id, so a per-record
  id plays exit→empty→enter on every arrow step. Preconditions in
  `display/motion-crossfade.md` (full re-seed on record change, dirty draft
  flushed for the OUTGOING record) — surfaces without a prev/next walk
  (`detail:sku`, `detail:support-context`, scan-opened `box:` / `manifest:`)
  keep per-entity ids. `detail:unfound` deliberately left the `detail:claim:`
  namespace it used to share with the repair inspector.
  **Unbox Displays, Ticket, Claim and tool** are not RightRailHost occupants —
  they are station-scoped **right-edge push** columns that all compose the one
  shared shell `StationDisplaysPushColumn` (`ReceivingDisplaysPushStack` /
  `ReceivingTicketStack` / `ReceivingClaimStack` / `ReceivingToolPushStack`),
  reusing detail-stack **surface** tokens (`DETAIL_STACK_ASIDE_SURFACE` /
  rounded inset card) while squeezing the Unbox workbench in-flow. A fifth
  hand-rolled aside is a fork — compose the shell.
  **One right-edge secondary surface at a time:** Displays, Ticket
  (`?ticketView=1`), Claim (`?claimView=1`), the tool push, and
  `detail:receiving` are mutually exclusive — opening any one clears/suspends
  the others; do not nest them as peers. Displays is **lowest precedence**: an
  exception surface (Claim / Ticket) or a just-launched tool outranks reference
  reading.   Displays opens/closes from the scan progress SoT
  (`ScanStationProgressControl` / `ScanStationProgressRing` — not `GoalRing`;
  Unbox adapts via `UnboxScanProgressControl`). The ring is the Displays strip
  **`rightSlot`** (same row, right of ⋮ — Unbox: `ReceivingDisplaysPushStack`);
  checklist stays `stripHidden` — **no Checklist Lucide strip cell**. Closed
  Displays opens via `←|`; do not remount a second ring under the dock. The old
  pairing-pencil `rightSlot` stays gone (Package Pairing is the `pairing`
  display itself — 2026-08-02; a tab's selected-ness IS its open state —
  `display/station-workbench.md`). Hover peek is off while Displays is open
  (strip mount); click opens/closes/switches `checklist`; selected face when
  checklist is showing.
  Ticket reopen is carton identity Reply / `?ticketView=1` — **no** parked
  right-edge expand strip (removed 2026-08-03; open Displays via `←|`, then the
  strip ring for checklist).
- **Do not "fix" a non-modal occupant by adding a focus trap.** The host has never
  installed one, so `aria-modal="true"` was a claim the DOM did not honor; non-modal
  markup is the honest form.
- **Non-modal occupants are resizable + parkable** via `DETAIL_STACK_RESIZE` /
  `DETAIL_STACK_COLLAPSE` + `useHorizontalEdgeResize` + `HorizontalEdgeResizeHandle`
  (`edge: 'leading'`, `placement: 'inset'` — hit sash inside the panel; 1px paint on
  the panel's own `border-l` seam / display hairline). **Never** `outset` on
  `RightRailHost` (that hung a second line into the work surface). The resize
  sash is drag-only — never a sash-top collapse chevron (Unbox Displays golden;
  park twins header `→|`).
  Park / reopen = header `→|` · Band 3 Show/Hide inspector · parked expand strip
  (`detailStackCollapseStripClassName` / `detail-inspector-expand`). The width cap is
  derived, not taste: viewport − (sidebar + the grid's own min content width). Modal
  occupants keep the fixed `DETAIL_STACK_LAYOUT.widthPx` (no resize/collapse strip).
  Station Displays push (`StationDisplaysPushColumn`) reuses the same resize grammar with
  station-scoped storage keys; hard stop is `STATION_PUSH_CENTER_FLOOR_PX` (720)
  via frame `capPx` (`UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX` = **0**). In-flow is
  `flex-1` (always fills leftover — sandwich invader); dismiss is the
  column-band `→|` (`StationDisplaysEdgeToggle`), not a sash chevron. Ticket
  reopen is carton identity Reply — no parked right-edge expand strip.
  **Flush planes (2026-08-03):** `TICKET_PUSH_HOST_PAD_CLASS` is empty; wide
  `StationDisplaysPushColumn` is coplanar (`DETAIL_STACK_PUSH_COLUMN_CLASS`) — no host
  `pr-2` / push `my-2` islands. Identity chrome is flush under GlobalHeader
  (`STATION_IDENTITY_INSET_TOP` = `top-0`) — same flush-planes ruling,
  not a twin of retired `CONTEXT_PANEL_OUTER_MARGIN*`. Never stack host `py-2`
  under that absolute identity bar.
- **A queue-processing inspector registers a STABLE occupant id** (`detail:order`,
  `detail:receiving` — not `detail:order:<id>` / `detail:receiving:<id>`) so
  record→record navigation swaps content in place instead of playing exit-then-enter
  with an empty slot between. See `display/motion-crossfade.md`. (Ticket / Claim
  are push, not rail occupant ids.)

## Printed code ↔ scan round-trip

```
        ENCODE                                  DECODE
   encodePrintMatrix  ─── printed symbol ───► routeScan
   @/lib/qr/platform-link                       @/lib/barcode-routing
```

- **One encoder.** `encodePrintMatrix` returns the three coupled decisions —
  `{ value, symbology, hri }` — for every printable matrix that leaves this
  app: `carton` · `unit` · `as_listed` · `ticket` · `location`. Nothing else
  decides any of the three. A kind that still encodes a bare handle carries an
  allowlist entry stating WHY (the path it would point at has no anonymous
  landing).
- **One ladder — every kind descends the same four rungs.** There is not a
  grammar per kind; there is one ladder and each kind falls as far as its
  facts allow.

  | Rung | Form | Reachable when |
  |---|---|---|
  | 1 | **GS1 Digital Link URI** — `https://{slug}…/01/{gtin}/21/{serial}` · `…/414/{gln}/254/{code}` | a **licensed** GS1 key **and** a tenant host |
  | 2 | GS1 element string — `(01)…(21)…` · `(414)…(254)…` | licensed key, no host |
  | 3 | Platform Digital Link — `https://{slug}…/m/r/{id}` | no GS1 key, but the path has an **anonymous landing** |
  | 4 | Bare handle / flat code — `R-1234` · `L-567` · `U-SN1` · `T-9395` · `A0101101` | otherwise |

  **Rung 1 is not reachable by wanting it.** A GS1 key is *licensed* to whoever
  holds its prefix, so minting one you do not hold is a false identity claim,
  not a placeholder — which is exactly what `DEFAULT_GLN = '0614141000005'`
  (GS1's own documentation GLN) did to every location label printed before
  2026-08-02. Cartons, receiving lines, tickets, handling units and
  un-licensed shelves therefore **cannot** be GS1 Digital Links; they are
  internal identities and they sit on rung 3 or 4. Closing that gap is a GS1
  Company Prefix purchase, not a refactor. **Do not "unify" the remaining kinds
  onto rung 1** — that is the borrowed-GLN bug with a nicer grammar.
  - **`unit` and `location` follow the ladder identically** (ratified
    2026-08-02): a licensed key + a slug promotes both to a real Digital Link
    URI; without a host both fall to the element string; without a licence
    location falls to the bare flat code. The location rung-1 form is
    byte-identical to what the pre-DataMatrix printer emitted, so the "legacy
    location URL" row of the wild-forms table is not a legacy form any more —
    it is the canonical licensed one.
  - **An internally-minted GTIN never leaves the tenant.** `sku_catalog.gtin`
    is lazily stamped by `generateInternalGtin` as `'02' + sku_catalog.id` +
    check digit — a GS1 **restricted-circulation number**, correct for an
    internal sticker and meaningless outside the warehouse. `gtinIdentifier` /
    `sgtinIdentifier` refuse it (`isRestrictedCirculationGtin`), because they
    render a GTIN as `https://id.gs1.org/01/…` — GS1's canonical resolver —
    and an RCN will never resolve there. **This is not the placeholder case:**
    a placeholder prefix belongs to another company (a false identity claim);
    an RCN collides with nobody and falsely claims only *global
    resolvability*. Same verdict, different reason — kept as two predicates so
    the reason survives. The predicate reads the prefix in **GTIN-13 space**
    (14 → drop the packaging indicator · 12/8 → zero-pad), or a legitimate
    case-pack GTIN-14 on indicator `2` would be refused as if it were an RCN.
    **The print ladder is deliberately NOT gated on this yet** — whether a unit
    label on the tenant's own host may stay at rung 1 with an RCN is an open
    ruling (`docs/todo/gs1-internal-gtin-rcn-HANDOFF.md` → F1); the form is
    pinned in `WILD_PAYLOAD_FORMS` as it behaves today either way.
  - **A Digital Link URI draws as plain `datamatrix`, never `gs1datamatrix`** —
    it is a URI, not an AI string, and bwip-js rejects a GS1-framed payload with
    no AIs (blank sticker).
  - **Rungs 3→4 turn on whether an anonymous phone lands somewhere.** A URL
    that bounces a visitor to `/signin` is worse than a handle, and costs
    matrix area on a small sticker.
  - `locationLabelPayload` is that guard's one wrinkle: it holds the
    licensed-GLN decision and is `export`ed **only** because
    `barcode-routing` cannot import `platform-link` back. It is the location
    case's private helper — a printer that calls it directly is a second
    encoder, and the guard fails.
- **One decoder.** `routeScan` turns any scanned / typed / pasted string into
  `{ type, value, redirect? }`. It is the only thing allowed to interpret a
  scan, on the client **and** inside `/api/scan/resolve` (whose own cascade
  must run `routeScan` FIRST — `classifyInput` has no location vocabulary and
  buckets a flat bin code as `serial_partial`).
- **The invariant that ties them: anything `encodePrintMatrix` can mint,
  `routeScan` must resolve to the right entity.** Pinned by **one table** —
  `WILD_PAYLOAD_FORMS` in `barcode-routing.test.ts`: every payload form this
  app has ever printed, its rung, its current encoder expression (or `null`
  when legacy-only), and its expected decode. Three tests derive from it —
  everything decodes · everything we still mint matches byte for byte · rung 1
  is GS1-only. **Extend that table; never write a second one.** A new `mint`
  with no row is an unpinned payload; a new row with no `mint` and no stated
  reason is a fork.
- **A form leaves the table only when the last sticker carrying it is off the
  racks — i.e. never.** Nothing is re-printed when the encoder changes, so the
  installed base is permanent. That is why the borrowed-GLN rows stay.
- **An input whose copy says "scan" decodes BEFORE it searches.** A printed
  sticker does not carry a bare handle — a carton carries
  `https://{slug}.app.cycleforge.ai/m/r/{id}`, a unit carries a GS1 Digital
  Link — so a field that regexes for `R-{id}` silently stopped accepting the
  thing this app prints. Compose the SoT unwraps, never a local parser:
  `scannedReceivingId` (carton) · `unwrapScannedSerial` (unit) ·
  `unwrapScannedLocation` (bin/rack) · `scannedUnitKey` (the strict
  camera gate). A box that says "scan" and cannot is worse than one that says
  "type" — fix the input or fix the copy.
- **Never break a payload form already in the wild.** Nothing is re-printed, so
  a warehouse full of stickers is the installed base — including the
  borrowed-GLN location labels (`0614141000005`) printed before 2026-08-02.
  Every removal needs a positive test that the old form still resolves.
- **The tenant's GS1 identity has ONE home: `organizations.settings.gs1`.**
  Server code resolves it with `resolveOrgGs1Identity`; the browser reads it
  with `useOrgGs1` (→ `GET /api/org/gs1`, gated `print.label`, **resolved**
  not raw). Admins edit it in Settings → Organization → Product identity
  (`Gs1ComplianceCard` → `PATCH /api/admin/organization/settings`, which
  refuses a placeholder prefix or a bad check digit through the same
  `gs1-keys.ts` predicates the ladder gates on). **Never give a surface its own
  GLN field.** Both label printers kept one in `localStorage` until
  2026-08-02, which made a licensed, company-level identifier a per-browser
  preference: two operators could print the same rack with different GLNs, and
  neither had to match the value the ladder actually encodes. Whether a tenant
  *needs* a key is a separate, GTIN-shaped question answered by
  `resolveGs1Requirement` over `settings.compliance` — a GLN is never part of
  that gate. Guard: `printer-gln-source.guard`
  (`src/components/barcode/printer-gln-source.test.ts`).
- **A per-SKU GTIN has ONE writable path and ONE gate.** `sku_catalog.gtin` is
  written by exactly two things: `getOrCreateInternalGtin`, which lazily mints
  the internal RCN, and `PATCH /api/sku-catalog/[id] { gtin }` →
  `setSkuCatalogGtin`, which is what an operator's entry lands in
  (`ProductGtinField` on `/products/sku/[sku]`, `sku_stock.manage`). It is
  deliberately **not** a column on `upsertSkuCatalog`: that helper is the sync
  path's COALESCE upsert, where omitted means preserve and clearing is
  impossible, so folding a licensed identifier in would put it one careless
  param away from being stamped by an inventory sync — and would make a wrong
  GTIN unremovable.
  - **`classifyGtinEntry` (`@/lib/interop/gs1-keys`) is the only gate**, and it
    runs on both sides — the field refuses a typo before the round trip, the
    route refuses anything that did not come through the field. Four rungs, in
    order: length → check digit → placeholder prefix → restricted circulation.
    Never a Zod regex beside it; that is a second, weaker copy of the answer.
  - **Clearing is a real action**, not a delete: `null` hands the row back to
    `getOrCreateInternalGtin`, which re-mints the same deterministic `02…`
    value. That is why the entry field refuses a typed RCN rather than storing
    it — the honest way back to the internal number is an empty box.
  - **The column is unique PER ORG** (`idx_sku_catalog_org_gtin`, 2026-08-02c),
    not globally. A GTIN names the PRODUCT, so two tenants selling the same
    item legitimately hold the same digits; the original global unique made the
    second one a violation. Nothing hit it while the only writer minted from
    the globally-unique `sku_catalog.id` — the collision becomes reachable
    exactly when a human can type a real GTIN. Same class as the
    `sku_catalog_sku_key` → `sku_catalog_org_sku_key` fix.
- **Never re-introduce a default GLN**, and never loosen `LOCATION_FLAT_RE`
  (`^[A-Z]\d{7,8}$`) — it is deliberately narrow so short legacy bin barcodes
  (`A12`, `B04`) keep their old, redirect-free behaviour. A `bin` route with no
  redirect is a GUESS, and callers must treat it as one.

## Nav search (type-to-jump)

- **One matcher.** `src/lib/nav/nav-search.ts` ranks the static nav registry:
  exact → prefix → word-prefix → substring → subsequence, multi-token AND, with
  highlight offsets. `nav-destinations.ts` flattens pages **and their modes**
  into the rows it ranks. The ⌘K palette and the spine both compose these — there
  were two divergent `includes` matchers before, disagreeing on both what was
  searchable and what came back.
- **A MODE is a destination.** `/products?view=qc` is a place. The spine used to
  match mode labels but could only render pages and sections, so typing a mode's
  name surfaced its parent — or its category.
- **Tree at rest, FLAT while searching.** A non-empty query switches the spine
  body to a ranked destination list with the parent (section for a page, page for
  a mode) as row metadata. Categories answer "what exists"; search answers "take
  me to what I named". Filtering the *category buttons* served neither — typing a
  page's exact name returned a section that did not contain the word.
- **Never highlight what did not match.** A keyword hit (href, section) carries
  no label ranges, and ranks below any label match of the same tier — a row that
  floats to the top with nothing marked is unexplainable.
- **This is NOT the cross-entity engine.** `hybridSearch` / `SearchHit` stays the
  SoT for orders / cartons / units. Nav search is ~40 static rows, no I/O, safe on
  every keystroke.
- Guards: `nav-search.test.ts` (the ladder) + `nav-destinations.test.ts` (the
  LIVE registry — the old defect was invisible to fixtures because matching
  worked and the renderer threw the answer away).

## GlobalHeader zones (pinned 2026-08-07 — nav left · actions right)

**Shell IA:** navigation on the left; actions on the far right. Cycle Forge
splits three zones left → right in `GlobalHeader`:

| Zone | Host | Slots (L→R) |
|---|---|---|
| **Nav** | `HEADER_ICON_CLUSTER` `data-header-zone="nav"` | toggle · Pins · Recents · **page** |
| **Context** | flex mid | page `panelContent` (may be empty) |
| **Actions** | `GlobalHeaderActions` `data-header-zone="actions"` | search · **pace-and-next** · inbox · **assistant** |

### Nav cluster

| # | Slot | Module | Face |
|---|---|---|---|
| 1 | Toggle | `SidebarCollapseControl` | icon (route-gated; also the collapsed-spine top-pin peek) |
| 2 | Pins | `HeaderPinsSwitcher` | icon → pin menu (`⌘/Ctrl+1–9`) |
| 3 | More recent | `HeaderRecentsSwitcher` | icon → up to `MAX_RECENT_PAGES` (5) prior displays |
| 4 | **Page identity** | `HeaderPageSwitcher` | **icon + display name**, always |

**Nav order is load-bearing.** Saved places → recent trail → **where I am**.
The page face is the only slot that is *never* empty and the only one carrying
words — it closes the nav cluster as the optical anchor. Pins / Recents /
page share only `HEADER_ICON_CLUSTER`'s `gap-0.5` (no divider /
`HEADER_CLUSTER_HAIRLINE`). **Never mount goal / work order / inbox / search /
assistant in this cluster.**

### Actions cluster (`GlobalHeaderActions`)

| # | Slot | Module | Face |
|---|---|---|---|
| 1 | Find | `GlobalHeaderSearch` | search field / icon |
| 2 | Pace and next | `HeaderGoalChip` | goal ring (or clipboard glyph / absent) |
| 3 | Be told | inbox `IconButton` | notifications badge |
| 4 | Ask | `GlobalHeaderAssistantButton` | Sparkles — **always far-right** |

**Corrected 2026-08-08 — pace-and-next belongs in Actions, between find and
inbox.** An earlier pass parked `HeaderGoalChip` in the nav cluster (and the
guard encoded that violation while the zone table said nav must never hold
goal). The ring is an action face — how is today going / what is next — not a
navigation landmark. Pins stay between toggle and Recents.

**Where "your next work order" went — the chip was deleted 2026-08-08, and its
ROW has had two homes since.** First the Inbox popover (`InboxNextWorkOrder`,
above `InboxQueueLinks`); then, later the same day, the panel of the header's
**pace-and-next** button, where it lives now. What has not changed across either
move is the thing the deletion was *for*: it is a **queue depth of one**, so it
does not earn a chrome slot of its own (see **Per-staff queue depths** above),
and it rendered *nothing at all* whenever the operator was already on the
record — a permanent slot spent to be conditionally invisible.

**`HeaderGoalChip` is one button for two questions** — "how is today going"
(the ring on its face) and "what is next" (the work-order row leading its
panel). They are adjacent questions an operator asks in the same breath, and
each control was thin alone: a bare ring with its counts in a tooltip, and an
icon with no count. **Sharing a button is not sharing a metric** — the row sits
beside the ring in the panel, never inside its arc.

- **The closed face tells the truth about what is behind it**: the ring when a
  goal exists; a clipboard glyph when there is no goal but a work order; nothing
  once both settle empty. A 0% ring on a day with no goal set would be chrome
  inventing a second story.
- **One corner mark, with precedence** — recurring-due (rose ping) outranks the
  work-order dot. Two marks on a 32px button is the same noise argument that
  rejected two rings in the header. The panel always shows both.

**The ring did NOT absorb the work order, and that ruling is unchanged.** A ring
encodes progress toward a target — a bounded fraction with a denominator. A work
order is a queue item and has none, so a ring would have to invent one.
`GoalRing` still means exactly one thing: this staffer's pace at one station
(today's scans vs the admin daily quota, or checklist ticks). Do not widen it.
Same reason the scan-station progress ring is a separate component — that
conflation is already the most-repeated mistake on this surface.

**The panel is flush-square** (`GOAL_PANEL_SHELL_CLASS`), and so is its chrome —
mode toggle, interval toggle, station rows, tone chip, progress bar. It was the
last soft `rounded-2xl` surface hanging off the top beam, and ops chrome is
zero-radius industrial (`kinetic-ledger.md`). `rounded-full` survives only on the
recurring-due status dot.

Assistant stays last — it opens the right-rail edge it owns. Clipboard / phone
QR / kiosk stay in spine ⋯ (frequency, not existence). Mobile keeps goal on
`MobileTopBar`.
- **The page face NEVER returns null.** `HeaderPageSwitcher` resolves identity
  from `SIDEBAR_PAGE_NAV` and falls back to `APP_SIDEBAR_NAV` for rows with no
  page-nav entry (Search, Chat, top pins). Modeful (≥2 children) → `Button`
  opening the menu; modeless → the **same** face as a static `span`. Both wear
  one `PAGE_FACE_CLASS` so the interactive and static faces are pixel-identical
  (`h-8` · `gap-1.5 px-2` · `text-role-caption font-medium`, mute from
  `HEADER_ICON_BTN_CLASS` / `text-text-muted` — same chrome token as Recents ·
  Pins · WO; never a local `text-text-default` fork). **Never fork a second face
  string, and never gate the face on `hasChildPages`** — the bug that motivated
  this: every scan station (Unbox, Arrival, Testing, Packing, Scan out) showed a
  nameless header because "nothing to switch" was implemented as "nothing to
  show". Switchability is a property of the menu, not of identity.
- **Station peers come from `stationSubgroupMembers`** (`sidebar-navigation.ts`,
  with `stationSubgroupOfPage` + `getStationSubgroupDef`) — the same selector
  `SidebarNavList` composes, so header and spine cannot disagree on the Receiving
  family. Menu rows navigate as first-class page ids (`menuNav: 'page'`).
  **The legacy `receiving` `SIDEBAR_PAGE_NAV` entry is deep-link compatibility
  only** — reading `getSidebarPageNav('receiving').children` for display is
  banned, and hardcoded family id lists (`RECEIVING_HEADER_FAMILY_IDS`) are gone.
  That list shipped Incoming (an inbound *desk*, not a bench) into a bench
  switcher; a subgroup selector cannot drift that way because membership is
  declared once, in the registry both surfaces read.
- **One menu chrome: `HeaderChromeMenu` + `HeaderChromeMenuItem`**
  (`header-chrome-menu.tsx`) — rounded card panel, `min-w-[11rem]`, icon + label
  rows, active = sunken fill + trailing `Check`. Page · Recents · Pins **all**
  compose it; a fourth header menu composes it too. **Never re-declare the panel
  classes locally** — three switchers had drifted radii, widths and row padding
  for one visual job.
- **Pins is a menu, not a strip.** One `IconButton` → sortable rows (`@dnd-kit`
  `verticalListSortingStrategy`) + "pin this page"; list order **is** the hotkey
  order, `⌘/Ctrl+1–9`, capped by `MAX_PIN_HOTKEY_SLOTS`. The chord and its hint
  share one module — `pinHotkeyLabel` / `pinSlotFromKeyboardEvent`
  (`src/lib/quick-access/pin-hotkeys.ts`) — so a label cannot advertise a chord
  the listener does not bind (same law as ⌘K below). `MAX_HEADER_PIN_ICONS` and
  the overflow menu are deleted: an icon strip spent cluster width on glyphs
  with no names, then hid the rest behind a second door, and reordering meant
  dragging inside chrome 8px tall.
- Durable pin SoT stays `staff_preferences.prefs.quickAccess` via
  `<QuickAccessSync/>` / `useQuickAccess`; never remount a pin list in the
  Quick Access or staff account menu.
-
  chrome-menu reuse · subgroup selectors · no legacy receiving read · assistant
  far-right) · (single chord owner) ·
  `pin-hotkeys.test.ts`.

## ⌘K has exactly one owner

`CommandBar` binds ⌘K / Ctrl+K; nothing else may bind it **or advertise it**.

- Three claimants shipped at once: `CommandBar`, `useQuickAccessHotkey` (gated on
  a `hotkey: 'cmdk'` setting that **defaulted on**, so one keypress opened the
  palette *and* the Quick Access menu — both `preventDefault`, so neither could
  yield), and `GlobalHeaderSearch`, which bound nothing yet rendered
  `label="Search (⌘K)"` over a chord that opened a different surface.
- **A false shortcut hint is worse than no hint** — it teaches a chord that does
  something else. The guard therefore pins both halves: one binding, no lying
  labels (tooltip / aria-label / `<kbd>`).
- **It fires from anywhere, text fields included.** The owner must NOT inspect
  the focused element. Standing a hotkey down while typing is the right rule for
  a BARE key (the user is producing that character) and the wrong one for a
  modifier chord — nobody types ⌘K, so there is nothing to yield to, and the
  bail made the palette dead exactly when an operator was mid-task in a field.
- A **suppressor** is allowed and is the opposite of a claimant: a modal with a
  focus trap may swallow the chord (`preventDefault` + `stopPropagation`, no
  action) so an ambient global cannot yank focus out — same rule as
  `overlay-stack/store.ts`. Allowlisted and asserted to really be suppressors.
-

## Clipboard history placement (D5 — decided 2026-08-02)

**The button stays in the spine ⋯ account overflow. The chord `⌘⇧V` was the
missing half.** Option A + D of `clipboard-history-home-HANDOFF.md`. Do not
re-litigate this a third time.

- **D5 as written ("clipboard history → command palette only") is REJECTED.**
  The palette is navigate-only by construction — every row in `CommandBar`
  resolves to `router.push(item.href)` — while a clipboard entry carries three
  actions (copy again · send to staff · clear) plus a staff-picker sub-flow.
  Same shape-mismatch that killed D3 and D8: the destination cannot host the
  thing being moved.
- **Industry precedent decided the placement, and it is unanimous.** Windows
  Clipboard History (`Win+V`) · Raycast · Alfred (`⌥⌘C`) · Paste (`⇧⌘V`) ·
  Maccy · Ditto — **none** puts clipboard history on a primary toolbar. It lives
  in the menu bar / system tray, paired with a hotkey; the icon serves
  discovery, the chord serves daily use. The ⋯ drawer **is** this app's menu
  bar, so the 2026-08-01 move was already correct and the drawer's
  "session-setup neighbourhood" is not a defect — a utility drawer does not sort
  utilities by kind.
- **A palette row (option B) is weaker than it looks.** Raycast is the precedent
  people reach for, but its clipboard command opens a rich list view *inside*
  the launcher — that is option C, an app-global contract change. A navigate-row
  that closes the palette to open a popover elsewhere is a mechanism no product
  ships, and it costs a click over the chord for the same discovery.
- **The binder is NOT the button, and that is load-bearing.**
  `StaffAccountFooter` mounts only from `SidebarNavList` inside
  `SidebarNavColumn`, which mounts lazily on FIRST open (`everOpened`) over an
  unpersisted `navOpen = useState(false)`. On a fresh page load that footer does
  not exist — so a chord bound there would be dead exactly when it is most
  useful. `ClipboardHistoryHost` is mounted app-wide instead.
- **One mount, one state, two triggers.** The footer no longer mounts the
  popover; it dispatches `CLIPBOARD_HISTORY_OPEN_EVENT`. Two mounts would mean
  two independent open states over one panel, and the footer's copy would be
  unreachable whenever the spine is closed. The panel pins bottom-left — where
  the spine footer sits when open — so both triggers land it in the same place.
- **This chord DOES stand down inside text fields — the opposite of ⌘K.** ⌘K has
  no native meaning, so its owner is forbidden from inspecting the focused
  element. `⌘⇧V` **is** paste-without-formatting in Chrome, Safari and most
  editors, so inside an editable element that meaning wins. Do not "fix" the
  asymmetry; it is the reason both rules are right.
- **The label is imported from the binder** (`CLIPBOARD_HISTORY_HOTKEY_LABEL`),
  never re-typed. Same rule as ⌘K: a false shortcut hint is worse than no hint.
- **Mobile is untouched** — its own anchored instance in `GlobalHeaderActions`
  stays, because it has no spine (no overflow) and no keyboard.
- **The store stays client-side.** `src/lib/clipboard-history.ts` is per-device
  by design. Nothing here promotes it; a route or any durable surface is a
  separate decision.

## Escape ownership (overlay stack)

- Source: `src/lib/overlay-stack/store.ts` + `useRegisterOverlay` / `useAnyOverlayOpen`.
- **The innermost open editor or overlay owns Escape** — not "any input". A text editor
  holds focus, so a typing-target test hides the bug; button/menu popovers do not.
- `AnchoredLayer` registers while open, which covers every house Popover / DropdownMenu /
  ContextMenu / cell editor / Calendar. A bespoke portaled overlay must register too.
- Ambient owners stand down while the stack is non-empty. **Capture-phase listeners are the
  hazard:** capture runs before bubble, and `stopPropagation` there stops the bubble
  listeners from ever running — which is how a queue-level Escape silently closed the
  inspector while the popover stayed on screen.

## Nav keys (leader-armed selection keyboard)

The one game-like keyboard-navigation waist — `src/lib/keyboard/nav-keys/`. Spec + phases:
[`docs/todo/nav-keys-selection-keyboard-HANDOFF.md`](././docs/todo/nav-keys-selection-keyboard-HANDOFF.md).

- **Grammar:** `⌘;` (leader) → **region key** → **stable single letter**. After the leader, keys are
  bare letters; ↑↓ still rove a focused list (they coexist — letters teleport, both commit through
  sync `commitArmed` — right-rail leaf/verb DOM paints in the same turn; no hit-marker withhold).
- **Three regions, one key namespace each** (`nav-regions.ts`): **Left `l`** (context rail) ·
  **Middle `m`** (scan bar + PO-line ledger + dock step CTA) · **Right `r`** (Station Displays index
  / inspector). Letters are unique WITHIN a region — `p` differs across regions. Spine + GlobalHeader
  are **not** regions (they own `⌘1-9` / the page switcher).
- **A target is ACTIONABLE; telemetry is not a target.** A nav target jumps you somewhere and does
  something — open a display, focus a line (Unbox ledger click → focus the matching dock step), fire
  a step CTA. **Display metrics — procedure %, usage KPI, vanity rings — are
  read-only and carry NO nav key**, wherever they sit. The Unbox action floor carries
  **one** compact procedure-% control (Band 2 right — `UnboxScanProgressControl`,
  opens the Checklist Displays leaf) and no vanity aggregate KPIs; that control is a
  click/hover control and carries **no** nav key. Checklist body lives in Displays.
  Never wire a metric as a jump target. (Instrument-panel
  telemetry-vs-action line — [`display/instrument-panel.md`](display/instrument-panel.md).)
- **Keymap** (`resolveNavKeymap`, pure): a target's **co-located declared `navKey`** wins when free
  (`DISPLAY_LEAF_NAV_KEY` for the Right leaves), else a deterministic fallback ladder. Dynamic data
  rows (the Left recent rail) declare no key — the resolver assigns them **positionally** in visible
  order. A per-region **uniqueness guard**  asserts declared keys
  never collide; register each new declared map there.
- **Reveal-on-arm only.** Keycaps (`NAV_KEY_HINT_CLASS`) show while a region is armed (leader **or**
  focus-within, for a focused list) and vanish on disarm — zero permanent per-row chrome.
- **Single owner + wedge safety.** `nav-leader-store` is the ONLY binder of `⌘;` (not one of the
  chord owners — ⌘K · ⌘B · ⌘] · ⌘\ · ⌘⇧V · ⌘1-9 · Escape · **⌘.**). Modifier leader (a wedge emits none) +
  `pushOverlay` while live (ambient keyboards yield) + refuse-in-input + Escape + ~1.5s timeout +
  pointerdown/blur cancel + **scan-burst detector** + unmapped-key exit. **Never binds bare digits.**
  (`nav-leader-store.test.ts`).
- **Station scan bar chords (ingestion vs dock).** `src/lib/scan-hotkey/` owns **Insert/F\***
  (focus + select — reclaim) and **⌘. / Ctrl+.** (clear + focus — **arm next carton scan** on the
  mounted `StationScanBar` stack). That stack is **sidebar ingestion** only. Mid-carton **procedure
  waist** is the dock Band 1 compact `w-8` scan cell (`UnboxDockScanEntry` / serial surface —
  always left, including beside photo Link\|Upload\|Send; collapse-strip twin, no placeholder).
  Focus stays on `receiving-focus-scan` / `⌘; m → s` —
  never overload ⌘. for the dock. Gap close-out:
  [`docs/todo/station-scan-bar-and-keyboard-gaps-HANDOFF.md`](././docs/todo/station-scan-bar-and-keyboard-gaps-HANDOFF.md).
- **Pointer claims keyboard region (focus feedback).** Click / pointerdown inside Station Displays arms **Right** (`keyboard-region-owner.ts` + `data-keyboard-region` / `data-keyboard-region-active`); the column paints an inset accent ring. While Right owns: **← → = Displays history** (Back/Forward keydown on `StationDisplayLeafHeader` — Back also paints a `<` button; Forward is **chord-only** since 2026-08-18, because a `>` twin sat disabled on nearly every frame), and Unbox middle procedure ← → **yields**. Pointer into the scan middle (`StationScanPaneHost`) reclaims **Middle**. Opening Displays seeds Right; closing returns Middle. Complements `list-key-scope` (↑↓ yield while column *open*) — open ≠ focused for horizontal keys.
- **Opt-in per region.** A consumer calls `useNavRegion({ id, targets, onCommit })` (nullable id =
  inert). Shipped consumers: **Right** (`StationDisplayIndexList` + Photos/Units/Linkage verb layer),
  **Left** (receiving recent rail via `SidebarRailShell` `navRegionId="left"`), **Middle** (Unbox
  Band 3 browse `f`/`r` via `UnboxWorkspaceHeader`; carton-open via `useUnboxMiddleCartonNav` —
  `UNBOX_MIDDLE_CARTON_NAV_KEY`). Never fork a page-local selection-keyboard twin.
- **Filtering is a nav TARGET, not a new chord (ruled 2026-08-08).** `⌘;` → `m` → `f` focuses the
  dominant find field; `r` opens the in-field Refine funnel. **`⌘F` and bare `/` were both
  rejected:** `/` because a printed Digital Link (`https://{slug}…/m/r/{id}`) makes a **wedge type
  it** mid-scan, and a second global binder because every chord here has exactly one owner — the
  ⌘K three-claimant incident is the precedent. `⌘K` stays the palette; GlobalHeader search is its
  own field. KPI collapse gets no key (display metric), and the inspector toggle gets none (it
  already owns ⌘\ + bare `]` — a third door onto one control is the duplication this registry
  exists to prevent).
- **`registerNavRegion` keys by region id**, so two live registrations of one region silently fight
  over the same letters. A host that shares a region passes `id: null` while the other owns it —
  Unbox Band 3 opts out while a carton covers the browse (it stays mounted, `visibility: hidden`).

## Typefaces + the weight cap

- **Three cuts, one face each.** `sans` = **Inter** (display/title/body/data/caption) ·
  `condensed` = **IBM Plex Sans Condensed** (eyebrow/micro) · `mono` = **IBM Plex Mono**
  (identifiers). Loaded in `src/lib/fonts.ts`, stacks in `typography/families.ts`, mirrored
  byte-for-byte in `styles/globals.css`. There is deliberately **no** `heading`/`display`/`label`
  slot — pick a ROLE, not a family.
- **The sans cut moved Plex → Inter (2026-08-02).** Dense rows live at 12–14px and Inter was drawn
  for screen UI at that size. A swap, not a second language: one sans face, same stack, same roles.
  Condensed + mono stayed Plex — Inter ships neither, and both cuts are load-bearing. The CSS var is
  `--font-cf-sans`, foundry-neutral on purpose so the name cannot outlive the choice.
- **Inter is a VARIABLE font — keep the discrete `weight: ['400','500','600']`.** Requesting it
  without a weight list ships the whole 100–900 axis, which makes a stray `font-bold` render at a
  real 700 and silently defeats the cap.
- **The condensed cut is bound to the role, not opted into.** `text-role-eyebrow` /
  `text-role-micro` carry `font-family: var(--ds-font-condensed)` from the CF Type plugin in
  `tailwind.config.mjs`, so 10–11px chrome stays legible without wrapping a grid column. Writing
  `font-condensed` by hand to narrow arbitrary text is the fork this binding exists to prevent.
- **600 is the hard ceiling** (`MAX_FONT_WEIGHT`). `font-bold` / `font-extrabold` / `font-black`
  are banned; the 700+ cuts are not loaded, so a stray one is synthesized faux-bold. Use
  `font-semibold`, or no weight class at all where the role bakes 600. Emphasis comes from color
  contrast and tracking. Genuine one-off: same-line `ds-allow-weight`.
- **Numerals:** `role-display`/`-title`/`-data` bind `tabular-nums` intrinsically (opt out with
  `proportional-nums`); the mono cut never ligates, so a serial is always retypable.
- Codemod:
  `scripts/codemods/cap-font-weight.mjs`. Printed media (`lib/print/**`, repair paper) is exempt —
  different substrate.

## Focus affordance

- Source: `src/design-system/tokens/focus-ring.ts` — `focusRing(archetype, tone)` returns a `cn`-ready
  class string. Archetypes: `field` (`:focus`), `control` (`:focus-visible` + offset), `wrapper`
  (`:focus-within`). Semantic tones: `accent`/`danger`/`warning`/`success`/`neutral`.
- Never hand-roll a `focus:ring-*`/`focus-visible:ring-*` recipe; compose `focusRing(..)`.

## Link triggers (the "attach an X to this record" button)

Reference: the Unbox unfound **Find ticket** action (`UnfoundMatchStrip`) → `TicketLinkPopover`.

- **Pin the trigger to the section header, not inside the swapping region.** A
  crossfading lane / tab body hides its own actions half the time — the Unbox
  action grid held "Find ticket" behind the default `order` lane, so the button
  did not exist at the one moment it was needed (the scan of an unfound carton).
  Header actions bleed their hit-box with `-my-*` (`ui-design-system.md` →
  eyebrow headers).
- **Seed the picker from the record in hand** (`TicketLinkPopover initialQuery`
  takes the carton's tracking number), and treat that seed as a **SEARCH TERM,
  never a typed id** — a 12-digit FedEx number parses as a ticket id, which
  rendered "Press Enter to link #382803670296" over a button that could only
  404. The id path switches back on when the operator edits the box.
- **Never substitute a different target for a typed id.**
  `resolveTicketIdForLink` used to fall back to "the sole unlinked candidate",
  so a seeded tracking number + a one-result search made Enter link an unrelated
  ticket. Pinned by `ticket-link-query.test.ts`.
- **The trigger stays neutral — it does not restate linked state.** Identity and
  unlink live on the entity-context header (`ReceivingTicketChip` in
  `StationContextBar`); a linked-looking trigger is a second place to read the
  same fact and a second place to keep in sync.
- **Route a receiving-anchored link through the receiving-gated endpoint.**
  `/api/support/tickets/link` and `/api/receiving/zendesk-claim/link` share the
  same `listCandidatesForAnchor` / `linkTicketToAnchor` waist and differ only in
  permission — `integrations.zendesk` is ADMIN_ONLY in `scripts/seed-roles.mjs`,
  so the support route 403s the floor operator these surfaces are built for.

## Paint content order (Tier-1 — ruled 2026-08-06)

Browser **paint / LCP order** is a product law, not only a Lighthouse handoff.
UX row anatomy (`title → meta → chips`) and motion cascade (cold chrome instant)
are separate; this section is what must appear in the HTML / first meaningful
paint on operator-critical floors.

Registry SoT: `src/lib/observability/tier1-paint-order.ts`. Marks:
`src/lib/observability/paint-timing.ts`. Attack plan + measurement:
[`docs/performance/HANDOFF-lcp-streaming.md`](././docs/performance/HANDOFF-lcp-streaming.md)
· [`docs/performance/LIGHTHOUSE.md`](././docs/performance/LIGHTHOUSE.md).

| Priority | Must paint | May wait |
|---|---|---|
| **P0 — Shell** | GlobalHeader + MasterNav spine + route geometry skeleton | — |
| **P1 — Primary work** | Station: scan bar + centre lines/label. Desk: workbench table / KPI geometry. Search: header find (+ browse/detail body) | Interactive grid hydration over an SSR stand-in |
| **P2 — Context** | Left context rail chrome (scan + recents shell) | Full recents fetch |
| **P3 — Trailing** | Displays topic **strip** chrome only | Active Displays **body** (Ticket · Photos · Timeline), desk inspector, AI |

**Hard rule:** the route’s **declared LCP surface** must never sit behind
`next/dynamic(.., { ssr: false })` without an SSR stand-in that owns first
paint. TanStack `HydrationBoundary` seeds alone do **not** move LCP while the
LCP element is gated behind `ssr: false` (verified 2026-07-20 on `/dashboard`).

**Always**

- Name the LCP surface in `TIER1_PAINT_ORDER` and stamp marks in P0→P3 order
  (`{route}:{chrome|primary|context|trailing}`).
- Prefer Packer-style RSC prefetch + dehydrate for P1 collections
  (`PackerSurfacePage` golden; To-ship `/shipping/orders` + Unbox spine follow).
- Keep Displays / inspector / AI topic **bodies** behind `dynamic` (P3) —
  strip labels stay in the initial tree.
- Protect CLS ≈ 0 and TBT; never strip Kinetic Ledger density for a score.

**Never**

- Put Ticket chat, Photos galleries, Timeline merges, or AI in the P1 paint path.
- Re-seed without an SSR-capable LCP element.
- Raise Lighthouse baselines or add Lighthouse to `npm run verify`.

## Optimistic URL-param paint (mount-gated opens)

Mount-gated URL opens (column / overlay / detail shell that only mounts when a
query key is present) must **paint before App Router soft-replace catches up**.
URL stays the durable SoT; UI value = pending until `useSearchParams` matches.

| Piece | Source |
|---|---|
| Pure resolve / clear / live seed | `src/lib/routing/optimistic-url-param.ts` |
| Scalar write lifecycle hook | `src/hooks/useOptimisticUrlParam.ts` |
| Consumers | Unbox Displays (`useUnboxDisplayView` domain snapshot + SoT resolve) · Outbound `open`/`new` · Search `sel` (`useSearchSelParam`) · Inventory `sidebar.open` |

**Paint-pending** (this row): UI = `resolveOptimisticParam(url, pending)`.
**Sync-guard** (different job — do **not** unify): UI is already local entity
state; refs suppress URL→entity reconcile (`useDashboardSelectedOrder`,
`useReceivingWorkspacePane`).

Param **isolation** (construct/parse ownership) stays in `route-params.ts` —
orthogonal to paint.

## Depth elevation (flat · raised · overlay)

- Source: `src/design-system/tokens/shadows.ts` — `elevationClass(role, intensity?)`.
  Industry role ladder (Atlassian / M3-aligned): role = interaction plane, not
  viewport position.
  - `flat` — flush with canvas (no lift); **default for work columns** (hairline /
    surface steps carry hierarchy)
  - `raised` — in-flow cards / panels; intensity `soft` (bookmark chrome) or
    `default` (glass work cards / **focus** surfaces only — e.g. procedure focus
    row). Do not raise every column shell.
  - `overlay` — floating UI (menus, popovers, dialogs, temporary docks) — **not**
    left/center/right work columns
- **Depth is planes, not floating gutters (ruled 2026-08-03).** Kinetic Ledger
  depth = surface steps (`bg-surface-canvas` → `sunken` → `card` → `strong`) +
  elevation roles + concentric nest (`nestedCorner` / `nestedCornerClass`) on
  **one shared ground**. Work columns are **exact/flush** push siblings on
  `appCanvasClass` / `CONTEXT_PANEL_HOST` — not decorative outer `m-*` islands
  between MasterNav · context · center · right. Outer gutters as a substitute for
  elevation is **floating card soup** / document whitespace and is banned (see
  Kinetic Ledger · **Frame column budget**).
- Depth needs a ground plane: `background-canvas` / `CONTEXT_PANEL_HOST` sits a
  real step below card white (light `#eef2f7` vs `#ffffff`). At the old ~2% delta
  the shadow had nothing to cast onto and every surface merged into one sheet.
  The host ground is load-bearing for the depth read — not decoration.
- Each role resolves to one `shadow-elev-*` utility (tailwind.config.mjs
  `theme.extend.boxShadow`) whose value is a themed CSS var `--ds-elev-*`
  (globals.css; dark-family themes ramp the alpha under
  `html[data-color-scheme='dark']`). Register any new name in the `shadow`
  group in `src/utils/_cn.ts` or twMerge misgroups it as shadow-COLOR.
- **Every role keeps a zero-offset AMBIENT layer** beside its key + cast layers.
  A purely downward shadow puts all its ink at the bottom edge, so a surface
  taller than the viewport (an ops grid with 200 rows) reads flat at the only
  edge still on screen — that was the 2026-07 Pending-grid depth bug. Keep the
  ambient layer when tuning, and never apply a `shadow-scrim/NN` color modifier
  to an elevation class: it rewrites every layer to one alpha and flattens the
  stack back to downward-only.
- Never hand-roll `shadow-* shadow-scrim/*` for these jobs; dial ink/spread only in the SoT.
- z-index remains separate (`tokens/z-index.ts`) — same elevation style can stack at different orders.

## Table definition registry (mount waist)

A Workbench spreadsheet mounts through the **table definition registry**, not a
page-local `*GridView` hand-wiring `LedgerGridSurface`. The engine
(`LedgerGridSurface` → `LedgerGrid`) is unchanged and remains the shell SoT;
what changed is who supplies the recipe.

| Concern | Source |
|---|---|
| Definition schema (Zod: columns · capabilities · shell recipe · prefs bucket · id) | `src/lib/tables/table-definition.ts` (`parseTableDefinition`; `superRefine` = frozen contiguous prefix · frozen ≠ hideable · ≤1 flex track · `MAX_DEFAULT_VISIBLE_TRACKS` = 10) |
| Definition + typed columns + `makeDescriptor` ref | `TableSurfaceBinding` (`src/components/tables/table-surface-binding.ts`) |
| The mount host | `NonlinearTableHost` (`src/components/tables/NonlinearTableHost.tsx`) |
| The registry (id → definition; `<family>.<view>`) | `src/components/tables/table-definition-registry.ts` |
| Per-family definition | `*-table-definition.ts` beside each descriptor |

- **Pages are bindings.** A page supplies feed + intents + the family's
  renderers; the shell recipe (`surface`), prefs bucket, aria name and column
  model resolve from the definition. Never a page-local `*GridView` twin for the
  same job.
- **The host takes a BINDING, not an id** — an id-keyed typed lookup would need a
  cast that guarantees nothing about `Row`. Ids are the enumeration/lookup key.
- **The definition owns the shell recipe;** `ariaLabel` / `testId` / `tableId`
  are host overrides for a shared parametric grid's per-mount *instance identity*
  (Testing History reuses `receiving.browse`; Orders' lanes each name
  themselves). `surface` is **not** overridable.
- **`parseTableDefinition` clones** — `definition.columns` is a validated
  snapshot, not an alias; the registry guard's deep-equal tests catch drift.
- **Domain cells stay per `entityFamily`** (`receiving-grid/cells/*`, …) — the
  registry never carries JSX. **AI may author Zod definitions only** — never cell
  JSX, DDL, or a new terminal status.
- **Guard-migration:** a guard asserting the retired mount literal
  (`<LedgerGridSurface … surface="sheet"`) re-points at `definition.surface` +
  a `<NonlinearTableHost binding={…}` assertion. Discovery regexes
  (`grid-surface-capabilities`, `grid-view-plumbing`) count `<NonlinearTableHost`;
  the host is in `grid-view-plumbing`'s `DS_OWN`.
- **Documented exceptions:** `StationListTable` / `FbaBoardTable` (no column
  model of their own) keep a declared capability bag without a definition.
  ids) · (every mount names a bag).

### Table engine fan-out (History first) — hard law

Unbox History (`ReceivingGridHost` · `entityFamily: receiving` · Sheets golden) is
the **only** dogfood surface for a new Workbench spreadsheet capability. Prove it
there; then port **one family at a time**.

| Do | Don't |
|---|---|
| Land custom columns / geometry / cell seams on History first | Fan out to Orders + Catalog + N queues in one change |
| Grow `CUSTOM_FIELD_LIVE_ENTITY_TYPES` when a family is ready | Hardcode `entityType === 'ORDER'` in APIs while bypassing the allowlist |
| Wire that family's host + list API **in the same PR** as the allowlist add | Leave half-wired mounts or API-only entities |
| Keep storage vocabulary (`CUSTOM_FIELD_ENTITY_TYPES` / CHECK) wider than live | Treat "schema knows ORDER" as "product mounts ORDER" |

**Why:** Porting before History is verified ships latent bugs across every outbound
lane and burns dogfood time on the wrong surface. The expensive miss (2026-08-09)
was Orders + Receiving custom fields in one wave — Orders was reverted; History
kept. Pattern-evolution corollary: expanding beyond the golden solely to migrate
siblings is Ask-first (`pattern-evolution.md`).

| Concern | Source |
|---|---|
| Live custom-field entities (product allowlist) | `CUSTOM_FIELD_LIVE_ENTITY_TYPES` / `isCustomFieldEntityLive` in `src/lib/custom-fields/types.ts` |
| tableId → entity (Create field door) | `customFieldEntityTypeForTableId` in `src/lib/custom-fields/table-entity.ts` |
| Guard (non-live mounts stay clean; live mounts stay wired) | |

## Ops table / spreadsheet surface shell

Two recipes, one module. **Pick CLIP vs SHEET by whether the grid is a raised
island inside gutters or a flush plane abutting the context rail** — not by row
count. Source: `src/design-system/tokens/table-surface.ts` + hosts in
`src/components/dashboard/workbench-shell.tsx`.

### Tokens

- `TABLE_SURFACE_CLASS` — `rounded-xl` + `border-border-soft` + `bg-surface-card` +
  `elevationClass('raised')`.
- `TABLE_SURFACE_CLIP_CLASS` — surface + `overflow-hidden` (**framed card** —
  clips airtable cell paints at the corner curve).
- `TABLE_SURFACE_SHEET_CLASS` — **flush Sheets plane**: hairline perimeter,
  `border-l-0` (context rail owns the abutting rule), no `rounded-xl`, no raised
  lift.
- `TABLE_FROZEN_HEADER_CLASS` — `bg-surface-card` frozen header (same plane as
  body rows; borders carry hierarchy — never `surface-strong`, which equals
  `border-subtle` in light and erases header grid).

### CLIP vs SHEET

| | **CLIP** (framed card) | **SHEET** (flush plane) |
|---|---|---|
| Shell | `TABLE_SURFACE_CLIP_CLASS` | `TABLE_SURFACE_SHEET_CLASS` |
| Body host | `WORKBENCH_BODY_COLUMN` (+ `WORKBENCH_TABLE_VIEWPORT` when bounded) | `WORKBENCH_SHEET_HOST` |
| Chrome host | `WORKBENCH_CHROME_COLUMN` (side gutters) | `WORKBENCH_SHEET_CHROME` (rail-abutting, no side pad) |
| When | Admin `DataTable`, any island still inside workbench gutters | Workbench spreadsheet flush to the context rail |
| Golden | Framed admin / legacy islands | **Unbox** (major SoT) · Incoming Pipeline · To-ship (`DashboardOrdersView` sheet chrome + `LedgerGridSurface` `surface="sheet"`) |

Never hand-roll `rounded-* border … shadow-*` / header fills / raw `p-0` gutters
for ops collection tables. Compose the hosts above — do not invent a twin.

### Sheets flush mount recipe (Unbox golden — major SoT)

1. **Chrome** — wrap tabs / KPI / triage in `WORKBENCH_SHEET_CHROME` with
   `flex flex-col gap-0`. Bands are rail-abutting: `border-l-0` / `rounded-none`
   (the context rail already owns the left hairline). Band 1 under GlobalHeader
   also uses `border-t-0` — GlobalHeader’s `TOP_CHROME_BAND_FACE` already owns
   that seam; a Band 1 `border-t` would double the joint. Do not wrap bands in
   `cornerClass('card')` islands or `WORKBENCH_CHROME_COLUMN` gutters.
   Consumers: **Unbox** (three bands — tabs · KPI · triage) · **Incoming
   Pipeline** (tabs · source facet · KPI) · To-ship `DashboardOrdersView`
   (three bands — tabs · KPI · find-only `OutboundTriageBand` + inspector
   View topics; Sheets click-select on `railSelection`).
2. **Body** — mount the grid in `WORKBENCH_SHEET_HOST` (no side/bottom pad).
3. **Surface** — `LedgerGridSurface` `surface="sheet"` (owns
   `TABLE_SURFACE_SHEET_CLASS`). Do not hand-compose the CLIP class beside it.
4. **One hairline per seam** — the **upper** band owns the bottom rule; the
   **lower** band owns no top. Unbox / To-ship: KPI row carries `border-b`;
   triage (`UnboxTriageBand` / `OutboundTriageBand` / `WorkbenchTriageBand`) is
   `border-r` only; the sheet keeps `border-t`. A triage `border-b` + sheet
   `border-t` would double the joint. Incoming: KPI band owns `border-b`; sheet
   keeps `border-t`.
   **Find-only Band 3 (Unbox History golden; To-ship twin 2026-08-05):**
   Dominant `TechRailSearchBar` (`min-w-0 flex-1`) + far-right Show/Hide
   inspector. Sheet refine / layout / KPI hide live on the pushing right
   inspector **View** topic cluster — never a Band 3 refine icon row.
   Detail: [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md).
5. **Column header band = `h-10`** — `LedgerGridColumnHeader` row / select /
   fact cells match Unbox chrome bands (`h-10` / 40px). Receiving leaf +
   summary rows share the same `h-10` so the frozen select header and the
   first body cells read as one rhythm. **Orders is the permanent allowlisted
   fork** (`OrdersQueueColumnHeader` `min-h-11`) — do not force it onto `h-10`.
6. **Freeze** — Unbox Sheets golden freezes **`select · order`** (`date` /
   `title` scroll). Incoming stays select-only. Operator-editable freeze (pin
   any column) is future. Full per-surface table: **Grid identity pane** above.

Airtable skin (`data-grid-skin="airtable"`): **BOTTOM-only** row rules
(`border-hairline` / `--cf-grid-line`) through **header and body** — no vertical
column rules (1B). Shell owns the outer perimeter. Structure recedes; data pops.

### Which table: `LedgerGrid` vs `DataTable`

Two families, one shell. **Pick by whether the surface is an ops queue**, not by row count:

- **`LedgerGridSurface` + a `GridSurfaceDescriptor`** — virtualized Workbench queues. Windowing,
  frozen identity pane, per-staff Fields, day bands, in-cell edit, multi-select.
- **`DataTable`** (`@/design-system/components/DataTable`) — the non-virtualized admin / settings /
  reports lifecycle list. Deliberately has **no** sort, selection, or pagination: the 15-file admin
  wave it exists for needs none of them (audited 2026-08-01), and adding them would make it a second,
  weaker grid.

`DataTable` rules:

- **It carries no `'use client'` — keep it that way.** Most consumers are React Server Components
  that ship zero client JS for their tables; a directive here (or a transitively client-only import
  like `SkeletonList`, which pulls framer-motion) puts every one behind a client boundary to render
  static rows. A caller that passes `onRowClick` is interactive and must be the client component
  itself. Guard: `DataTable.test.ts`.
- **Alignment derives from the column's `type`** through the same `resolveGridColumnAlign` the grids
  use — digit / price / date end, word / tag / id start. Never hand-type `text-right` inside `cell`; the
  explicit `align` prop is the declared exception (and owns `center`).
- **Answer both empty questions** — `emptyMessage` (nothing exists) vs `searchEmptyMessage` +
  `isSearching` (a filter excluded everything). Same contract as `LedgerGridSurface`.
- **Use `loading`, don't swap the table for a spinner** — it draws placeholder rows at the real
  column geometry so the page does not reflow when rows land.

## Spacing (density-aware scale + intents)

- Source: `src/design-system/tokens/spacing.mjs` → `theme.extend.spacing`; each step is
  `calc(rem × var(--cf-density, 1))` (typed re-export: `spacing.ts`). `extend` merges per key —
  a key not listed in `spacing.mjs` keeps Tailwind's static stock value; add new in-use keys there.
- Recurring padding jobs resolve via the Tier-2 intents (`inset-chip/field/cozy/card/empty`,
  `stack-tight/row/section`, `row-gap/tight` — tailwind.config.mjs plugin + safelist + `cn`
  `cf-*` groups, all pinned by the keystone test) or the `Stack`/`Inset`/`Row` primitives.
  An intent is the whole padding story for its element — never mix it with raw `p-*` there.
- Never hardcode arbitrary-px spacing.
  (escape: same-line `ds-allow-spacing`, reserved for safe-area / fixed-overlay geometry).

## Integrations: capability labels, gating, and tokens

- **Product surfaces speak capabilities, never vendor brands.** Operator copy uses either a generic
  capability noun ("Save to inventory", "Sync purchase orders") or the connected provider's display
  label resolved at runtime — never a hardcoded "Zoho / Zendesk / Ecwid / Gmail" product sentence.
- Label SoT: `src/lib/integrations/capability-labels.ts` (`capabilityNoun` / `capabilityTitle` /
  `providerCatalogLabel` / `integrationsHubHref` — client-safe). Org-aware resolution + feature
  gating: `src/lib/integrations/capability-connections.ts` (`isCapabilityConnected` /
  `connectedProviderLabel` — server-only). Capability vocabulary: `Capability` in
  `src/lib/integrations/connectors/types.ts`.
- Capability facades, not direct vendor imports, in product routes/services:
  `src/lib/integrations/inventory/` (`getInventoryProvider`) and `src/lib/integrations/helpdesk/`
  (`getHelpdeskProvider`). Vendor modules (`src/lib/zoho/**`, `src/lib/zendesk.ts`) are connector
  implementation detail behind them.
- Brand strings ARE allowed in: the Integrations card (`PROVIDER_CATALOG`), deep links into vendor
  web apps ("Open in Zoho"), platform/channel chips, permission LABELS (ids like
  `integrations.zoho` never rename), and admin cron/diagnostic category names.
- **Settings → Integrations is the only connect/disconnect surface.** Tokens live ONLY in the
  `organization_integrations` vault via `src/lib/integrations/credentials.ts`; never add a new
  token home or a new USAV env fallback branch.

## Source platform → label / tone

- Source: `src/lib/source-platform.ts` (`SOURCE_PLATFORM_OPTS` / `SOURCE_PLATFORM_LABELS` derive from it).
- Org catalog (`platforms` table) may override **label**, legacy Tailwind `tone`, and
  optional `color_hex` (`#RRGGBB`). Resolve via `usePlatformMeta` — never read the
  catalog row in a cell.
- When `color_hex` is set, paint **always** goes through `src/lib/color-contrast.ts`
  (`platformPaintFromHex` → accent / ink / softFill / softInk / border). Hex is
  allowed only at that SoT boundary (`ds-allow-hex`); never scatter in cells.
  Null `color_hex` → fall back to catalog `tone` class → builtin `SOURCE_PLATFORMS`.
- Platform-aware identity paint resolves through `platformMetaIconTone(meta)`:
  catalog `accentHex` → contrast-safe inline paint, else `meta.text`, else the
  identifier's neutral design-system tone. The platform mark and order `#`
  consume that same result; never add a surface-local platform-color map.
- Dense Sheets brand-identity fill resolves through `platformMetaBrandDot(meta)`
  (registry `dot` / catalog accent) and `carrierBrandDotPaint` — leading
  `BrandIdentityDot` beside quiet order/tracking faces; not a lifecycle status.
- Carriers are a separate SoT (`carrier-brand.ts`) and are **not** tenant-overridable
  (UPS stays brown, FedEx stays purple — operators match physical labels).
- Receiving type faces: `src/lib/receiving/receiving-type-meta.ts` (+ `ReceivingTypeMark`).
- Urgency / priority is a priority-tier picker on `receiving.priority_tier`; SoT is `src/lib/receiving/priority-override.ts`
  (`is_priority` = synced tier-0).

## Copy-chip / serial display

- Three layers: pure helpers in `src/lib/copy-chip-format.ts`; behavior in `useCopyChip` / `useChipTooltip` (`@/hooks`);
  `CHIP_TONES` tone registry in `CopyChip.tsx` (incl. `price` → emerald **Receipt** for unit cost). **Quiet faces** — tone is
  icon + mono + click-to-copy; no bottom underline rule. Focused face: **click · ⌘/Ctrl+C · right-click**
  all copy the full value (right-click is secondary copy, not a full menu — Open/Edit stay on hover menus).
- **Dense-table hover menus** (`CopyChipHoverMenu` / `TrackingNumberMenuChip` /
  `OrderNumberMenuChip`) open **beside** the chip via `clampPortalSideMenuPosition`
  (prefer trailing/right, flip left, top-align) — never below in the vertical
  row-scan path. Full-ID `SiteTooltip` stays above (`pointer-events-none`) and
  paints **immediately** (no enter fade / layout tween — ops density). Tip + menu
  shells are **flush-square** (`cornerClass('flush')`) — floating is not a soft-
  radius escape.
  `portal-anchor.test.ts`.
- Plain extractable cells (catalog SKU, bin barcode, …) use `CopyableCellValue` (same `useCopyChip` ritual;
  full-string face). Product-hub `CopyableId` re-exports it.
- Selection → sheet paste: `toTsvBlock` + per-family formatters in `src/lib/station/format-station-copy-row.ts`
  (Tech/Packer history, bins bulk bar, catalog bulk bar).
- Condition meta chips use `ConditionGradeChip` → `src/lib/condition-tone.ts` for per-grade **icon** hue.
- `resolveSerialDisplay` / `resolveChipDisplay` are the label SoT for serials/chips.
- Display preview is **last-8** (`CHIP_DISPLAY_LEN` / `getLast8` / `getLast8Serial`).
  **LedgerGrid / queue sheets:** empty id-chip face is the quiet em dash `—` (same
  family as `GridCellDash`) — never loud `--------` (2B). Non-grid layouts that still
  need an 8-char width-matching placeholder may keep `EMPTY_CHIP_DISPLAY` narrowly.
- **Stacked row identity** — when a list / picker / subject / **narrow drill-parent**
  row's scannable string is a **long title** (ticket subject, product name, sheet
  exception line, History PO product) and the durable handles are typed ids,
  compose `StackedRowIdentity`: **title on row 1, typed `CopyChip` keys on row 2**.
  Join keys with `joinStackedIdentityKeys` / `StackedIdentityKeySep` (qty · order
  last-8 · tracking last-8) — never a local `metaSep` twin. Full-width LedgerGrid
  sheets keep column anatomy; this is the **small-width two-row** twin. Golden
  consumers: Unbox History / Orders `LedgerDrillParentMap` (shell owns the stack;
  adapters own key content), Move photos carton targets, Orders import sync rows
  (`OrderSyncDialog` `SyncListRow`), Support ticket subject + `SupportTicketIdMark`,
  Support zendesk queue `SupportTicketRow` (`TicketPickRow`), inventory Pulse sidebar,
  Unfound match suggest/found identity, FBA `FbaSelectedLineRow`, repair kiosk /
  staff `ProductSelector` selected-product tray, carton-add `ResultRow`, mobile
  packing / carton / testing sheet headers, **multi-select batch rosters**
  (`RailSelectionRoster` — **titles wrap**, never truncate; order/PO keys carry
  `platformLabel` + `platformMetaIconTone` on the `#` glyph). **Ticket pick /
  link lists** compose the thin `TicketPickRow` on top of it (subject →
  `TicketChip`) — shared `TicketPicker`, `TicketLinkPopover`, Warranty
  link-existing, zendesk `ClaimTicketPicker`. GlobalHeader inbox keeps
  `CompactActivityRow` for the activity frame, but tech-queue ready/return meta
  paints the same `joinStackedIdentityKeys` + `OrderIdChip` / `TrackingChip`
  strip. **Never** trail or lead a mono `#{id}` on the subject row — that steals
  width from the title and invents a third identity grammar beside this stack and
  the rail `PaneHeaderLabel` short key. **Never** hand-roll `flex-col` title +
  meta inside drill maps / pick trays / mobile sheet headers.
- **Compact activity row** — dense ops / activity feeds where staff scan
  **what · state · age**, not copy ids. Compose `CompactActivityRow` (leading
  status mark + trailing `formatLaneAgeCompact` age on the shared rail tracks) +
  `RailRowBody` (title + **one** meta fact — qty `1/1`, `Ready`, `Needs test`).
  Golden: station recent rails (`RailRow`). Portable: GlobalHeader inbox
  (`ActivityInboxPopover`). Age is always compact (`4h` / `30m` / `3d`) — never
  `formatDistanceToNow` / `4 hrs ago`. Leading mark is a status **dot**, never a
  large kind glyph (truck / wrench). Meta is one scannable fact, never a
  tone-pill parade — identity chips on tech-queue ready/return rows still come
  from the StackedRowIdentity key grammar (`joinStackedIdentityKeys` + CopyChip),
  not mono prose. Ephemeral actions (dismiss · undo) may overlay the age column on
  hover — they must not invent a second permanent right column.
- **Platform-aware order / PO identity tooltip:** when source platform is known,
  the hover value is `formatPlatformTooltipLabel(fullId, resolvedMeta.label)` —
  e.g. `eBay 08-14924-82211` — exactly as tracking uses
  `formatTrackingTooltipLabel` (`USPS 9214…`). `CopyChip` / `OrderIdChip` /
  `PoChip` receive the catalog-resolved `platformLabel`; the visible face remains
  last-8 and copy writes the **bare full identifier**, never the prefixed label.
  Unknown / unbound platform keeps the bare identifier and neutral icon. Never
  concatenate a raw platform slug or reproduce this formatter in a view.
- **Brand identity dots (dense Sheets):** when Unbox History / receiving grid
  omits the leading `#` / MapPin (`plain` / `omitCellIcon`), a leading
  `BrandIdentityDot` (`h-1.5`) carries platform / carrier paint via
  `platformMetaBrandDot` / `carrierBrandDotPaint` — same SoT ladder as glyph
  tint, not a lifecycle status. Lifecycle / workflow dots stay **only** inside
  the Status column (`GridStatusCellValue`). Never put `statusDot` /
  `getStatusDotBg` in an identity cell.
- Filled carrier tracking in order identity and inbound LedgerGrid TRACK cells
  (`OrderIdentityChips`, Incoming / Receiving TRACK columns,
  `ReceivingIdentityChips`) is `TrackingNumberMenuChip` — primary copy; hover
  **Open** · **Edit** (dense carton IdentityLinkChip verbs). Edit opens the
  record inspector (orders → `detail:order` Shipping replace; inbound → row
  details). Never clipboard-steals. Plain `TrackingChip` remains for read-only
  / non-grid surfaces.
- Filled Unbox History / Receiving ORDER cells use `OrderNumberMenuChip` — same
  hover **Open** · **Edit** verbs as TRACK. Open resolves via
  `resolveReceivingOrderOpenUrl` (carton `listing_url` product link first, else
  `marketplaceOrderUrl`); Edit opens the row inspector. Never clipboard-steals.
  Plain `OrderIdChip` remains for read-only / non-menu surfaces.
- **Tracking mark paint:** known carriers use `CarrierMark` + native brand hex from
  `src/lib/carrier-brand.ts` (UPS brown · FedEx purple · USPS light postal blue · …) for peripheral
  ID; Unknown keeps house blue MapPin via `CHIP_TONES.tracking`. Hex lives only in that
  SoT (`ds-allow-hex`); never scatter in cells. **Never org-customizable** — carrier
  colors are universal real-world marks. Marketplace `SOURCE_PLATFORMS` / `platforms.color_hex`
  ≠ carriers. Dense tracking faces without MapPin use `carrierBrandDotPaint` for the
  leading brand-identity dot.
- **Open tracking URL** = `resolveTrackingOpenUrl(tracking, knownCarrier?)` in
  `src/lib/tracking-format.ts` — stored/label carrier → local pattern detect →
  official carrier deep link; never Google (unknown → Open disabled).

## Note vs label grain (per line item)

Receiving carries four note-shaped fields. They are four **different grains**, and
the two that live closest together were one column until 2026-07-31.

| Field | Grain | Printed? | Written by |
|---|---|---|---|
| `receiving_line.notes` | **line item** | Unbox overview live center (preview + Print · Receive); still the Zoho/receive note | notes dock (`LineNotesCard` → `OmnichannelComposerDock`) — patches `notes` only |
| `receiving_line.label_note` | **line item** | yes — durable face center (Testing reprint, LabelEditPopover) | label editor (`LabelEditPopover`, As Listed); also stamped from dock text on Unbox carton print |
| `receiving_line.zoho_notes` | line item | no | zoho sync (read-only import) |
| `receiving.zoho_notes` / `.support_notes` | PO header / carton | no | PO sync / carton ops |

- **The split is PER LINE ITEM, and stays there.** A carton's face is printed
  *from a line*, so on a multi-line PO each line carries its own note and its own
  printed text. **Never hoist `label_note` to `receiving`** to "fix" that
  ambiguity — a carton-level label note would force every line on a PO to print
  the same face, which is the opposite of the grain this split exists to express.
  A carton-wide remark belongs in `receiving.support_notes`.
- **Why they were split** (`2026-07-31b_receiving_lines_label_note.sql`): one
  buffer doing both jobs meant an operator could not record anything about an
  item without it appearing on the sticker, and could not re-word a label
  without rewriting the record's note. The migration backfills
  `label_note := notes`, so pre-split cartons reprint a byte-identical face; the
  two diverge from the first edit onward.
- **Unbox overview live center (2026-08-04):** the dock draft (`itemNote`) is the
  live source for the carton face center on overview preview and Print · Receive
  (`liveCartonPayload.notes = itemNote`). The notes composer still patches
  `notes` only; on successful carton print the controller stamps
  `label_note` from that draft so Testing / reprint / LabelEditPopover stay
  aligned. LabelEditPopover still owns durable `label_note` fine-tuning;
  overview display continues to prefer the dock draft. Preview stays
  flash-free via `patchLabelFaceDocument` in `LabelFacePreview` (text slots
  mutate in place — no `srcDoc` rewrite per keystroke).
- **Neither composer writes the other's column on save.** The notes dock
  patches `notes` only; the label editor patches `label_note` only. Print-time
  stamp of `label_note` from the dock draft is the one allowed bridge.
  Testing still seeds the carton face from `row.label_note`.
- **Ticket replies are a third job.** Station Ticket Displays (Unbox + Testing)
  keep Internal/Public reply **inline in the right panel** via
  `SupportTicketDetail` — they must not replace the middle carton-notes dock.
  Support service workspace may own a floating ticket composer only when the
  ticket is the work entity.
- **Receive / push-to-PO carries the item note**, never a print-only
  LabelEditPopover edit that never hit the dock: a pure print artifact must
  not travel to Zoho.
- **Grain must be legible in the picker**, not inferred from a kind's name —
  resolve it with `workspaceLabelGrainLabel(kind)` (table row above), never a
  hand-typed string.
- **A receive may SET the item note, never CLEAR one it was not given** —
  `notes = COALESCE($n, notes)` in every receive-side writer. The mobile QA
  sheet's Pass-all posts `notes: null`, so a bare `SET notes = $1` erased the
  desktop operator's note on every phone-side pass.
- **A QA fail REASON is not a note.** It is a code from the QA-fail slice
  (`QA_FAIL_EXCEPTION_STATUS` in `src/lib/receiving/exception-codes.ts` —
  `DEFECTIVE` · `DAMAGED` · `INCOMPLETE`), sent as `exception_code` via
  `qa-fail-reason-wire.ts`, landing in `receiving_exceptions`. It also **decides
  the `qa_status`** the receive writes — the sheet used to hardcode
  `FAILED_FUNCTIONAL` and carry the real reason as prose, so the column built to
  tell a dead unit from a damaged one could not. `mark-received` 400s an
  unrecognized code and 400s a body whose `qa_status` contradicts the code.
  There is deliberately **no free-text sibling** (`ReasonChipPicker`'s contract).
-
  (wiring) + `src/lib/print/workspace-label-kinds.test.ts` (faces + grain) +
  `tests/e2e/receiving-note-label-grain.spec.ts` (both composers in a browser,
  on the QA org).

## Unboxed ≠ Received (Received noun · Qty tips · status dots)

Same English word, two jobs. Floor unit count is not inventory confirmation.

| Operator noun / surface | Means | Source |
|---|---|---|
| **Unboxed** | Floor work done; inventory confirm still pending | Coarse `UNBOXED` / `workflow_status`; tip `unboxed-sync-tooltip.ts` |
| **Received** (rail meter label) | Inventory integration confirmed, or local-only done | `isOperatorReceived` → `inventoryReceivedDisplayQty` |
| **Qty** (grids · PO-line progress) | Floor units counted | Show floor fraction; tip via `floorQtyFractionTip` (**counted**, never "received") |
| Status-dot emerald | Terminal Received / Passed | `getStatusDotBg` — stage only; never qty-complete shortcut |

- **Do:** Every UI labeled **Received** (sidebar row qty + hover progress meter) goes
  through `inventoryReceivedDisplayQty` / `RAIL_QTY.received` (and `unfound`, which
  shares that gate) in `src/lib/receiving/rail/quantity.tsx`. Feeds compose
  `RAIL_QTY` via `ReceivingFeedRail`; the popover reads only `getQty(row)`.
- **Do:** While still Unboxed (not `isOperatorReceived`), paint **`0 / expected`**
  and an **empty** bar on Received meters — even when `quantity_received` already
  counts floor units.
- **Do:** `GridQtyFractionValue` default tip = `floorQtyFractionTip` (counted).
  Interactive Unbox qty = `ProgressBadge` (counted copy); triage/read-only =
  `ScannedBadge` (door scan = expected/expected) — never swap them.
- **Do:** Status-dot emerald only for PASSED / DONE (and terminal dispositions
  stay rose/purple/slate). UNBOXED at floor 1/1 stays indigo.
- **Never:** Wire raw `row.quantity_received` into a Received-labeled meter.
- **Never:** Tip or badge copy that says "received" for floor qty; never paint
  emerald from qty-complete while still Unboxed.
- **Never:** "Fix" Unboxed looking complete with blue bars, fill caps, or muted
  greens while still showing floor `1/1` under Received — change the **number**,
  not the cosmetics.
-
  meter) ·
  (Qty tip · Scanned vs Progress · status-dot).

## Cross-entity urgency (one entry point, binary rung)

"Urgent" was **four** unrelated mechanisms wearing one word, with four write
paths and nothing reconciling them — and two of them are still called
*priority* while meaning different things:

| Record | Storage | Its own scale |
|---|---|---|
| Order | `orders.is_urgent` | — (a genuine boolean) |
| Carton | `receiving_carton.priority_tier` (0) **+** `.is_priority` | 4 manual tiers — `receiving/priority-override.ts` |
| Support ticket | helpdesk `priority` | `low \| normal \| high \| urgent` |
| Order **row tint** | `order_flags.flag = 'priority'` | **not urgency** — see below |

`src/lib/urgency/` is the one entry point for the **cross-entity intent**: a
caller holding an `(entityType, entityId)` it did not choose — a resolved scan,
a thrown task, a bulk triage action — that wants the record urgent without
knowing which storage that means. `promoteUrgency(orgId, { entityType, entityId, level? })`.

- **The shared rung is BINARY (`urgent | normal`) and stays binary.** It is the
  only level all three storages genuinely share. Widening to four is the
  obvious next idea and the wrong one: `orders.is_urgent` has two states, so
  three of four values would be a lie on every order, and a cross-entity caller
  would need to know which types honour which level — exactly the knowledge
  this module exists to hold for them. A record needing its full scale reaches
  for its own module.
- **Every write is COMPARE-AND-SET**, for two reasons. Idempotency: callers fan
  out a notification on `changed`, so a re-promotion must report `changed:
  false` rather than throwing a second *"this is urgent now"* at the same
  operator. And it must **not clobber a richer scale it did not set** — a
  carton at manual tier 1 (High) or a ticket at `high` is already `normal` by
  this vocabulary, so clearing writes nothing; a naive `SET priority_tier =
  NULL` would silently demote a deliberate High to Auto.
- **Carton columns move in lockstep** (`is_priority ⇔ tier === 0`) or a
  promoted carton is invisible to the queues still reading only the boolean.
- **`order_flags.flag = 'priority'` is NOT urgency.** It is a shared row *tint*
  for queue triage, disjoint from `is_urgent` by construction — nothing syncs
  them, and an order may carry either, both, or neither. Folding it in would
  make one action write two columns with different meanings and audiences.
  Vocabulary + writes stay in `orders/order-row-flags.ts` / `order-flags.ts`.
- **A receiving LINE never paired to a carton is honestly un-promotable** —
  there is no `receiving` row to carry the tier. The domain returns
  `no_anchor`/`unsupported_entity` rather than writing nothing and reporting
  success; the UI already refuses it ("Link a PO first to set priority"). That
  is a real product gap, not a bug to route around.
- **The three multi-field PATCH routes are frozen exceptions, not a backlog.**
  `/api/orders/assign`, `PATCH /api/receiving-logs` and
  `PATCH /api/zendesk/tickets/[id]` each write urgency as **one column inside a
  wider dynamic UPDATE**; routing that field back out would split one atomic
  write into two that can half-fail. Ditto `receiving/lookup-po` (an automatic
  domain rule at scan time) and `feed-membership-projection.ts` (a projection
  that copies an already-decided tier). What the guard prevents is a **fifth**
  single-purpose writer — which is how the first four diverged.
-
  writer allowlist, so it cannot drift in either direction; finishing a
  migration **removes** a line.

## Inbox surfaces — the bell vs Home → Inbox (documented 2026-08-08)

**Three surfaces wear the word "inbox" and answer three different questions.**
Until now no rule text acknowledged the split, which is how two of them grew
two stores and two row grammars for adjacent jobs.

| Surface | Store | Answers | State model |
|---|---|---|---|
| **Header bell** — `ActivityInboxPopover` | `ActivityInboxContext` (in-memory, ≤20) + `staff_messages` | *what just happened to me* | dismiss / undo — **ephemeral** |
| **Home → Inbox** — `HomeInboxMode` (`?mode=inbox`) | `staff_inbox_items` via `GET /api/inbox` | *what I follow / was assigned* | `unread · read · done · snoozed` — **durable**, org-flagged |
| **Home → Tasks** — `HomeTasksMode` | `/api/ops-plans/inbox` | *what I should do next* | plan-task ranking |

**Always**

- The **bell keeps the compact activity face** (`CompactActivityRow` +
  `RailRowBody`, `formatLaneAgeCompact`) — pinned by.
- The **header badge counts dismissible `ActivityInboxItem`s only.** A queue
  *depth* is not a thing you dismiss and must not enter it (that ruling is at
  **Per-staff queue depths** above, and it is unchanged). An **assigned task
  is** a discrete event you clear by acting on it, so it is the badge's own
  shape and belongs there.
- `staff_inbox_items` is the durable ledger; `staff_messages` is the human DM
  store. **Two genuinely different jobs, two sibling tables** — the migration
  header of `2026-07-28d` states why (a system notification has no sender; a
  prerendered body goes stale; no entity anchor makes collapse unindexable; no
  dedupe key double-delivers under an at-least-once worker). Do not merge them.
- **Render at READ time** from the structured reference
  (`entity_type`/`entity_id`/`event_key`/`actor`). Never prerender a message
  body at write time.

**The three gaps this section opened with are CLOSED (WS-TASKS, 2026-08-08).**
They are kept here as history because each one was documented as existing while
it did not, and the sentence that replaced it is the thing to check against the
code next time:

- **The Ably leg exists** — `publishInboxItem` (`src/lib/realtime/publish.ts`)
  emits `inbox_item` on the `org:{org}:inbox:{staff}` channel that
  `2026-07-28d`'s header had only ever diagrammed.
- **`staff_inbox_items` has a create path** —
  `src/lib/notifications/assign-inbox-item.ts` is the writer `reason:'assigned'`
  had been missing since the CHECK was written. It **bypasses the outbox on
  purpose**: the cron worker exists to *derive* recipients from
  `staff_subscriptions`, and a thrown task already names one, so routing it
  through the outbox would deliver to the wrong people and add cron latency to a
  bench handoff.
- `isHomeInbox` is `rollout` in `FLAG_LIFECYCLE` (plannedRemoval 2026-10-26) and
  seeded ON for the dogfood org.

**The send surface is `ThrowTaskHost` (⌘⇧U) — see the registry row above.** One
store, two displays, two jobs: an assigned task writes `staff_inbox_items`, the
publish makes the bell its live face, and Home → Inbox stays the durable
backlog. Do **not** grow a third store for task assignment.

**Amplifiers are reported, never hidden.** `POST /api/tasks` returns `urgency`
and `notified` beside the task, and the throw surface says which one it got. A
thrown-but-nobody-notified handoff looks identical to a delivered one — the
`support_ticket` case is exactly that today (`notified: 'skipped_entity'`,
because no role holds a `support.*` permission, so an inbox row would be visible
to nobody), so a flat success toast would be a lie an operator acts on.

## Order note grain (one writable home)

An annotation on an order goes to **`order_notes`**, appended through
`POST /api/orders/[id]/notes`. Nothing else in the product writes a note.

| Field | Grain | Writable? | Written by |
|---|---|---|---|
| `order_notes.note_text` | one entry, attributed + timestamped | **yes — append only** | `OrderNotesTrail` (record plane) · the grid's in-cell **Add note** · both via `useAppendOrderNote` |
| `orders.notes` | one overwritable string per order | **no — read-only in the product** | `ingestCanonicalOrders` at INSERT, carrying **the note the SOURCE sent** (a Google Sheet `Note` cell, an Ecwid buyer comment) |
| Entity Threads (`ThreadPanel entityType="ORDER"`) | the customer / support **conversation** | yes | the thread composer |

- **The scalar and the trail were the SAME job, not two jobs.** From 2026-07-28
  to 2026-07-31 the order inspector carried both — the append-only trail and the
  editor dock's `orders.notes` composer, labelled apart ("Ops notes" vs "Notes")
  to hide the collision. `2026-07-28_order_notes.sql`'s SCOPE BOUNDARY allows two
  homes only while they do genuinely different jobs; "write a note about this
  order" is one job, and the scalar was the worse implementation of it (the
  second person to touch a row overwrote the first, unattributed). The writers
  were migrated; the column was frozen. **Do not re-open it** — a `{ notes }`
  key on `PATCH /api/orders/[id]` is now a 400, not a write.
- **What `orders.notes` legitimately still is: the SOURCE's note.** An inbound
  snapshot stamped at ingest — never typed by an operator, never editable in the
  product. That is a real second job, so the column is frozen rather than
  dropped. A **buyer name is not a note**: the CSV import used to write
  `"Customer: <name>"` here, which hid the buyer from every customer-scoped read;
  it now resolves to a `customers` row via `resolveCustomersByName` and lands on
  `orders.customer_id`. A source with a stronger identifier (customer id, email,
  phone) must match on that, never on a name.
- **Read paths stay.** `orders.notes` still renders read-only beneath the trail
  ("Legacy note"), still feeds the queue's search `ILIKE` predicate, and still
  lights the row's corner indicator beside `note_count`. The row shows **one**
  mark for either store: the operator's problem is the note, not which table it
  landed in.
- **The in-cell plane appends, it does not edit.** A trail entry is a statement
  someone made at a time, so the cell popover seeds empty ("Add note") and the
  record plane owns reading the trail and its authors — `display/workbench.md`
  → Action planes.
- **One composer per panel.** A surface that already mounts `OrderNotesTrail` at
  the record plane passes `showNotes={false}` to `ShippedPanelEditorDock`. Two
  composers over one store is the same confusion in a new shape.
- **Desk inspector is the durable note plane** (2026-08-06). `/o/[orderId]` is
  retired; `ShippedPanelEditorDock` mounts `OrderNotesTrail` with `showNotes`
  on desk hosts that show the editor dock. Support orders workspace still
  mounts the trail directly. **This is a placement rule, not a grain change** —
  the write path is untouched: `order_notes` via `POST /api/orders/[id]/notes`,
  one writable home, still guarded. Search order feedback stays read-only.
- **Threads are still the other side of the line** — `order_notes` is internal
  and staff-authored; the customer conversation stays in Entity Threads. If that
  blurs in practice, collapse onto threads rather than growing a third home.
-

## Staff profile photo (one face, one resolution point)

A staffer uploads **one** photo; it becomes their avatar everywhere their work is
attributed — spine footer, sign-in picker + PIN chrome, timelines, serial
journeys, admin identity, ops live feed. No photo ⇒ their colour + initials.

- **Store a PHOTO ID, never a URL.** `staff.avatar_photo_id` → `photos(id)`
  `ON DELETE SET NULL` (`2026-08-01e_staff_avatar_photo.sql`). Bytes live behind
  `photo_storage` + `/api/photos/{id}/content`, org-scoped like receiving
  evidence. A URL column here would be a second, unsigned way to reach tenant
  bytes.
- **One upload waist.** `POST`/`DELETE /api/staff/[id]/avatar` composes
  `uploadPhoto` — GCS via the adapter, `photo_entity_links(entity_type='STAFF',
  link_role='primary')`, path `{org}/staff/{staffId}/avatar/{photoId}.jpg`.
  **Never** add a second uploader; the Settings card
  (`settings/sections/StaffPhotoCard.tsx`) **and** the spine
  `StaffAvatarEditor` both post to this route.
- **Colour waist.** `PATCH /api/staff/[id]/color` writes `staff.color_hex`
  (self OR `admin.manage_staff`); optimistic client patch via
  `setStaffColorHex`. Never a second colour PUT for self-service.
- **Gate = self OR `admin.manage_staff`,** checked inline (a route-level
  `permission:` would lock every staffer out of their own profile). The generic
  `/api/photos/upload` path stays admin-only for `STAFF`
  (`UPLOAD_PERM_BY_ENTITY`), so it can't attach a photo to a colleague.
- **`staff_avatar` is the ONLY legal `photo_type` on `STAFF`** (write matrix in
  `photos/stages.ts`): a profile photo is identity chrome, not evidence — the
  constraint keeps a receiving capture off a person's face and a face out of the
  evidence buckets the library and claim exports read.
- **Resolution is by staff id, through the staff identity cache**
  (`@/utils/staff-colors` — `getStaffAvatarPhotoId` / `setStaffAvatarPhotoId`,
  filled by `<StaffColorsProvider>` from `/api/staff` and seeded for SELF from
  the auth envelope's `avatarPhotoId`). A feed carrying only an actor's staff id
  needs **no photo join and no prop drilling**. A caller holding the row may pass
  `avatarPhotoId` / `colorHex` to skip the lookup.
- **Never guess an avatar from a display name.** Two people share one, and the
  row would attribute the work to the wrong face. `TimelineItem.actorStaffId`
  (additive beside the `actor` copy string) is what unlocks the mark; an adapter
  whose query resolved only a name leaves it undefined and renders name-only.
- **Sign-in shows faces.** `/api/photos/{id}/content` has ONE anonymous branch:
  the photo must be the **current** `avatar_photo_id` of an active staffer in the
  tenant the request's host resolves to — exactly the set `/api/auth/staff-picker`
  already discloses publicly (name + role + colour). A superseded avatar, an
  evidence photo, or another tenant's staffer still 401s.

## Honest absence (missing facts)

- Grid cells: `GridCellDash` → quiet `—` (`text-text-faint`) — never blank, never `"N/A"`,
  never loud `--------`, never centered `--` on LedgerGrid tracks (2B).
- Ledger details: `LedgerValue` / `DateTimeValue` default `fallback` is `—`.
- Condition meta on **LedgerGrid** tracks composes `GridCellDash` when empty — do **not**
  use `EMPTY_META_DASH` / `EMPTY_META_DASH_ALIGN_CLASS` (centered `--`) on grid cells.
  Non-grid dense meta may still use `EMPTY_META_DASH` from `conditions.ts`.
- Qty fractions (`0/n`, `0/?`) may render, but **mute when received is `0`** so zeros do not
  compete with real data.
- Do not introduce new `"N/A"` defaults on ledger/grid primitives; migrate call sites toward `—`.

## Spatial predictability (locked triage boxes)

Warehouse / desk triage is muscle memory: operators find a fact by **where it sits**, not by
scanning a reshuffling layout. Industry-standard dense B2B (WMS · packing · support desks)
locks fact clusters in place and paints honest emptiness inside the box.

- **Station Action Displays** fact bands (`StationDenseFactStrip` /
  `StationActionDossierShell` rows) lock column positions the same way —
  empty cells paint honest `—` in bounds; never progressive-hide primary triage
  fields. Law: **Station Action vs Context planes**.
- **Always mount** fixed pipeline milestone rows (`PipelineStageRow` under a
  `LinearWorkflowStepper`) — Tested · Packed · Scanned Out on orders;
  Scanned · Unboxed · Received on cartons. Unstamped stages keep
  `emptyFallback` ("Not tested" / "Pending pack" / …) in the established bounds.
- **Phase / next-step** (`deriveOrderPipeline` · carton readiness) drives the teaching
  callout and emphasis — **not** which rows mount. Progressive disclosure that **hides
  empty milestone rows** is debt: it shifts every later fact when a stamp appears.
- **Compose**, don't fork: desk `OrderPipelineSection`, search evidence
  `OutboundMilestones`, and `ReceivingCartonPipeline` / `ArrivalCartonPipeline` share
  this law. Event-activity sections (timelines with zero events) may still omit empty
  station bands — that is not a locked packout checklist.
-

## Search order feedback identity

`/search?sel=order:…` is the **read/triage** order job (`SearchOrderFeedback`) — not the desk
inspector. Identifiers and section chrome share the warehouse dense language with browse rows
and desk identity chips; never invent a search-local ID face.

- **Disposition leading identity:** `OrderIdChip` (last-8 + `platformLabel`) + `PlatformMark`
  (fixed footprint; label in tooltip/sr-only). Lifecycle status may stay a
  `PaneHeaderStatusPill`. **Never** `Order #{full}` prose or a yellow platform status pill.
- **Channel resolve:** `useOrderChannelLabel(order_id, account_source)` → catalog label, then
  `sourcePlatformMetaFromLabel` / `usePlatformMeta(meta.value)` for paint. Never
  `getAccountSourceLabel` + hand-rolled color maps in feedback modules.
- **Facts column durable IDs:** typed chips — Order # → `OrderIdChip`; Tracking → dense
  `TrackingChip` (stacked when multi); Serial → `SerialChip`; SKU → `SkuScanRefChip`
  (last-8 `display` when long); Item # → `SourceOrderChip` / id-tone chip. `OrderFactRow mono`
  is for magnitudes (qty) / non-typed captions only.
- **Item hierarchy:** `StackedRowIdentity` — product title row 1; SKU / Item # / order keys
  row 2. Never park a mono `#{id}` on the title row.
- **Section chrome:** `FlushSection` (eyebrow + dense body). Returns on this surface use
  flush chrome (`OrderReturnsCard` `chrome="flush"`), not a soft `OrderRecordCard`/`Panel`.
- **Milestones live on evidence:** Tested · Packed · Scanned Out are the locked
  `OutboundMilestones` checklist — do not re-list them as omit-when-empty Fulfillment facts.
- **Browse comfortable Id track:** same `OrderIdChip` + `platformLabel` when
  `facets.source_platform` / channel is known; never add `PlatformMark` to the 5-track grid
  (Id face carries platform via tooltip).


## Buttons

- Canonical `Button` (5 variants) lives in `src/design-system/primitives`. `PrimaryButton` is now a thin alias.
- New code uses `Button`; don't hand-roll button class strings.
- Icon-only actions use `IconButton` with a `size` (xs/sm/md/lg/touch) for the hit-box — never a hand-set
  `h-N w-N` on the button. `touch` = the 44px tap floor that
  `tokens/touch.ts` used to own (retired).

### Micro vs Macro (Displays / panel columns)

**Column = the card.** Depth is surface steps + hairlines, not nested padded islands
with a primary CTA hanging underneath.

- **Micro** — action affects one row (reprint one label, add one serial). Far-right of the
  full-bleed hairline row: `IconButton size="md"` (`h-8 w-8` `rounded-none`) with a ghost
  wash (`hover:bg-surface-sunken`). **Never** a primary blue text `Button` inside a
  repeating list row.
- **Macro** — multi-select bulk or panel commit (Print N unit labels, Move photos, File
  ticket, Send note). Compose `FlushTerminalFooter` as an in-flow flex sibling under a
  `flex-1 overflow-y-auto` body — the physical floor of the column. Shell is always
  `shrink-0 border-t border-border-hairline bg-surface-canvas p-0` (Claim File golden).
  Layouts: `bleed` (full-width primary) · `cluster` (optional `leading` + CTA) ·
  `spread` (equal fill-width peer columns — Station Displays carton Macro;
  `IconButton size="fill"` / `FLUSH_TERMINAL_SPREAD_PEER_CLASS` + glyph
  `FLUSH_TERMINAL_SPREAD_GLYPH_CLASS` (`h-5 w-5`); hit target **is** the
  column — never floating `w-11` + justify-between dead air or micro `h-4`
  glyphs on an h-11 floor). Always
  mounted when it is the panel's commit surface; disable when invalid — do not unmount
  to "hide". Hosts must fill height (`flex h-full min-h-0 flex-col`) so the floor sits
  on the true column bottom (Ticket / Photos / Units Displays hosts).
- **Workbench inspector Macro** — desk triage record peeks compose `InspectorActionFloor`
  **icons-first**: `FloorIconButton` / `FloorOverflowButton` peers + a flush trailing
  `InspectorFlushDelete` child (`IconActionFloor` spread), optional `above` expand.
  Never a labelled `actions` / `leading` / `delete` cluster (deleted); intake overlays
  compose `FlushTerminalFooter` directly.
- **Station Displays carton Macro** — scan-station push columns compose
  `StationDisplaysHeaderActions` in the **top band** (`IconButton size="sm"` cells)
  for Refresh · Print · Edit · trailing `⋮`; Delete and Resolve live inside `⋮`.
  Leaf-local commit surfaces (Claim File, Move photos) still call
  `FlushTerminalFooter` directly inside the leaf body.
- **Wrong lanes:** `StickyActionBar` (soft rounded), station `SlicedActionDock` /
  `StationTerminalDock` (pill dock), mobile `ConfirmDock` (`rounded-2xl`).

## Ops chrome binary show/hide (instant)

**Warehouse sheet-chrome doors that free or occupy layout height above the work surface snap
instantly.** KPI Band 2 (`WorkbenchKpiBand`) is the golden: open ↔ closed on the same frame via
`hidden` (React tree stays mounted; layout height frees immediately). Sibling Band-2 / chrome
doors that push the grid must follow the same contract.

- **Never** `framerPresence.collapseHeight`, opacity fades, `transition`, or any layout tween that
  *animates* the sheet open or shut when the operator hides/shows metrics chrome.
- **Why:** Cycle Forge is warehouse ops software — hide/show metrics is a tool door, not a
  delight flourish. A slow push fights scanning cadence and feels soft.
- **Still allowed:** sanctioned `collapseHeight` for *in-content* disclosures (label preview,
  checklist strips, sidebar nests) — those do not push the workbench sheet chrome band.
- **SoT:** `src/components/dashboard/workbench-kpi-collapse.tsx`.
  band). Hard law: `AGENTS.md` → Ops chrome binary show/hide is instant.

## Workbench chrome flush

**Ops chrome is flush-square (`cornerClass('flush')` → `rounded-none`).** Solid CTAs, tab bands,
selects and toggle rows sit square on their hairline — no soft radius, no horizontal pill bands.
`WORKBENCH_CHROME_PILL_CLASS` is now `cornerClass('flush')`; the former soft-concentric pill
(`nestedCornerClass('card', 0.5)` → `rounded-xl`) is retired debt. Quiet filter icons on
`ToolbarButton` flatten to flush too.

- Solid trailing CTAs (return-to-scan **Unbox**, Import / Add / Check) and the Unbox History week
  calendar compose `WORKBENCH_CHROME_PILL_CLASS` (flush) on **all four corners**.
- Band-1 host is `WORKBENCH_CHROME_BAND_FACE` (`gap-0 p-0`) — the leading **Pin-list cube**
  (when earned — see **Workbench Band-1 strip**) abuts the first system tab; never host
  `gap-2` / `p-0.5` air between pin and tab rail.
- A vertical hairline (`WorkbenchTrailingCluster` leading divide) separates the quiet icon rail from
  solid actions; both sides are flush-square.
- **Anti-pattern:** a new `rounded-lg`/`xl`/`2xl`/`full` CTA, tab or select on a workbench surface,
  or a one-off soft pill band (`HorizontalButtonSlider` / soft `TabSwitch`). `rounded-full` survives
  only for status dots · avatars · Switch tracks.

**Exemplar — Unbox History chrome:**

```text
[ History ] … [⌕][👤][▽] [ Calendar ]|[ Unbox ]
  flush                            flush │ flush
  (flush-square, zero radius on both sides of the hairline)
```
Detail: `display/workbench-ops-queue.md` → Trailing Display & Actions; return-to-scan Look in
`display/workbench.md` → Multi-region pages.

## Host vs content pad

**Column = the card.** Outer hosts own flush edges; readable pad lives on content, not around the
column. One industrial language for Station · MasterNav · Workbench sheets — not soft desk islands
wrapping hard floor data.

```text
HOST  = p-0 / named sheet·rail token · cornerClass('flush') · hairline + surface step
ROW   = inset-field | inset-cozy | SIDEBAR_SCAN_DOCK_LEADING_ROW (content pad only)
DOT   = cornerClass('pill') — status dots · avatars · Switch tracks only
```

- **Outer hosts** compose named tokens — never decorative column `p-*` or outer `m-*` islands:
  `WORKBENCH_SHEET_HOST` / `WORKBENCH_SHEET_CHROME`, `SIDEBAR_RAIL_INSET_X` (`px-0`), MasterNav
  scrollport/footer `p-0`, station identity `STATION_IDENTITY_INSET_TOP` (`top-0`).
- **Content pad** uses Tier-2 spacing intents (`inset-field` / `inset-cozy` / `inset-chip`) or the
  scan-dock leading row — on the row / control, not a second spacing DS.
- **Desk golden — To-ship:** `DashboardOrdersView` + `OutboundWorkspaceHeader` (three-band
  `WORKBENCH_SHEET_*` + `OrdersGridHost` `surface="sheet"`). Sheets flush mount recipe above;
- **Anti-pattern:** call-site `rounded-none` fighting a soft SoT shell; soft empty-state /
  idle CTAs (`rounded-lg`/`xl`) on a flush sheet; padding the list host so selection washes
  inset from the pane edge.

## Station entity-context header (inbound carton + shipping active order)

- **SoT:** `@/components/station/entity-context` → `CartonContextCard` + `StationContextBar` /
  `StationMoreDetails` (card implementation under `receiving/workspace/line-edit/`; barrel is the
  public waist).
- **Secondary detail = Displays only (ruled 2026-08-07):** Exact triage facts (full IDs,
  qty / extra-box dossiers, lineage, exception routing, diagnostics) open in the right-edge
  **Displays** column (`StationDisplaysPushStack` / index → leaf). Never a **"Show details"**
  / Level-1 collapse strip under the carton identity band or middle work plane — that truncates
  facts and forks a third surface beside Displays. Identity stays the compact two-row face;
  Unbox **Show label** under PO lines is centre-body work chrome (label sticker), not a
  carton-detail drawer.
- **Two-row face (family SoT):** row 1 = urgency · platform · type → Photos;
  row 2 = lifecycle · order#/PO# · tracking (left). Under Photos, end-aligned:
  **price · listing · Claim CTA or filed ticket#** (`gap-0` abut — same flush
  grammar as classify / Photos · Claim; never `gap-1.5` air). Omit optional props per
  station — never invent empty placeholder tracks. Editors open external tabs /
  pairing — do not regroup into stacked form sections. **Flush faces
  (2026-08-05):** classify (`InlinePillPicker`), Claim/Photos/Exit
  (`station-context-action-pill.ts`), and chip rhythm (`STATION_IDENTITY_ROW_CLASS`
  / `_GROUP_CLASS`) are **zero corner radius + zero inter-chip pad**
  (`rounded-none` / `cornerClass('flush')` · `gap-0`) — never stadium `pill` /
  `rounded-full` / `row-gap` air. Label / Claim / Photos faces keep **inset text
  pad** (`px-1.5`); Photos keeps `justify-between` so camera · count/+ sit off
  the border. Condition grade active faces stay flat (`shadow-none` in
  `condition-tone.ts`).
- **Identity chrome:** mount identity inside `StationContextBar`. **Unbox** uses
  `placement="flow"` (in-flow shrink-0 band via `stationContextBarFlowHostClass`)
  above `StationWorkbench` with `reserveIdentityClearance={false}` + `bodyGap="none"`
  so the identity hairline **abuts PO lines with zero air** — no absolute float +
  guessed `pt-16` clearance. Other hosts may still use absolute overlay
  (`stationContextBarHostClass`) + `reserveIdentityClearance="stacked"`.
  **Top padding SoT (overlay path):** `STATION_IDENTITY_INSET_TOP` (`top-0`) pins
  identity flush under GlobalHeader. Band face: `stationIdentityPanelClass`
  (`rounded-none` · hairline `border-b` · flat elevation · `bg-surface-card`;
  `stationIdentityPadClass` = horizontal only, **zero** `pt`/`pb`). Never stack
  host `py-*` under an absolute identity host. **Unbox station push is flush:**
  `TICKET_PUSH_HOST_PAD_CLASS = ''` and no push `my-2` (wide column uses
  `DETAIL_STACK_PUSH_COLUMN_CLASS`).
  Corner utilities go in `StationMoreDetails` (embedded `LineEditToolbar`). Do not put carton
  identity in the workbench `entityContext` / `toolbar` slots.
- **Compose for Unbox / Triage / Testing / Shipping (active order)** via thin adapters
  (`LineCartonContextSection`, `TestingCartonHeader`, `ShippingEntityContextHeader`,
  `PackOrderIdentity`, `PickupEntityContextHeader`).
  Omit optional props to hide claim / photos / classify / lifecycle / PO$ per station.
- **Never fork** a second condensed identity header (no page-local title + "Open listing" card).
  Former one-row `bar` and glass `card` densities are deleted — one face only.
- **Do not conflate with carton read:** Unbox condensed **photos** are work chrome (`ReceivingPhotoButton` — capture + mutable gallery). `/carton/[id]` is the read surface (SoT row above): header Photos control → viewer SoT with `{ url }` only. Recipe: `display/carton-read.md`.

## SKU identity (data-integrity)

- `items` (Zoho) and `sku_catalog` are **two independent SKU numbering schemes**.
- **Never join on the SKU string** — they collide. `items.name` is the title-display SoT
  (`get-title-by-sku` prefers `items.name`, not `sku_catalog` / `sku_stock`).

## Customer identity on ingest (data-integrity)

- **Order ingest resolves a buyer to a real `customers` row — it never parks the
  name in free text.** `ingestCanonicalOrders` matches per-order first (a
  customer the source itself identified), then `CanonicalOrderLine.customerName`
  via `resolveCustomersByName`, and writes `orders.customer_id`. A name written
  into `orders.notes` is invisible to every customer-scoped read; that was the
  CSV import's shim and it is now a guard failure.
- **`customerName` is the WEAKEST identity signal — use it only when it is the
  only one.** Exact name (trimmed, whitespace-collapsed, case-insensitive) is
  what a mapped CSV column carries, so two people with the same name do collapse
  onto one customer. A source with a platform customer id, email, or phone must
  match on that instead and leave `customerName` blank.
- **Resolution is batched, and free when unused.** Match-then-create in two
  queries per import regardless of row count, and a source that sets no
  `customerName` issues zero queries. Never add a per-row find-or-create to this
  path — a CSV import is up to 10k rows over a handful of distinct names.
- **The JS and SQL match keys must stay identical** — `customerNameKey` and
  `customerNameKeySql`. Collapse whitespace BEFORE trimming: Postgres one-arg
  `btrim` strips spaces only, so trim-first leaves a stored tab behind and mints
  a duplicate customer for a name that already exists.

## Cross-entity search (AI search — the narrow waist)

- **Engine SoT**: `src/lib/search/hybrid-retrieval.ts` (`hybridSearch`) over `entity_search_docs`
  (migration `2026-07-03d`) is the single cross-entity search engine — exact-identifier bypass →
  keyword (trgm GIN) → pgvector cosine → RRF. **Never build a new per-surface search
  implementation**; new consumers call `hybridSearch` (server) / `POST /api/ai/retrieve` (client via
  `src/lib/search/ai-search-client.ts` + `useAiQuickJump`).
- **Result shape SoT**: `SearchHit` in `src/lib/search/search-hit.ts` — including the DB↔UI entity
  vocabulary, per-entity deep-links (`searchHitHref`), and scope-filter hrefs (`searchScopeHref`).
  Tools and endpoints return `SearchHit[]`, never raw rows; render via `AiQuickJumpResults` / `CmdRow`.
- **Doc-freshness SoT**: DB triggers → `entity_search_outbox` → the cron worker
  (`src/lib/search/search-outbox-worker.ts`). **Never call an upsert-search-doc helper from domain
  code** — a new searchable entity = extend `build-search-text.ts` + add triggers in a migration
  (keep the two column lists in sync; see the 2026-07-03d header).
- **Keyword-arm SQL rule**: every predicate must textually match the indexed expression
  `lower(search_text)` using GIN-supported operators (`=`, `LIKE`, `<%`) — `BTRIM`/raw-column
  variants force a per-org Seq Scan (EXPLAIN-verified 2026-07-04).
- The exact fast paths (`src/lib/search/global-entity-search.ts`) are deterministic parent-table
  truth and are **never removed** (plan non-goal); legacy query libs survive as typed tools.
- **`/search` pending chrome**: header `SearchPendingBar` (via `setGlobalSearchPending`) is the
  only resolve/retrieve pulse — browse/feedback bodies must not paint “Opening…” / idle-teach
  placeholders while `idPending` or resolve is loading.
