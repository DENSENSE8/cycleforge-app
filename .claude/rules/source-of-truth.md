# Source-of-truth invariants

Each concern below has exactly one source module. Read from it; never inline, copy, or re-derive the mapping.

**This is the only list.** Root [`AGENTS.md`](../../AGENTS.md) links here rather than carrying a compact
twin — a second table drifts from this one the first time a row changes in just one place.

## Presentation kinds (UI waist — data drives display)

Views **assemble** resolved facts; they do **not** invent label maps, hues, or chip types. When rendering domain
fields, pick the presentation kind and import from the SoT below (Kinetic Ledger law 4 — [kinetic-ledger.md](kinetic-ledger.md)).

| Facet / kind | Source |
|---|---|
| Civil day / instant / warehouse zone | `src/utils/date.ts` |
| Condition grade → label | `src/lib/conditions.ts` (`conditionLabel`) |
| Condition grade → tone | `src/lib/condition-tone.ts` (+ `useConditionGradeStyle`) |
| Source platform → label / tone | `src/lib/source-platform.ts` |
| Receiving type → label / tone / icon | `src/lib/receiving/receiving-type-meta.ts` |
| Typed identifiers (serial, FNSKU, tracking, …) | `CopyChip` family + `src/lib/copy-chip-format.ts` |
| Staff / org identity mark (avatar circle) | `@/components/identity` — `StaffAvatar` (photo → colour+initials) / `IdentityMark`; initials from `staffInitials` |
| Capability / provider nouns | `src/lib/integrations/capability-labels.ts` (+ server connections) |
| Cross-entity search row | `SearchHit` / `src/lib/search/search-hit.ts` + hybrid retrieval |
| Printed barcode payload (**encode**) | `encodePrintMatrix` in `src/lib/qr/platform-link.ts` — see **Printed code ↔ scan round-trip** below |
| Scanned / typed payload (**decode**) | `routeScan` in `src/lib/barcode-routing.ts` — see **Printed code ↔ scan round-trip** below |
| Lifecycle / status dots | lifecycle tone registries / `workflowStageDot` (do not invent status maps) |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Motion **intent** (which physics for this job) | `src/design-system/motion/roles.ts` — `motionRole.swap.scan` · `swap.focus` · `push.rail` · `gesture.press` · `feedback.pulse` · `procedure.advance` (**deferred** — flat ProcedureDeck unused). Six roles; a seventh means a new JOB, never a new duration. Catalog (`framerPresence` / `framerTransition`) stays the implementation — see **Motion roles + import path** below |
| Motion **import path** (the engine) | `@/design-system/motion` — the ONLY motion import in `src/`; `framer-motion` / `motion/react` banned outside `src/design-system/motion/**`. Guard: `motion-major.guard.test.ts` |
| Typeface cuts (sans **Inter** · condensed **Plex** · mono **Plex**) | `src/lib/fonts.ts` + `typography/families.ts` (stacks mirrored in `styles/globals.css`) |
| Type role → size/leading/tracking/weight/family/numerals | `tailwind.config.ts` `fontSize['role-*']` + the CF Type plugin |
| Font weight ceiling (600) | `typography/weights.ts` (`MAX_FONT_WEIGHT`) |
| Spacing scale + intents | `src/design-system/tokens/spacing.mjs` (+ `Stack`/`Inset`/`Row` primitives) |
| Focus affordance | `src/design-system/tokens/focus-ring.ts` (`focusRing(archetype, tone)`) |
| Depth elevation (flat · raised · overlay) | `src/design-system/tokens/shadows.ts` (`elevationClass`) — **planes, not gutters**; see **Depth elevation** below |
| Depth-as-planes (exact flush work frame) | Surface steps `bg-surface-canvas/sunken/card` + `elevationClass` + `nestedCorner` / `nestedCornerClass` on **one shared ground** (`app-surface.ts` · `CONTEXT_PANEL_HOST` in `context-panel-column.ts`). Outer `m-*` islands between push columns are **not** depth. See **Depth elevation** · **Frame column budget** |
| Frame column budget (center floor · yield ladder) | `src/lib/right-rail/frame.ts` (`MIN_WORK_SURFACE_PX`, `resolveRightRailFrame`) composed with `CONTEXT_PANEL_RESIZE` / `DETAIL_STACK_RESIZE` — open rails must leave the center; see **Frame column budget** below |
| Ops table / spreadsheet surface shell | `src/design-system/tokens/table-surface.ts` — `TABLE_SURFACE_CLIP_CLASS` (framed card) · `TABLE_SURFACE_SHEET_CLASS` (flush Sheets plane) · `TABLE_FROZEN_HEADER_CLASS`; Workbench sheet body/chrome hosts: `WORKBENCH_SHEET_HOST` · `WORKBENCH_SHEET_CHROME` |
| Sticky LedgerGrid column-header row (select-all · sort · frozen · tip) | `@/design-system/components/grid` `LedgerGridColumnHeader` + layout API — Receiving / Incoming / Pickup / Catalog / Repair adapters thin; **Orders header is the permanent allowlisted fork** (`OrdersQueueColumnHeader` — drag-reorder UI; shell mounts `LedgerGridSurface` with `forceHidden` + controlled `columnOrder`). Inner label: `GridHeaderLabel`. Do **not** half-port Orders onto the factory. |
| Grid surface features (triage wash · multi-select · in-cell edit · Fields · day bands) | `@/design-system/components/grid` `GridSurfaceCapabilities` on `GridSurfaceDescriptor` — see **Grid surface capabilities** below |
| LedgerGrid parent→child **drill** (linked dual panes) | `@/design-system/components/grid` `LedgerDrillHost` + `LedgerDrillParentMap` + `ledger-drill-layout` (`LedgerDrillUrlContract`) — WMS-wide; domain adapters (e.g. receiving History `ReceivingDrillHost`) stay thin. **Fold** = in-grid expand; **compare** = independent panes — never conflate. Law: [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md) → Collection layouts. Guard: `ledger-drill.guard.test.ts` |
| Grid leaf-row fill (selection · optional triage · card) | `ledgerRowFillClass` in `src/components/ui/queue-row-chrome.ts` (gates flag wash on `capabilities.rowTriageFlags`) |
| Grid row paint fills (Sheets-like) | Unbox `HistoryRowPaintChrome` · To-ship `OrdersRowPaintChrome` + `GridRowPaintTrigger` + `GRID_HIGHLIGHT_PRESETS` → `staff_preferences.tableColumns[t].rowFills` (`receiving` / `orders`) — left of List\|Drill; see **Grid row fills** below |
| Navigator row selection (facet · saved-view · day-tree · Desk segment) | `NAV_ROW.selectedClass` in `src/components/ui/queue-row-chrome.ts` — quiet sunken wash; never `QUEUE_ROW.selectedClass` (that is record pick) |
| Grid leaf-row shell (fill · template · map columns) | `@/design-system/components/grid` `LedgerGridLeafRow` — domain `renderCell` stays per family |
| Grid cell chrome (inset · hairline · frozen sticky · row shell) | `@/design-system/components/grid` `ledgerGridCell` / `LEDGER_GRID_FROZEN_CELL` / `ledgerGridRowShellClass` — see **Grid cell chrome** below |
| Grid column justification (end vs start) | `@/design-system/components/grid` `resolveGridColumnAlign` / `gridCellAlignClass` / `gridHeaderCellAlignClass` — see **Grid column justification** below |
| Grid ROW anatomy (dot · chip · stamp) | **A fact belongs to its own COLUMN, not a neighbour's cell.** No status dot in an identity cell (`ui-design-system.md` → One row anatomy); the status track is a dot **inside** the house chip via `GridStatusCellValue` (`@/components/ui/grid-cells`), tone from the lifecycle registry (`ui-design-system.md` → Eyebrow headers + chips); a civil day and its stamp share ONE column, never two. Full set with reasons: [`display/workbench-ops-queue.md`](display/workbench-ops-queue.md) → Row anatomy |
| Grid frozen-pane sticky offset | `gridFrozenLeft(columns, key)` in `@/design-system/components/grid/grid-column-geometry` — takes the SURFACE's own columns, and its width fallback is the track's rem FLOOR. Never re-hand-roll it; never fall back to `col.width` (a `minmax()` string), which is illegal in `calc()` and silently computes `left: auto`. Guard: `grid-frozen-left.guard.test.ts` |
| Grid identity columns (freeze · lock · never in-cell edit) | Column model `frozen: true` → `gridFrozenKeys(columns)` (per surface); house default + editability floor: `GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` — see **Grid identity pane** below |
| Grid column visibility (per-staff) | `@/design-system/components/grid` `useGridColumnVisibility` / `useGridFields`; operator entry = `GridColumnGutter` → `GridColumnDetailsPanel` — default hover-revealed on the card corner; **Unbox** portals the same trigger into the triage-band controls slot (`triggerPortalTarget`) so it sits with staff / filter / week. One door either way — see **Grid column visibility + sort** below |
| Grid column WIDTH (per-staff drag-resize) | `ColumnResizeHandle` + `useGridColumnWidths` → `staff_preferences.tableColumns[t].widths`, applied as `--cf-col-*` via `LedgerGrid` `columnVars`. Which columns carry a grip: `isGridColumnResizable` — see **Grid column visibility + sort** below |
| Grid column sort (URL-durable) | `@/hooks/useUrlColumnSort` → `?colsort=` / `?coldir=` — see **Grid column visibility + sort** below |
| Collection-surface action planes | `display/workbench.md` — in-cell · row-scoped · multi-select · record, one primary plane each |
| Workbench branch (Layer C recipe) | `SURFACE_REGISTRY.workbenchBranch` + `WORKBENCH_BRANCH_IDS` in `src/lib/stations/surface-keys.ts` — `ops-queue` · `master-detail` · `board` · `fact-stack` · `service-workspace`; null on Station/Monitor/Canvas. Law: `display/workbench.md` + child recipe files |
| **Scan-station primary work surface** | **Main Unbox (dogfood):** PO lines + label (`POUnboxingSection` + `UnboxLabelPreview`) under carton context — see **Unbox centre (main)** below. **Procedure focus deck** (`ProcedureDeck` / `UnboxProcedureDeck`) continues on the `unbox-work` lane (`../cycleforge-unbox`); law retained under **Scan-station procedure focus deck** for that lane. |
| Collection map keep-alive | Prefer `display:none` over unmount when focus overlays the map — reference `ReceivingRightPane`. Service-workspace forbids unmounting the queue on ticket open — `display/workbench-service.md` |
| Return-to-scan chrome CTA | **Every** scan-station hybrid page (Unbox · Testing · Pack · …): solid primary in `WorkbenchTrailingCluster.actions` — top-right of the workbench context bar (`WorkbenchChromeHeader` trailing), **at or above any KPI display, never below it** — on **every** strip tab. **It RESUMES** (ruled 2026-08-03, superseding close-overlay-first): resolve the station's MRU record → land the bench tab **without clearing the pick** (`clearLine: false` — `setUnboxView` clears by default) → **open** that record → focus the scan bar. The button sits in the station's own chrome, so "go here" is not something it can mean; the operator is already here, and what they want is the carton they left. Landing a bare table instead read as a no-op: the MRU comes from `view=unbox_opened` while Recent is `view=viewed` (different memberships), and `useReceivingRowSelection` nulls a highlight absent from its rows — so the row pulse frequently could not fire at all. On a rail that takes a selected id, ONE `receiving-select-line` opens the record **and** marks the left sidebar — never a second parked-cursor field beside it. A failed/empty MRU lookup leaves any open record alone. Reference: Unbox `UnboxWorkspaceHeader` (“Unbox”). Law: `display/workbench.md` → Multi-region pages (+ `display/station.md` § hybrid). **Porting this to Testing · Triage · Pack · Shipping · Labels: `docs/todo/return-to-scan-PORTS.md`** — the per-surface registry, the copy-this handler recipe, and the traps (feed mismatch · `clearLine`) live there, not here |
| Workbench chrome pill (History band-tab radius) | `WORKBENCH_CHROME_PILL_CLASS` = `nestedCornerClass('card', 0.5)` in `workbench-shell.tsx` — soft concentric corners on **all** sides for solid trailing CTAs (Unbox / Import / Add / Check) and the Unbox History week calendar. Same radius as band `TabSwitch` active pill. Never `rounded-*-none` against a hairline. See **Workbench chrome pill** below |
| Chrome-pinned inline KPI readout (`WorkbenchChromeHeader` `middle` slot) | Additive, optional prop on `WorkbenchChromeHeaderProps` (`workbench-shell.tsx`) — a single-line stat cluster between `tabs` and the right cluster, `undefined` for every consumer but Unbox (`UnboxChromeKpiCluster.tsx`). Never `OpsKpiBand`/`KpiTile` here — those are body/rollup card sizing. Paired with the Unbox-local **data-table triage band** (`UnboxTriageBand` — search left, refine + week filter right) as row 2 of the same pinned `chrome` slot. Detail: `display/workbench-ops-queue.md` → Sticky docking, Scoped exception |
| Procedure step ACTION (the button that advances a step) | The bottom dock's LEADING zone — `UNBOX_STEP_DOCK_CONTROLS` (`line-edit/steps/dock/`) rendered by `UnboxStepDock`, keyed on the active step. **A step CARD never carries an action button**: the body renders the step's CONTENT (photos taken, label face, line list, grade on record) and nothing clickable. A step with no action declares that in `UNBOX_STEPS_WITHOUT_DOCK_ACTION` *with a reason* — neither map, or both, fails CI. The TRAILING terminal stays carton-scoped (Print · Receive) and never re-labels. Law: `display/station-workbench.md` → *The dock's LEADING zone is the step's ACTION surface*. Guard: `procedure-step-dock.guard.test.ts` |
| Station column shell / wash | `@/components/station/workbench` (`StationWorkbench`, `StationPanelRoot` + `StationAmbientWash`, `STATION_WORKBENCH_*`) — **Station region** shell, not Workbench contract. Rule: `display/station-workbench.md` |
| Procedure step vocabulary (`done`/`active`/`pending`/`skipped`) | `@/design-system/components/procedure` `ProcedureStepRow` — `skipped` is a waiver, never a check. Law: `display/instrument-panel.md` |
| Procedure views (centre deck · edge checklist) | `@/design-system/components/procedure` — **`ProcedureDeck`** (centre, primary) + `ProcedureChecklist` (right-edge reference). ONE derivation (`useUnboxProcedureSteps` on Unbox). Geometry: **flat 40px faces**; selection = outline ring only; evidence mounts under the list. No peek/covered/layout motion. Checklist is secondary navigation; the deck is the work. Law: **Scan-station procedure focus deck** below |
| Scan progress chrome (procedure completion) | `ScanStationProgressControl` + `ScanStationProgressRing` — bare 16px, no numeral; **dock-anchored under the terminal** (Unbox: `UnboxDockHost` progress row); **never `GoalRing`**, which is daily-goal pace in GlobalHeader |
| Right-rail inspector body facts | `OrderFactList` / `OrderFactRow` (`@/components/order-record`) — label + value, mono on retypable ids. Law: `display/right-rail-inspector.md` → Body |
| Surface / box shell | `Panel` (generic) · `SectionCard` (monitor) · `CardShell` (rows) — never hand-roll |
| Honest absence (missing fact) | `GridCellDash` / ledger `fallback` default `—` — never invent `"N/A"` on ledger/grid primitives |
| Photo gallery viewer | `@/components/shipped/photo-gallery` — `usePhotoGallery` + `PhotoViewerPortal` → `PhotoViewerModal` (composed launcher: `PhotoGallery` / `launcherLayout`). Never a page-local lightbox or `createPortal`+`AnimatePresence` fork around the modal. Read surfaces pass `{ url }` only (omit numeric `id` / upload targets so delete/upload stay off). |
| Receiving line contents (reference) | `ReceivingLineContentsRow` + `receivingLineContentsTitle` (`src/components/receiving/contents/`) · image SQL `RECEIVING_LINE_IMAGE_URL_SQL`. Zoho thumb · title pinned top · details pinned bottom · host gallery. Hosts: `UnboxItemsPanel` · carton-read `ContentsList`. **Never `PoLineRow` for read** (D6 — work accordion stays Triage/Testing). Guard: `receiving-line-contents-row.guard.test.ts` |
| Carton read surface | `/carton/[id]` → `CartonInspector` → `inspection/CartonInspectionPage` + `carton-inspector-model.ts`. Read model + atoms only (D6 / `pattern-evolution.md`). Contents rows compose `ReceivingLineContentsRow` (Zoho thumb). Photos = DispositionBar → `CartonPhotoTriage` + shared viewer. Work escape = one quiet `openInUnboxHref` control — never `"Open in Unbox"` spam on findings/header. IA: disposition header; col1 contents·record; col2 Panel+ReceivingCartonPipeline·findings·activity·history. Linked PO suppresses Unmatched. Not Station column shell — recipe: `display/carton-read.md`. |
| Order note (annotation on an order) | `order_notes` **only**, via `POST /api/orders/[id]/notes` (`src/lib/orders/order-notes.ts` + `useOrderNotes` / `OrderNotesTrail`). The scalar `orders.notes` is **read-only legacy** — displayed, searched, counted, never written by the product. Guard: `order-note-grain.guard.test.ts` — see **Order note grain** below |
| Receiving note vs label text (**per line item**) | `receiving_line.notes` = operator item note · `receiving_line.label_note` = durable printed face center · `receiving_line.zoho_notes` = Zoho line description · `receiving.zoho_notes` / `support_notes` = PO-header / carton. **Unbox overview:** dock draft live-drives the carton sticker center (preview + Print · Receive); dock save still patches `notes` only; carton print stamps `label_note`. Label editor still owns durable `label_note` edits. Guard: `label-note-grain.guard.test.ts` — see **Note vs label grain** below |
| Label kind → grain (what the sticker goes on) | `src/lib/print/workspace-label-kinds.ts` — `KIND_META.grain` + `workspaceLabelGrainLabel(kind)` (`PO / carton` · `Per item` · `Container`), carried into every picker by `labelOptionsForSelect`. Never hand-type a kind's name or grain at a call site |
| Dialog / AlertDialog | `@/design-system/components/Dialog` · `AlertDialog` · `requestConfirm` / `ConfirmDialogHost` — never hand-roll `fixed inset-0` scrims for new modals; station floor confirms stay on `ConfirmSheet` |
| Switch / Checkbox | `@/design-system/primitives` `Switch` / `Checkbox` |
| Dropdown / Context menu | `@/design-system/primitives` `DropdownMenu` / `ContextMenu` |
| App chrome / canvas / wash / work-canvas depth | `src/design-system/tokens/app-surface.ts` + `appContentShellClass` (`appWorkCanvasEdgeClass` owns the depth-edge hairline on every desktop page). Receiving rail+workspace share `CONTEXT_PANEL_HOST` ground (`context-panel-column.ts`); Unbox/Triage under that host use `appWorkCanvasLayoutClass` (no full-bleed card sibling) |
| Global detail-stack overlay shell | `@/design-system/shells/detail-stack` (`DETAIL_STACK_LAYOUT`, `DETAIL_STACK_RESIZE`, `DETAIL_STACK_COLLAPSE`, `detailStackAsideClassName`, `detailStackAsideStyle(widthPx?)`, …) |
| Left context-sidebar wrapper | `ContextPanelLayout` + `context-panel-column.ts` (`CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE`) — every route rail beside the workspace. **Display collapse:** `RailFilterCollapseButton` in `TechRailSearchBar` `trailingAction` (bottom-right / age column only — no sash-top chevron). Secondary gesture: drag-past-min on the trailing resize edge. MasterNav / `SidebarNavColumn` is a separate push spine |
| Right-edge slot occupancy + modality | `RightRailHost` + `src/lib/right-rail/store.ts` (`RIGHT_RAIL_PRIORITY`: detail `100` > assistant `10`) — THE right details-panel wrapper; **AI and record/ticket details share one slot**. See **Right-rail modality** · **Frame column budget** below |
| Right-rail record-inspector header | `PaneHeader` + blocks **or** `DeskRailChromeRow` (Incoming-family Unbox-aligned one-row) — dense identity + contextual icons; **never** `SidebarIntakeFormShell` / `stationMoreDetailsPaneHostClass` inside a Desk card / `rightSlot` close / `variant="card"` ActionBar pill. Recipe: [`display/right-rail-inspector.md`](display/right-rail-inspector.md). Guard: `right-rail-inspector-header.guard.test.ts` |
| Sidebar intake / create form chrome | `SidebarIntakeFormShell` — **create · import · prefs** overlays only (`detail:new-order`, Import eBay, FBA create, grid column display). Not a record-inspector header |
| Nav search (type-to-jump over the nav registry) | `src/lib/nav/nav-search.ts` (ranked matcher) + `nav-destinations.ts` (pages **and** modes flattened) — the ⌘K palette and the MasterNav spine both compose it. NOT the cross-entity engine — see **Nav search** below |
| ⌘K / Ctrl+K ownership | `src/components/CommandBar.tsx` — the ONLY binder. No other surface may bind it (a suppressor inside a focus trap is the one exception) or advertise it. Guard: `cmdk-owner.guard.test.ts` |
| Keyboard ownership (Escape / ambient hotkeys) | `src/lib/overlay-stack/store.ts` (+ `useRegisterOverlay` / `useAnyOverlayOpen`) — see **Escape ownership** below |
| Station entity-context header | `@/components/station/entity-context` (`CartonContextCard` + `StationContextBar`) — Unbox / Triage / Testing / Shipping active-order |
| Workbench chrome scoped search | `@/components/sidebar/tech/TechRailSearchBar` — always-open Search glyph **inside** the field + hover-reveal paste. `variant="rail"` for MasterNav / station footers; `variant="chrome"` for `WorkbenchChromeHeader` / Unbox triage (flush sunken plane — no rounded bubble; edge-to-edge with the triage row). `trailingAction` seats Incoming paste **or** left-dock `RailFilterCollapseButton` (far right of the filter — Unbox Recent · LedgerDrill parent map). Composes `SearchBar` → `SearchField`. The icon-first `ToolbarSearchToggle` was deleted 2026-08-03. **Entry-path bare fields:** `/ops/photos` (always-open chrome `SearchField`); `/search` (context-rail `SearchBar` in `SearchSidebarPanel`; global header launcher stays mounted). Rationale in `ui-design-system.md` → Scoped search chrome. |
| Support reply drafting | ONE waist — `useSupportSuggestion` → `POST /api/support/suggest` → `lib/support/suggest-reply.ts`. The draft bridges into the composer via `ThreadComposerBridge.setDraft` and **never sends**; it never clobbers operator text (the overwrite rule is `seedComposerDraft` in `src/lib/threads/composer-draft.ts` — explicit confirm, one home, two composers). Tenant framing resolves from org settings (`buildSupportSystemPrompt`), never a hardcoded vendor brand. The orchestration is PURE in `suggest-reply-core.ts` (the `analyze-core.ts` split) so the lane gating and the confidence rules unit-test with zero network; `suggest-reply.ts` is the server binding. `sources` are TYPED (`thread` · `ocr` · `catalog` · `rag`) — a bare string could not say whether a draft stood on a document or on a matched row. Surface: the rail's `Assist` display — `display/workbench-service.md` |
| Image understanding (support vision loop) | ONE provider resolution — `resolvePhotoAnalyzeProvider` (org → env → `local-vision`). Deterministic OCR / labels / damage run **local-first** and persist to `photo_analysis` through `analyzePhoto`, the same writer the upload job uses — never a second persistence path, and never a re-run of a photo that already has a row. Whether a customer's image may reach a cloud model is a **safety classification with no default**: `resolveSupportVisionLane` (org `settings.support.visionLane` → `SUPPORT_VISION_LANE` → `local-only`), and `cloud-multimodal` is a REQUEST — it falls back to `local-only` when no gateway is configured, because reporting a lane that did not run tells the operator a photo left the building when it did not. **A model is never handed an app route**: `/api/photos/[id]/content` 302s behind the session gate, so `/api/support/suggest` resolves a signed storage URL itself (`resolvePhotoAccessUrl`) and the client only ever holds photo IDs |
| Decode → our-data cross-reference | `collectPhotoEvidence` (`src/lib/support/photo-evidence.ts`) — OCR tokens pipe through `routeScan` (the ONE decoder, which NORMALIZES a printed URL to its handle) then `hybridSearch` (the ONE search engine). **Never a second matching engine, and never a synthesized hit**: a token that decoded but matched no row is reported as unmatched, because a fabricated title on a customer-facing draft is worse than an honest absence. The assistant reasons over `SearchHit` data, not raw image text — that is the difference between recognising a unit and describing a photo |
| Support requester profile ("who is asking") | `GET /api/support/requester` → `resolveRequesterProfile` (pure core + `requester-profile-deps.ts`). Name/email from the ticket's `via.source.from`, falling back to the helpdesk user roster; our `customers` row by email; order count from `orders.customer_id`; prior-ticket count from the helpdesk search. Every fact degrades to `null` INDEPENDENTLY and renders `—` — **there is no LTV and no return rate, and a fabricated `0` is worse than a missing number.** Linkage comes from the `SupportContextBundle` the thread already fetches, never a second query |
| Omnichannel / chat-style composer dock | `@/design-system/primitives` `OmnichannelComposerDock` (was `StationComposerDock` until 2026-08-01 — a birthplace name on a shared shell, corrected when Support became Workbench branch `service-workspace`; the dock is not Station-contract property) — Unbox overview carton notes **and** all ticket reply chrome (`SupportChatComposer`: inline under thread **and** `variant="station-dock"` via `SupportTicketComposerDock`). Same elevated white shell + auto-grow height; ticket footer = VisibilityToggle · Library (`+`) · Attach (paperclip) · Send (or `trailingAction` as `<StationTerminalDock embedded>` — Send suppressed, Enter still commits). Placement SoT for floating docks: `slicedActionDockWrapperClass()`. Never hand-roll a second sticky/amber ticket composer beside this shell. |
| Resizable document PDF slide-over | `@/design-system/components/DocumentSlideOver` (+ `DocumentPreviewFrame`, `useHorizontalEdgeResize`) — Labels Print, Testing manuals |
| Horizontal pane edge resize grip | `@/design-system/components/HorizontalEdgeResizeHandle` (+ `useHorizontalEdgeResize`) — context rails (`ContextPanelLayout`) + non-modal detail inspectors (`RightRailHost`); never hand-roll a second pill/strip for the same job |
| Recent-rail scrollport / more-below lip | `@/components/sidebar/rail-shell/SidebarRailScrollport` (+ `useMoreBelow` / `SCROLL_MORE_BELOW_CLASS` in `tokens/scroll-edge.ts`) — station + SidebarShell-hosted recent feeds **and** LedgerDrill parent maps; never hand-roll a second bottom fade. `SidebarRailShell` is content-sized and does **not** own vertical scroll |
| LedgerGrid h-scroll edge cues | `applyGridOverflowXClasses` / `overflowXFromMetrics` in `@/design-system/components/grid/grid-overflow-x` — toggles `cf-grid-overflow-start` / `-end` (+ `cf-grid-scrolled` for the frozen pane) from scroll + ResizeObserver; CSS inset shadows in `globals.css`. Never hand-roll a second pair. |
| LedgerGrid sticky bottom X scrollbar | `GridStickyXScrollbar` + `useSyncedHorizontalScrollbar` (self-scroll flex sibling; split-x `sticky bottom-0`) — body keeps `no-scrollbar`; dense/`DataTable` use `TableStickyXScroll`. Never hide triage X behind `no-scrollbar` alone. |
| Buttons | `src/design-system/primitives` `Button` |
| Product icon glyphs | `@/components/Icons` (`src/components/icons/*`) — never duplicate nav primitives |
| Station page + L2 mode nav icons | `src/lib/nav/station-nav-icons.ts` + semantic wrappers `src/components/icons/stations.tsx` — mode glyphs unique via `STATION_GLYPH_KEYS` |
| Top-band chrome icon **display** (glyph box) | `src/components/layout/header-shell.ts` (`TOP_CHROME_ICON_GLYPH` for GlobalHeader Mode / Recents / WO / goal) — native SVG stroke only; do not layer `navIconStrokeClass` on header chips (muddies dense glyphs). Glyph *identity* stays Icons / station-nav |
| Page switcher + Recents (a page's children + cross-page MRU) | `HeaderPageSwitcher` + `HeaderRecentsSwitcher` in `GlobalHeader` — data = `SIDEBAR_PAGE_NAV` / `useSidebarChildNav` / `useRecentPages`. Never a sidebar pill-band twin; no MRU chips in the spine org band. |
| Header pin stations (Quick Access pins) | `HeaderPinsSwitcher` in `GlobalHeader` (hairline after Recents → pin current → sortable icons → overflow) — data = `useQuickAccess` / `cf.quickAccess` cache; durable SoT = `staff_preferences.prefs.quickAccess` via `<QuickAccessSync/>`. Never remount a pin list in a Quick Access / staff menu. The desktop `GlobalHeaderActions` rail is **search · notifications · AI (far-right)** — three, one per KIND (find · be told · ask); Sparkles opens the assistant right-rail occupant at the edge it owns; no staff avatar on desktop. **A persistent top-right icon is earned by FREQUENCY, not by existence** — clipboard history, the phone sign-in QR and the kiosk preview moved to the spine account overflow 2026-08-01 (they were reached once a shift, and six unranked peers read as a toolbar). A fourth icon displaces one of the three or names a new kind. Mobile keeps its own clipboard + phone-QR cluster: it has no spine, so it has no overflow to move them into. |
| Per-staff queue depths ("where is my work") | `InboxQueueLinks` at the top of `ActivityInboxPopover` — `MyDayFeed.queueCards` (Orders · Arrival · Packing · Testing · FBA prep · Support), permission-filtered, zero-work queues already dropped. **Not the MasterNav spine** (ruled 2026-08-02, reversing the chrome-altitude brief's D8; **re-argued 2026-08-03 — see below**) and **not the header badge** — that counts dismissible `ActivityInboxItem`s, and a queue depth is not a thing you dismiss. Shares `useMyDayFeed`'s `['my-day']` key and mounts only when the popover opens, so it costs nothing at rest. **The ruling now rests on ONE leg, and it is the load-bearing one:** `nav-search.ts` re-ranks the whole registry on every keystroke, and that is safe *only* because the registry does no I/O — a live depth on a nav row makes navigation depend on a query. Two of the original three legs are gone and saying so is the point: "a page badge is invisible until you drill" died with the drill (2026-08-02), and "the spine's trailing count already means structural cardinality" died when that count was **deleted** (2026-08-03 — a right-aligned numeral read as a notification, which is exactly what a queue depth would legitimately be). **So the spine is now MORE hospitable to a depth badge than when this was first ruled, not less** — the slot is empty and the shape is free. Do not read that as an opening: the empty slot is the *reward* for deleting a badge that was pulling attention it could not repay, and re-filling it with live data would buy back the I/O cost as well. A future ruling may overturn this; it must overturn it on the I/O argument, not by noticing the vacancy. |
| Identity mark (org + staff circle) | `@/components/identity` — `IdentityMark` (circle · ring · image-or-initials · `xs`…`2xl`) and `StaffAvatar` (photo → colour+initials, resolved by staff id). **Never hand-roll a `rounded-full` + initials span**, and never fork a local `initials()` — the SoT is `staffInitials` (`StaffBadge.tsx`). See **Staff profile photo** below |
| Org / workspace switch | **DELETED from the spine 2026-08-03** — single-org is the norm for small business, so a permanent 40px row naming it restated something that never changes. Identity now reads from the `StaffAccountFooter` ⋯ menu header (`organizationName`); switching lives in Settings → Organization (`WorkspaceSwitcher`). The 40px band STAYS but is empty — the spine is a flex sibling of the header, so that face is what holds both bottom hairlines on one Y. Historic: `OrgWorkspaceControl` in the MasterNav 40px top band — current `organizationName` on a **circle `IdentityMark`** (same `sm` density as the staff footer) + an **always-mounted dropdown trigger**, single-org included. Switch path = `useSwitchOrg` / `requestSwitchOrg`. **No “Current” label in the menu** — the open chevron is enough. **Menu is a child of the trigger** — `AnchoredLayer` `bottom-stretch` + dense `SIDEBAR_SPINE_MENU_*` chrome. Guard: `header-mode.guard.test.ts`. |
| Clipboard history (chord + panel) | `ClipboardHistoryHost` (mounted by `ResponsiveLayout`) owns **⌘⇧V** and the single desktop mount of `ClipboardHistoryPopover`; the spine ⋯ row is a trigger that calls `openClipboardHistory()`. See **Clipboard history placement** below. Guard: `clipboard-hotkey-owner.guard.test.ts` |
| Staff account (spine footer) | `StaffAccountFooter` below Settings/Admin — `StaffAvatarEditor` (click mark → colour + photo, self-service, no Settings trip) · name · role · more · sign-out. **The ⋯ menu IS the desktop account overflow**: phone history · clipboard history · open-on-your-phone QR · kiosk shell preview · report an issue · Quick Access settings. Mobile keeps a compact account avatar in `GlobalHeaderActions`. When the spine is collapsed (0 width), org + staff are unreachable — same as Admin/Settings; open via header toggle / edge peek. **⋯ menu is a child of the footer row** — `AnchoredLayer` `top-stretch` + dense `SIDEBAR_SPINE_MENU_*` chrome; **org name in the menu header is load-bearing** (`SIDEBAR_SPINE_MENU_ORG_CLASS`, never eyebrow). Guard: `header-mode.guard.test.ts`. |
| Staff profile photo | `staff.avatar_photo_id` → the photos platform (`STAFF` entity type). Read it with `<StaffAvatar>`, never a per-surface photo join — see **Staff profile photo** below |
| Scan Stations (spine section) | `STATION_GROUPS` (+ `icon`) + required `stationGroup: 'floor'` on `kind: 'station'` rows in `sidebar-navigation.ts`; membership via `SPINE_SECTIONS` / `spineSectionIdForPage`. **`floor` is the only station group** — the `desk` twin died 2026-08-01 (see the domain row below). Members, in pipeline order: Receiving subgroup (Arrival / Unbox / Local Pickup / Repair Service) + Testing / Packing / Scan out. Subgroup header from `STATION_SUBGROUPS`. **Never move a scan bench into a domain group** — an operator at the dock answers to their input model, not to the domain of the records they touch. Footer-pinned `TechRailSearchBar` above Settings/Admin (+ `StaffAccountFooter` below) swaps the flat map for ranked destinations. Guard: `station-nav-groups.guard.test.ts` + `main-nav-groups.guard.test.ts`. |
| Main Operations (spine section) | `MAIN_GROUPS` (+ `icon`) + required `mainGroup` on `kind: 'main'` rows. **Operations** (was `Live Ops` / `Analytics Monitor`) = Operations only (Live / TV) — it is the only `main` group. Home / Search / Media / Chat top-pinned. Guard: `main-nav-groups.guard.test.ts`. Law: `display/workbench-master-detail.md` (spine context). |
| Workflow Studio (footer pin, **not** a section) | `kind: 'bottom'` row above **Admin** in `APP_SIDEBAR_NAV` (footer renders in array order: **Workflow Studio · Admin · Settings**). Left `MAIN_GROUPS` / `SPINE_SECTIONS` 2026-08-02: defining the operation is a standing-back act, not one of the places browsed through in a shift. **A pinned row never draws children** (`showChildren = !pinned && …`), so `/studio/catalog` is an L2 **mode** of `studio` in `SIDEBAR_PAGE_NAV` — named by ⌘K, the spine's flat search and the GlobalHeader Mode switcher, but no longer a spine row. Footer pins wear the same neutral treatment every spine row now wears (`SPINE_NEUTRAL_ACCENT` — the per-section hue map died 2026-08-02, see the accent row below). Guard: `main-nav-groups.guard.test.ts`. |
| MasterNav spine type ladder | Org band `OrgWorkspaceControl` trigger = `text-role-body`; **identity menus** (org switch + staff ⋯) = dense child — names + actions `text-role-caption`, meta `text-role-micro`, marks `xs`; **a DESTINATION is `text-role-body` semibold (14px)** — L1 page rows, subgroup headers, search-result labels (the section-button and drill-title rows that also carried it are deleted, 2026-08-02); **L2 modes stay `text-role-caption` medium** (12px) so they read as the nested tier; counts = `text-role-micro`; staff footer name = `text-role-caption`. Bumped from an all-12px spine 2026-08-02: pages and modes differed only by WEIGHT — the thinnest signal in the system — and 12px sat under every peer navigator (VS Code 13 · Linear 13 · Notion 14 · Slack 15 · Vercel 14). Density-aware, so `--cf-density` + the Settings text-size control still scale it. Never bare `text-sm` on these surfaces; never sentence-case `text-role-eyebrow` for destinations. Idle page labels use default ink (icons stay muted); idle modes stay default ink. Law: `display/workbench-master-detail.md`. Guard: `main-nav-groups.guard.test.ts` + `header-mode.guard.test.ts`. |
| MasterNav spine accent (**neutral — one treatment**) | `spineAccentFor` / `SPINE_NEUTRAL_ACCENT` in `src/lib/nav/spine-section-accent.ts`. **The eight section hues are DELETED (2026-08-02)** — `SPINE_SECTION_ACCENTS` (sky · amber · teal · emerald · cyan · indigo · green · orange) is gone, and **a per-section hue must not come back**. Colour restated a fact the row already carried (its label + its position in `SPINE_SECTIONS`) and only after you had learned the map; eight saturated fills in one 240px column is a paint chart, not chrome. The job it was defended for was already done elsewhere: ⌘K groups by labelled bands (`CommandBarNavGroup.label` + `sectionIcon`) and `nav-destinations.ts` carries a parent `context` string on every flat search row — so nothing had to be built to replace it. If a section ever needs to be told apart at a glance, the answer is its **glyph and its grouping**, the two channels that survive greyscale, glare and colour-blindness. **The ladder is two soft rungs on the white spine (2026-08-03):** hover = `bg-surface-hover` · **selected / expanded** = one shared `bg-surface-sunken` wash + default ink, **no ring** — active pages, child rows, and expanded section headers (Scan Stations) all share it. **Inverse and `surface-strong` chips are retired:** both read too loud next to Cloudflare's soft Account-home wash; operator call is a ton softer. `spineAccentFor(sectionId)` keeps its parameter deliberately — one answer today, but the seam is where a future **non-colour** per-section distinction lands without re-threading four components. Guard: `main-nav-groups.guard.test.ts` asserts the **absence of any** Tailwind hue (stronger than the old per-hue pins: it fails on a ninth section's colour too) and that selected altitudes share the soft sunken wash. |
| MasterNav row hover/press travel | **There is none — nothing in the spine moves** (2026-08-02). `SPINE_ICON_LIFT_CLASS` is deleted: a structural anchor in a 20-row column should not travel under the pointer, and the neutral wash that landed with the de-chroming answers hover on its own — two answers to one question is one too many. *(The 2px `motion-safe:` lift it replaced was correctly built — the framer `MotionConfig` floor cannot see a Tailwind transform, so the gate was doing real work. It was removed on placement, not on a reduced-motion defect; do not repeat that as the reason.)* The older bans stand unchanged because they are about **cost**: **never** a framer `whileHover` on a spine row (a re-render per mousemove across 20 rows for travel the compositor gives free), **never** a row-level `scale` (breaks the baseline dense siblings align to), **never** a hover/active `font-*` shift (reflows text mid-pointer). Hover is `transition-colors` and nothing else. Guard: `main-nav-groups.guard.test.ts`. |
| Spine row membership (the TWO registries are one declaration) | `APP_SIDEBAR_NAV` (flat rows) + `SIDEBAR_PAGE_NAV` (child-page registry) — `MasterNav`'s `toPageNav` merges them as `{ ...page, icon, label }`, so for any page owning a `SIDEBAR_PAGE_NAV` entry the child registry **wins** every membership field (`kind` · `mainGroup` · `stationGroup` · `stationSubgroup` · `domainGroup` · `href` · `requires`) and the flat row's copy is inert. A disagreement does not error and does not double-render — it silently ships one answer while the other reads as documentation. Declare membership in both **identically**. Guard: `main-nav-groups.guard.test.ts` → "agree on every shared membership field". |
| A page's sub-destinations are CHILD PAGES, never "modes" | `SidebarPageNav.children: SidebarChildPage[]` + `resolveChild()` (`sidebar-navigation.ts`); nav helpers are `filterPageChildren` · `applyChildTarget` · `resolveSidebarChild` · `useSidebarChildNav` · `useActiveSidebarChild` · `useRecentPages`; the GlobalHeader control is `HeaderPageSwitcher`. **Renamed 2026-08-03** — the answer was already in the code: every child carries `to(): { pathname, params }` and every parent a `resolveChild(location)`, and the two round-trip, so they are distinct, deep-linkable, reload-safe URLs (`nav-destinations.ts`: *`/products?view=qc` is a place, not a setting*). The spine flatten made it structural — a child is an ordinary spine row beside its parent, so "mode" named a drill that no longer exists. **`?mode=` ON THE WIRE IS UNTOUCHED and must stay so**: `/dashboard?mode=sales`, `/support?mode=voicemail`, `/review?mode=catalog-link` are bookmarked and `getSidebarNavPageId` parses them. Never rename a param key or value, and never the `sidebar.recentModes` localStorage key. Note the seam: `?mode=` on `/dashboard` and `/support` means "which DOMAIN", which is why one word could not keep doing both jobs. `PACKING_MODE_ICONS` keeps its name — packing styles (standard/fragile/multi) are a genuine mode vocabulary, not child pages. |
| Business-domain sections (spine groups) | `DOMAIN_GROUPS` (+ `icon`) + required `domainGroup` on `kind: 'domain'` rows. **Shipping** (`fulfillment`) = Shipping (Postage · Ready · FBA · Packing Review) — page glyph is Truck. **Sales** · **Inbound** · **Support** · **Sourcing** (own section, 2026-08-03) · **Products** (`catalog` id, spine label Products — browse mode stays Reference) · **Inventory** = Inventory · Locations. Root order: **Scan Stations → Shipping → Sales → Inbound → Operations → Support → Sourcing → Products → Inventory**. Guard: `main-nav-groups.guard.test.ts`. |
| Print is a TASK, never a section | There is no Print Stations drill and no `kind: 'labels'` / `'documents'`. Product labels = Catalog → SKU Barcodes (`/products?view=labels`); bin/rack labels = Inventory → Locations (`/warehouse`, Bin Tags tab); carton stickers = the Unbox bench. Every former Print row was an ALIAS of a URL a canonical page already owned, which is how `/products?view=labels` came to resolve to a nav id (`print-labels`) that was not the page it opened. **Carrier postage is not a print destination** — `/shipping/labels` stays Outbound → Postage and never folds into a label workspace. Guard: `main-nav-groups.guard.test.ts`. |
| Dashboard boards are domain homes, not an L1 | `/dashboard` owns no spine row. `getSidebarNavPageId` reads the `?mode=` DOMAIN and hands the URL to the owning page: `inbound`/`receiving` → Inbound desk (`/incoming`, Docked via redirect), `sales`/`pickup` → Sales, everything else → Outbound › Shipping › To ship. The Inbound desk is a single leaf at `/incoming` (Pipeline \| Docked lanes). Guard: `sidebar-navigation.test.ts`. |
| Review splits by job (`/review`) | `/review` owns no spine row and no `SIDEBAR_PAGE_NAV` entry. Packing QA (bare URL) is Outbound › Shipping › **Packing Review**; `?mode=pairing` and `?mode=catalog-link` are Catalog work and highlight Catalog › Pairing / Listing match. `getSidebarNavPageId` reads `?mode=` to pick the owner. The three workspaces are untouched — merging Review pairing into Catalog pairing is a separate LedgerGrid job, deliberately out of scope. Guard: `main-nav-groups.guard.test.ts` → "Review splits". |
| Hollow sections + hollow pages are forbidden | A section with no visible page renders nothing on the root map (`SidebarNavList`), and a page that DECLARED modes but had every one permission-filtered is dropped wholesale via `isSidebarPageReachable` (composed by `MasterNav` **and** `buildCommandBarNavGroups`). A nav row can carry only one `requires`, so a page needing two gates (Sales: `dashboard.view` route + `walk_in.view` front desk) would otherwise ship a dead header. Absent, never disabled. |

If a facet has no SoT yet, **add or extend one** (pattern evolution) — do not fork a page-local map “just for this screen.”

## Dates & times (civil day vs instant)

- Source: `src/utils/date.ts`. Warehouse business zone is `WAREHOUSE_TIME_ZONE` (`America/Los_Angeles`).
- Keep **three types separate** — never collapse them into one ad-hoc `Date`:
  - **Instant** — timeline moment → ISO-8601 with `Z`/offset; store as `timestamptz`; format with `formatDateTimePST` / `formatTime12hPST` / `formatApiInstant`.
  - **Civil date** — calendar day with no time → `YYYY-MM-DD` only; use `parseDateKey`, `addDaysToDateKey`, `diffDaysDateKey`, `formatDateKeyShort`, `getCurrentPSTDateKey`, `toPSTDateKey`.
  - **Zoned wall-clock** — instant + explicit zone (SQL: `timezone('America/Los_Angeles', ts)::date`).
- **Banned** (guard: `src/utils/date-civil.guard.test.ts`):
  - `new Date(\`${dateKey}T00:00:00\`)` or any local-midnight reparse of a civil key
  - `new Date('YYYY-MM-DD')` then `getDate()` / `toLocaleDateString()` for warehouse labels
  - Host-local `ymd(new Date())` for warehouse “today” — use `getCurrentPSTDateKey()`
  - Bare `toLocaleDateString()` on ops surfaces that must match warehouse day buckets
- **Calendar widgets only:** `dateKeyToLocalDate` / `localDateToDateKey` (same local frame both ways). Do not pass those `Date`s into zoned formatters or `toISOString()` for day logic.
- **Day bounds for SQL/API:** `warehouseDayUtcBounds(dateKey)` or SQL `timezone('America/Los_Angeles', ts)::date`.
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
- **Never `alert()` / `window.alert()`** — native alerts steal keyboard-wedge focus on station benches and are a
  data-loss vector. Station pass/fail belongs on the active card (`.claude/rules/display/station.md` §6); elsewhere
  use `@/lib/toast` or a blocking DS modal/`confirm` primitive. Guard: `src/components/ui/alert.guard.test.ts`
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
- **The engine is named in exactly ONE file** — `src/design-system/motion/framer.ts`
  (`motion/react`). Everything in `src/` imports `@/design-system/motion`. The barrel is what
  makes the package a dependency decision instead of a 220-file migration.
- **The preset catalog is not deprecated.** `framerPresence.*` / `framerTransition.*` are the
  physics roles resolve to, and remain legal for surfaces no role covers. Do **not** sweep
  existing call sites onto roles for symmetry — migrate a surface while you are already
  editing its motion.
- Guard: `src/design-system/foundations/motion-major.guard.test.ts` (import boundary + single
  major + role↔preset identity).

## Unbox centre (main)

**Main dogfood ships a PO-line centre** (2026-08-04 park): carton context sticky →
interactive `POUnboxingSection` (`editLines` + `serialScan` → condition + serial) →
`UnboxLabelPreview` → bottom dock notes + Print · Receive. Displays push column
unchanged (Pairing · Classify · …). Optional ring-only `checklist` is procedure
status, not a required twin of a centre deck.

Guided `ProcedureDeck` / step dock / step bodies continue on **`unbox-work`**
(`../cycleforge-unbox`). Do not remount the deck on main without an explicit
product redirect.

## Scan-station procedure focus deck (parked lane)

**The Procedure Focus Deck remains the hero on the `unbox-work` lane** (and any
future scan bench that opts into a derived procedure). When that lane is active,
the centre column shows this deck — identity bar above, items reference pinned
when applicable, **deck filling the visual weight**, composer dock below. Nothing
else may outrank it on that lane: not Displays, not Pairing, not a PO accordion
mounted as a peer of the deck.

### Prominence hierarchy (derived-procedure benches — unbox-work lane)

| Priority | Region | Role |
|---|---|---|
| **1 — Primary** | **`ProcedureDeck`** (centre) | *What do I do right now?* 40px step faces (outline when selected) + evidence band under the list. This is where the operator's eyes return between scans and photos. |
| 2 — Reference | `UnboxItemsPanel` → `ReceivingLineContentsRow` (when pinned) | What is in the box — Zoho thumb + title + meta; context for the active step, not a competing work surface. |
| 3 — Navigation | Right-edge Displays (`ProcedureChecklist` via progress ring) | *Where am I in the whole job?* Secondary map — clicks move centre focus, never replace the deck. |
| 4 — Action | Bottom dock leading zone + terminal | Step actions + Print · Receive — hand zone, not the visual hero. |

**Anti-patterns that demote the deck (on that lane):** mounting the procedure as a sidebar region (retired
2026-08-01); a tab strip that splits attention with the procedure; a centre PO accordion or
label preview that shares the column with the deck; animating or highlighting the dock more
prominently than the deck on step advance.

### Step-advance feedback (flat foundation)

When the procedure pointer moves — a step fact satisfied, pager commit, checklist
focus, or face click — faces stay **40px** (outline moves); the evidence band
under the list crossfades content only:

- **Evidence body:** `framerPresence.procedureFocusBody`
- **Travel:** `scrollIntoView({ block: 'nearest' })` on the host port
- **Retired on this surface:** in-face expand / eyebrow chrome, `motionRole.procedure.advance`,
  `runProcedureStackAdvance`, `layout="position"` pile settle, peeks, covered tuck,
  crown scrub (catalog role may remain deferred)

Law: `display/station-workbench.md` → Procedure Focus Deck · guard:
`procedure-deck-order.guard.test.ts`.

### Modules (compose, never fork)

| Concern | SoT |
|---|---|
| DS primitive | `@/design-system/components/procedure` `ProcedureDeck` |
| Unbox adapter | `UnboxProcedureDeck` |
| Layout geometry | `procedure-stack-layout.ts` → face/gap rem constants |
| Step derivation | `useUnboxProcedureSteps` + `deriveProcedureSteps` |
| Vocabulary | `src/lib/stations/procedure.ts` — **named flows** (`found` · `unfound` · `return`) + shared step catalog + modifiers (`isLocalPickup` · `needsClassify`); not co-occurring boolean variants |
| Pointer | `procedure-pointer.ts` + `procedure-focus-store.ts` |
| Step bodies / dock | `UNBOX_STEP_BODIES` · `UNBOX_STEP_DOCK_CONTROLS` |

Two views, ONE derivation: centre deck + right-edge checklist both read the same hook.
Unbox selects a **named flow** from intake/pairing (`resolveUnboxFlow` /
`resolveContextFromFlags`); local pickup is a within-flow modifier, not a fourth SOP.
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
  following visibility so an invisible box never eats the header cell's clicks. **Unbox exception
  (2026-08-03):** the same `GridColumnGutter` trigger portals into the triage-band controls slot
  (`triggerPortalTarget`) beside staff / filter / week — resident among refine icons, still one
  door (open state + rail stay on the gutter). Neither
  `LedgerGridColumnHeader` nor `OrdersQueueColumnHeader` may take `onOpenColumnDetails` — the guard
  bans the prop, the marker and `pr-9` in both, and the E2E asserts invisible-and-inert at rest
  on non-portal surfaces.
- **Width is a drag, and there is ONE handle** — `ColumnResizeHandle`. It mutates only the surface's
  `--cf-col-<key>` var, so header, rows, summaries **and the frozen pane's sticky-left `calc()`**
  reflow together with no React render; the width commits once on drop via `useGridColumnWidths` to
  `staff_preferences.tableColumns[t].widths`. `isGridColumnResizable` decides who gets a grip:
  variable-content tracks yes; `select` and the fixed-format types (`number` · `id` · `location`) no,
  because those cells render a last-8 chip or a short numeral run and a drag only moves whitespace.
  A genuine exception sets `resizable` on the column model. Mid-grid keeps Airtable left-owns-divider
  (one trailing grip per resizable column). **At the frozen identity edge**, title's trailing grip is
  flush (no overhang into the scrollable pane) and the first resizable column after `frozenEdgeKey`
  also mounts a leading grip (`resolveColumnResizeEdges`) so grabbing Incoming By / Orders Ship by
  resizes that column, not Product. **Reset to default clears widths too** — a Reset that left the
  grid visibly non-default would be lying about what it did.
- **Receiving leftover width (2026-08-04):** absorb slack with a trailing structural `_fill`
  (`minmax(0rem, 1fr)` on `RECEIVING_GRID_COLUMNS`) — empty header/body, no `hideKey` / sort /
  resize (`isGridColumnFillTrack`). Fact tracks stay content-hard; Product is **not** the flex
  track. Filler is geometry only — Column discovery stays triage ▤ / header menus, never an
  in-grid add door on `_fill`.
- **Typed date track floors (2026-08-04):** `dateFace` (`day` · `stamp` · `duration`) +
  `resolveGridColumnMinTrackRem` in `grid-column-type-track.ts` — same discipline as
  `ALIGN_BY_TYPE` / `ColumnTypeGlyph`. Stamp = day+time (`Aug 3 4:54 PM`) → **12rem**; day
  default 4.5rem; duration 3rem. SoT width must clear the floor; drag-resize clamps to it.
  Receiving History DATE declares `dateFace: 'stamp'`.
- **Never call `useIsColumnHidden()` from a grid family** — it is the retired cell-granularity path
  that left an empty ruled band instead of removing the track. It survives on **four** surfaces, and
  the list is pinned shrink-only by `use-is-column-hidden.guard.test.ts`: the chip/meta SLOT
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
- Guard: `src/lib/tables/grid-surface-capabilities.guard.test.ts` — two halves: the hand-listed bags,
  **plus a disk walk of every `<LedgerGrid` / `<LedgerGridSurface` mount** asserting each is
  registered against a declared bag (only `LedgerGridSurface.tsx` itself is exempt). The hand list
  alone stayed green through both undeclared mounts above.

## Grid cell chrome

- Source: `src/design-system/components/grid/grid-cell-chrome.ts` — `ledgerGridCell` /
  `LEDGER_GRID_FROZEN_CELL` / `ledgerGridRowShellClass` / `LEDGER_GRID_WIDTH_VAR`.
- **One chrome helper for every LedgerGrid family.** Header, leaf rows, and group summaries
  compose `ledgerGridCell({ rule, inset })` so hairlines and insets cannot drift. Surface layouts
  may keep thin aliases (`incomingGridCell`, `ordersQueueGridCell`, …); new code imports the DS
  names. Do not re-declare `flex … border-r border-border-hairline` beside the SoT.
- **`inset: 'grid'`** (airtable skin) owns both axes of padding + `overflow-hidden`; `'cell'` is
  horizontal-only for board skins; `'none'` is the select gutter.

## Grid identity pane

- **The frozen pane is declared on the column model** (`frozen: true`), and the key list is
  **derived** with `gridFrozenKeys(columns)` — never re-typed beside the model. One declaration
  drives sticky-left + immovability under drag-reorder today. **Operator-editable freeze**
  (pin any column like Google Sheets) is the intended future capability — do not treat today's
  hard-coded panes as permanent product law beyond the select gutter floor.
- **It is a per-surface answer to "what stays pinned while facts scroll."**
  - **Unbox Sheets golden (major SoT, 2026-08-04):** freeze **`select` only**.
    Order and Product scroll with the sheet. Consumers: Unbox Recent / Queue /
    Testing · Unbox History · **Incoming Pipeline**.
  - **Unbox click-select (Sheets golden, major SoT, 2026-08-04):** plain **click**
    toggles bulk membership (row wash via `ledgerRowFillClass`); **double-click**
    (Enter when focused) opens the record. Select track stays for **header
    select-all** (empty body spacer — no row checkbox faces).
    - **Unbox History:** open = carton READ (`/carton/[id]`); row paint is the
      triage-band paint-bucket left of List|Drill (`HistoryRowPaintChrome`), not
      a grid header cell. Gate is `embedded && isHistoryMode` only.
    - **Incoming Pipeline:** open = right-rail inspector. Gate is
      `isIncomingMode`.
    Recent / Queue / Docked keep the select gutter (`'always'` chrome + two-plane
    law).
  - **Orders** still freeze **`select · order · title`**: the sales order is the
    *container* an operator arrives by on that denser queue.
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
  into the pane therefore *retires* its pref key; a stale `hidden: [...]` delta goes inert on its
  own, which is the whole migration.
- Guard: `src/lib/tables/grid-column-tier.guard.test.ts` (pane derived from `frozen`, contiguous
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
- **Hard rule — MAGNITUDES end, LABELS start.** Header and cell resolve the SAME decision
  from the column model; never re-decide with a per-surface ternary or a hand-typed
  `justify-end` / `text-right` on the cell.
  | Type | Align | Examples |
  |---|---|---|
  | `number` · `id` · `date` | **end** | Qty · price · SKU / item number · serial · ticket · civil day / stamp / duration |
  | `text` · `longtext` · `tag` · `external` · `location` · `tracking` | **start** | Product title · condition · status · platform · tester name · bin code · tracking last-8 |

  **The test is magnitude vs label, never digit-ness.** A magnitude is compared *down* the
  column — the eye reads the ones place, so the right edge has to stack. A label is *read*,
  one row at a time, and reading starts at the left edge. `location` / `tracking` are made of
  digits and are still labels (2026-08-02; glyph split 2026-08-04 — folded map vs MapPin);
  `date` is a magnitude you compare (“which line is sooner?”)
  and end-aligns with qty (ruled 2026-08-03, reversing the date half of the 2026-08-02 pass).
- **An identifier that IS the row's transaction identity aligns START, not end** (ruled
  2026-08-02). A **PO number / sales-order number / order id** is a *name you read*, not a
  magnitude you compare down a column, and on an order-anchored surface it is the thing the
  operator scans first — so it reads left, like a title. A **catalog item number / SKU** is the
  opposite: an attribute *of* a product whose identity is its title, so it stays end-aligned with
  the other reference identifiers.

  | Identifier | Surface role | Align |
  |---|---|---|
  | PO # · sales order # · `order` | the row's own transaction identity | **start** |
  | SKU / item number · serial · ticket | a reference attribute of the row | **end** |
  | tracking (`tracking`) · bin (`location`) | an identifier you read and retype | **start** |

  The `order` case is a **role** distinction, not a new type — both `order` and SKU are
  `type: 'id'`. Express it with an explicit `align: 'start'` on the order column in that
  surface's layout model (the override below), never by changing `ALIGN_BY_TYPE.id`, which
  would drag SKU and serial with it.

  **Status: SHIPPED 2026-08-02.** `ALIGN_BY_TYPE.id` is unchanged (it still resolves `end`, which
  is what keeps SKU / serial / ticket right-aligned); the exception is an explicit
  `align: 'start'` on the `order` column in `dashboard-order-row-layout.ts` (both models),
  `receiving/receiving-grid-layout.ts` and `receiving/incoming-grid-layout.ts` — the same three
  order-anchored surfaces that freeze `order` into the identity pane, which is not a coincidence:
  a column earns the start-align for being the handle the operator arrives by, and that is the same
  property that earns it the freeze. `ledger-grid-column-display.spec.ts` D2 already asserted
  `flex-start` for `order`, so no assertion moved — **the spec was the source that agreed with the
  ruling first, and it must never be edited down to match the code.**
- **`location` / `tracking` are ADJUDICATED `start` (ruled + shipped 2026-08-02; glyph
  split 2026-08-04 — folded map vs MapPin); `date` is ADJUDICATED `end`
  (ruled + shipped 2026-08-03).** Tracking last-8s in an 8rem track left ~3rem of empty track on
  the LEFT of every row when end-aligned, so the eye could not run a straight line down the
  identifiers — which is the entire job of a column. That bench finding still holds for
  both. Civil days and durations are the opposite: operators compare them down the column
  the same way they compare qty (“which line is sooner / overdue?”), so `ALIGN_BY_TYPE.date` is
  `end` with `.number` / `.id`. (An earlier 2026-08-02 pass had moved both `date` and `location`
  to `start`; the operator re-adjudicated dates alone on Incoming By / Age.)
  - Blast radius, checked: `date` types `date` / `sla` / `age` / `tested` / `logged` / `created` /
    `last_counted` / `due` / `testedAt` — all civil days, stamps, or durations, all end.
    `location` (bin / staging) and `tracking` (carrier #) — all start; header glyphs are
    folded map vs MapPin. `DataTable` derives from the same SoT, so the admin / settings
    lifecycle tables move with the grids.
- Explicit `align` on the column model is the ONLY override — use it where a column's *type*
  disagrees with its *content*. One live case:
  - **`order` → `start`** — a transaction identity typed `id` (above).

  Also correct for a column that is numeric-looking for the header glyph but whose *cell* is prose
  or a categorical chip (catalog `inventory`). Declare the exception once on the layout SoT.
- Guard: `grid-column-display.guard.test.ts` (+ `grid-header-align.test.ts`). Every LedgerGrid
  row / summary / header must compose the SoT helpers — never fork alignment per surface.

## Collection-surface action planes

- Four planes, one primary each: **in-cell** (cell-anchored editor) · **row-scoped** (hover controls +
  single-row menu) · **multi-select** (`ContextualSelectionBar`) · **record** (detail inspector / full
  page). Full decision table: [`display/workbench.md`](display/workbench.md).
- **Actions diverge by lifecycle stage; column layout and grid components diverge only by data domain.**
- The **record plane stays a complete superset** wherever the in-cell plane is conditionally
  unavailable (mobile, non-airtable skin) — otherwise a field becomes unreachable on the surface that
  cannot show its primary plane.
- **Identity columns (`select` · `title`)** — frozen, immovable, and **never in-cell editable**
  (`GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` in
  `src/design-system/components/grid/grid-column-editability.ts`). Correction at the record plane.

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
| **Center** | Sunken work surface (station deck · grid · master detail) | `flex-1` on `CONTEXT_PANEL_HOST` / work canvas — floor = `MIN_WORK_SURFACE_PX` (**784**) in `src/lib/right-rail/frame.ts` (station workbench ~720 + gutters; Outbound show-all ~640 + gutters — take the larger) |
| **Right edge** | **One** details column | `DETAIL_STACK_RESIZE` — min **360**, default **420**, `maxWidthPadPx` **960** · occupants via `RightRailHost` / `RIGHT_RAIL_PRIORITY` |

Hard rule: `sum(open rail widths) ≤ available − centerMin`. If false, **yield**
(collapse / park / crossfade) — never shrink the center below the floor.

Push threshold for a right-rail occupant: `RIGHT_RAIL_PUSH_MIN_FRAME_PX`
(= `MIN_WORK_SURFACE_PX` + gutters + detail min ≈ **1144** content-row px with
flush planes / zero outer gutters). Below that, the shipped ladder overlays
rather than crush the work surface.

### Yield ladder (operator-open multi-column pressure)

When several columns are open and the budget fails, collapse/compress in this
order before touching the center floor:

1. **MasterNav** → closed / icon strip (operator-recoverable; scan work is not)
2. **AI assistant** → yield the right slot (ambient)
3. **Context recents** → park strip / ephemeral mask (`frame.ts` park)
4. **Ticket / record detail** → park strip or close occupant
5. **Never** the center below `MIN_WORK_SURFACE_PX`

Inverse when space returns: restore by last operator intent, not blindly.

**Shipped right-rail push ladder** (`resolveRightRailFrame` in `frame.ts`) is the
narrow case of this law for a single right occupant: park the **context rail**
(ephemeral mask — never write `context-panel-collapsed`), then overlay. The spine
is **not** auto-closed (navigator must not vanish under the operator). Aspirational
left-donor order when the spine actually has width remains “left before grid”;
the common case today is spine width **0** (`navOpen` unpersisted default false).

### Explicit bans

- **Five full preferred-width columns** (spine + context + center + ticket + AI)
  as a laptop (~1440) default — that sum exceeds the center floor.
- **Dual full-width right columns** — AI beside ticket/record details. They share
  **one** right-edge slot (see **Right-rail modality**). Wide-breakpoint dual-right
  is **not** the house default and must not ship without a budget gate + SoT growth.
- A future `column-registry` code module may grow `frame.ts`; until then this law
  **composes** `frame.ts` + `CONTEXT_PANEL_RESIZE` + `DETAIL_STACK_RESIZE` +
  `RIGHT_RAIL_PRIORITY` — never a page-local width math twin.

## Right-rail modality (the detail slot)

- **Every resident edge PUSHES. Nothing floats over the work surface.**
  (Ruled 2026-08-01, superseding "navigators push, inspectors float".) The left
  spine (`SidebarNavColumn` / MasterNav) is a **resident push column** — it
  dictates permanent workspace layout, so opening it moves the frame. The
  **left context-sidebar wrapper** is `ContextPanelLayout` (route rail beside the
  workspace — not the spine): every mounted rail is drag-resizable + collapsible
  via `CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE`. **Display dismiss** is
  `RailFilterCollapseButton` on `TechRailSearchBar` `trailingAction` (Unbox
  Recent filter · LedgerDrill parent-map filter parity — bottom age column only,
  no sash-top chevron); secondary gesture is drag-past-min on the trailing
  `HorizontalEdgeResizeHandle` (`edge: 'trailing'`). Right-rail **record
  inspectors** are **non-modal push columns** (`modal={false}`): same inset card,
  no scrim, and the workspace reflows beside them rather than under them.

  **Width order of sacrifice — the panel takes its space from the LEFT before it
  takes it from the grid** (see **Frame column budget**). Aspirational left-donor
  order: spine width (when open) then context rail; **shipped** `frame.ts` parks
  the context rail only (never auto-closes the spine). Only a viewport that cannot
  seat `MIN_WORK_SURFACE_PX` after donors are parked may fall back to overlaying.
  That order is the whole ruling — it is what the earlier float-only rule lacked.

  **IMPLEMENTED 2026-08-01, with one correction the ruling had wrong.** The
  ladder lives in `src/lib/right-rail/frame.ts` (`resolveRightRailFrame`, pure +
  unit-pinned) and it has **two rungs, not three**: measured in the running app
  at 1440 and 1920, `[data-sidebar-nav-column]` reports **width 0 on every
  route** — `navOpen` is unpersisted `useState(false)` — so a spine rung would be
  dead code in the common case, and displacing it would fight
  `SidebarNavColumn`'s own ruling that a navigator must never auto-close. The
  only real donor is the **context rail** (360px flush card). Order is therefore:
  rung 0 nothing yields → rung 1 the context rail parks → else overlay.

  **The park is an EPHEMERAL MASK, never a write.** `ContextPanelLayout` reads
  `parkRail` and ORs it into its collapsed state; it must never call
  `setCollapsed(true)` from that path, or opening a record would silently leave
  `context-panel-collapsed` set in the operator's localStorage forever. A
  push-park renders **no expand strip** (the rail returns on its own when the
  panel closes, so a restore button that cannot restore is worse than none) —
  which is why a push-park costs **0** in the ladder while an operator-chosen
  collapse costs the 32px strip.

  **The threshold is derived, not a breakpoint:** `MIN_WORK_SURFACE_PX` (784) +
  `RIGHT_RAIL_GUTTER_PX` (0 — flush planes, 2026-08-03) + detail min 360 =
  `RIGHT_RAIL_PUSH_MIN_FRAME_PX` **1144** content-row px. Below that, overlay.
  *(Historical 2026-08-01 float-era arithmetic used gutters and read **1160** —
  do not reintroduce that number.)* The floor is deliberately ONE static
  constant and **not** a per-lane `contentMinWidthRem`: on `/dashboard` that
  value is filtered by a `ResizeObserver` on the very scrollport the push
  narrows, so feeding it back would make the decision depend on its own outcome.

  **Measured before/after** (1440, `/review?mode=catalog-link`, pre-flush
  gutters): the float covered **400px of the grid** and the work surface yielded
  0; the push left zero overlap and the grid gave up only ~60px because parking
  the rail returned the open rail width. Proof is geometric
  (`table.right <= rail.left`), not visual — a screenshot cannot tell "pushed"
  from "covered". With flush gutters the same ladder still parks the 360px card.

  **Why this reversed.** The float was chosen because "at 1440px the arithmetic
  does not permit it" — true only while the left columns were treated as
  immovable. It bought that arithmetic with permanent occlusion of the trailing
  grid columns, which got worse the moment selection (not just an explicit open)
  started mounting the rail: on `/dashboard` the panel is up whenever anything is
  checked. Operators read the panel and the row together; a surface that covers
  the row it describes is the wrong trade.

  Mechanism is the **deliberate PUSH toggle** already sanctioned in
  `display/motion-crossfade.md` — tween (never a spring, which would rubber-band
  the width every sibling lays out against), fired by an explicit gesture, with
  fixed-width edge-anchored content inside an `overflow-hidden` host. Copy
  `SidebarNavColumn`'s recipe; do not invent a second one.

  Modal remains reserved for blocking wizards and destructive confirms
  (delete, …) — **not** Unbox Claim (station push, same family as Ticket).
- **Panel header grammar (ruled 2026-08-01; identity density 2026-08-01).** Every
  **record** right-panel occupant wears the same header outline (full recipe:
  [`display/right-rail-inspector.md`](display/right-rail-inspector.md)):
  - **Row 1 is the icon action row.** Actions are icon-only
    (`PaneHeaderActionBar iconOnly`, which keeps each `label` as the
    `aria-label`). The action set is **contextual per occupant** (orders ≠
    incoming ≠ catalog-link) — pass a per-rail `PaneHeaderActionBarAction[]`;
    never hardcode one product's icons into the shell. **Never a labelled
    button block that duplicates this row** elsewhere in the panel (the
    dashboard inspector shipped two red Delete buttons because the footer
    action set carried its own). A single **primary CTA** band in the footer
    (Link listing / Resolve / Save) is allowed; it is not a twin of the icon
    strip.
  - **The far right of that row is `close · up · down`, in that order**
    (amended 2026-08-02; it read `up · down · close` until then) — dismiss
    LEADS the cluster, record prev/next follow. One right-aligned cluster, not
    split across two rows.
    **Why close leads:** dismiss is the control an operator reaches for without
    looking, so it takes the **stable** end. Prev/next appear and disappear with
    the queue behind the record — a panel opened from search has no cursor at
    all — and a trailing close would shift under the cursor every time they did.
    **The glyph is `ArrowRightToLine` (`>|`), not an `X`.** The right edge
    PUSHES: the panel is parked back against the edge it came from, not
    cancelled, and the arrow says which way it goes. `PaneHeaderCloseButton`
    defaults to that (`intent="push"`); pass `intent="dismiss"` for the rare
    pane that genuinely goes away rather than sliding aside.
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
    ring in it**. The scan-progress ring lives in the dock under-row (right-
    aligned under the terminal) because it is the Displays toggle and that
    affordance must stay put whether a push column is open or not — without
    occupying the right-edge inspector corner.
    - **`↑` is NEXT, `↓` is PREVIOUS** (inverted 2026-08-02). The queue behind
      the carton reads newest-at-top, so advancing through it moves the cursor
      **up** the list: the chevron points the way the operator is travelling,
      not the way an array index counts. Label, `aria-label`, testid and handler
      all follow the ACTION — only the glyph is positional. A tooltip that
      promises one carton while the click delivers the other is the one failure
      here that an operator cannot diagnose.
  - **A push column's dismiss belongs to the COLUMN, at the column's top-left**
    (ruled 2026-08-02, superseding "the cursor trio is rail-scoped" from the day
    before). `UnboxPushColumn` renders it in a real header band
    (`UNBOX_PUSH_TOP_BAND`) from the occupant's own `onClose`, so Displays ·
    Ticket · Claim · tool all close the same way, and the operator reads one row
    across the open column: `[→|] ……… [↑ ↓]` (carton cursor stays pane top-right;
    the progress ring is under the dock).
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
        (`getBBox()` less half the stroke, scaled) on **Claim, not Displays**.
        `getBoundingClientRect()` on an `<svg>` is the element box and will
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
    carton-close appeared. Guard:
    `unbox-right-edge-chrome.guard.test.ts` → *B*.
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
  - **The order surfaces are ONE header, not two.** `RecordPaneHeader`
    (`src/components/order-record/`) replaced `ShippedDetailsHeader` +
    `OrderIdentityHeader` on 2026-08-02: same identity band, same action bar,
    differing only in whether a tab strip followed — which is now a `tabs`
    slot. Two components meant every grammar change had to be made twice, and
    twice is how one of them lost its close button. Open-full-page is an
    **action in the icon row**, never a lone `IconButton` beside close.
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
  2. **Station push column** — `UnboxPushColumn`. Squeezes its own station's
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
  dock-anchored scan-progress ring — not the icon strip — and shows a **selected face**
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
  construction (`getRightRailTop()`), so a region pinned beside it is a *second*
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
  shared shell `UnboxPushColumn` (`ReceivingDisplaysPushStack` /
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
  Unbox adapts via `UnboxScanProgressControl`). The ring is **always
  dock-anchored** under the terminal (same place open or closed; Unbox:
  `UnboxDockHost` progress row); the Displays strip
  keeps the vertical ⋮ only — **no Checklist strip cell**, and **no `rightSlot`
  pencil** since Package Pairing became the `pairing` display itself
  (2026-08-02; a tab's selected-ness IS its open state, so a toggle beside the
  strip would be a second flag to drift — `display/station-workbench.md`).
  Hover peeks
  the full checklist in a Cursor-style overlap just above the ring (`top-end`,
  viewport-clamped) with a footer to open Displays; hover is off while any push
  rail is open; click
  opens/closes/switches `checklist`; selected face when checklist is showing.
  Ticket reopen is carton identity Reply / `?ticketView=1` — **no** parked
  right-edge expand strip (removed 2026-08-03; the progress ring already opens
  Displays).
- **Do not "fix" a non-modal occupant by adding a focus trap.** The host has never
  installed one, so `aria-modal="true"` was a claim the DOM did not honor; non-modal
  markup is the honest form.
- **Non-modal occupants are resizable + collapsible** via `DETAIL_STACK_RESIZE` /
  `DETAIL_STACK_COLLAPSE` + `useHorizontalEdgeResize` + `HorizontalEdgeResizeHandle`
  (`edge: 'leading'`, `placement: 'outset'` — grip outside the left border; aside uses
  `overflow-visible` with an inner clip shell, same as the context rail). Collapse
  parks the aside (width → 0, stays registered/`inert`) + slim right-edge expand strip
  (`detailStackCollapseStripClassName` / `detail-inspector-expand`). The width cap is
  derived, not taste: viewport − (sidebar + the grid's own min content width). Modal
  occupants keep the fixed `DETAIL_STACK_LAYOUT.widthPx` (no resize/collapse strip).
  Ticket / Claim push reuse the same resize grammar with station-scoped storage keys,
  absolute `maxWidth` (chat / wizard ceilings), and `maxWidthPad`
  (`UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX` = `MIN_WORK_SURFACE_PX`) tuned to leave
  Unbox usable; dismiss uses the same edge `onCollapse` chevron as the context
  rail. Ticket reopen is carton identity Reply — no parked right-edge expand strip.
  **Flush planes (2026-08-03):** `TICKET_PUSH_HOST_PAD_CLASS` is empty; wide
  `UnboxPushColumn` is coplanar (`DETAIL_STACK_PUSH_COLUMN_CLASS`) — no host
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
   encodePrintMatrix()  ─── printed symbol ───► routeScan()
   @/lib/qr/platform-link                       @/lib/barcode-routing
```

- **One encoder.** `encodePrintMatrix` returns the three coupled decisions —
  `{ value, symbology, hri }` — for every printable matrix that leaves this
  app: `carton` · `unit` · `as_listed` · `ticket` · `location`. Nothing else
  decides any of the three. A kind that still encodes a bare handle carries an
  allowlist entry stating WHY (the path it would point at has no anonymous
  landing). Guard: `print-matrix-sot.guard.test.ts`.
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
    no AIs (blank sticker). Guard: `location-label-encoding.guard.test.ts`.
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
  with `useOrgGs1()` (→ `GET /api/org/gs1`, gated `print.label`, **resolved**
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
  were two divergent `includes()` matchers before, disagreeing on both what was
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
- Guard: `src/components/layout/cmdk-owner.guard.test.ts`.

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
  hazard:** capture runs before bubble, and `stopPropagation()` there stops the bubble
  listeners from ever running — which is how a queue-level Escape silently closed the
  inspector while the popover stayed on screen.

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
  real 700 and silently defeats the cap. Guard: `typography-tokens.guard.test.ts`.
- **The condensed cut is bound to the role, not opted into.** `text-role-eyebrow` /
  `text-role-micro` carry `font-family: var(--ds-font-condensed)` from the CF Type plugin in
  `tailwind.config.ts`, so 10–11px chrome stays legible without wrapping a grid column. Writing
  `font-condensed` by hand to narrow arbitrary text is the fork this binding exists to prevent.
- **600 is the hard ceiling** (`MAX_FONT_WEIGHT`). `font-bold` / `font-extrabold` / `font-black`
  are banned; the 700+ cuts are not loaded, so a stray one is synthesized faux-bold. Use
  `font-semibold`, or no weight class at all where the role bakes 600. Emphasis comes from color
  contrast and tracking. Genuine one-off: same-line `ds-allow-weight`.
- **Numerals:** `role-display`/`-title`/`-data` bind `tabular-nums` intrinsically (opt out with
  `proportional-nums`); the mono cut never ligates, so a serial is always retypable.
- Guard: `src/components/ui/typography-tokens.guard.test.ts`. Codemod:
  `scripts/codemods/cap-font-weight.mjs`. Printed media (`lib/print/**`, repair paper) is exempt —
  different substrate.

## Focus affordance

- Source: `src/design-system/tokens/focus-ring.ts` — `focusRing(archetype, tone)` returns a `cn()`-ready
  class string. Archetypes: `field` (`:focus`), `control` (`:focus-visible` + offset), `wrapper`
  (`:focus-within`). Semantic tones: `accent`/`danger`/`warning`/`success`/`neutral`.
- Never hand-roll a `focus:ring-*`/`focus-visible:ring-*` recipe; compose `focusRing(...)`. Guard:
  `src/components/ui/focus-ring-tokens.guard.test.ts` (escape: same-line `ds-allow-focus`).

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
- Each role resolves to one `shadow-elev-*` utility (tailwind.config.ts
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
   (three bands — tabs · KPI · `OutboundTriageBand`; Sheets click-select on
   `railSelection`).
2. **Body** — mount the grid in `WORKBENCH_SHEET_HOST` (no side/bottom pad).
3. **Surface** — `LedgerGridSurface` `surface="sheet"` (owns
   `TABLE_SURFACE_SHEET_CLASS`). Do not hand-compose the CLIP class beside it.
4. **One hairline per seam** — the **upper** band owns the bottom rule; the
   **lower** band owns no top. Unbox / To-ship: KPI row carries `border-b`;
   triage (`UnboxTriageBand` / `OutboundTriageBand` / `WorkbenchTriageBand`) is
   `border-r` only; the sheet keeps `border-t`. A triage `border-b` + sheet
   `border-t` would double the joint. Incoming: KPI band owns `border-b`; sheet
   keeps `border-t`.
5. **Column header band = `h-10`** — `LedgerGridColumnHeader` row / select /
   fact cells match Unbox chrome bands (`h-10` / 40px). Receiving leaf +
   summary rows share the same `h-10` so the frozen select header and the
   first body cells read as one rhythm. **Orders is the permanent allowlisted
   fork** (`OrdersQueueColumnHeader` `min-h-11`) — do not force it onto `h-10`.
   Guards: `receiving-grid-sheet.guard.test.ts` · `incoming-grid-sheet.guard.test.ts` ·
   `dashboard-orders-sheet.guard.test.ts`.
6. **Freeze** — Unbox Sheets golden freezes **`select` only** (`order` / `title`
   scroll). Operator-editable freeze (pin any column) is future. Full per-surface
   table: **Grid identity pane** above. Guard: `grid-column-tier.guard.test.ts`.

Airtable skin (`data-grid-skin="airtable"`): continuous RIGHT+BOTTOM cell rules
(`border-default`) through **header and body**; shell owns the outer perimeter
(drop trailing column right rule).

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
  use — digit / id / date end, word / tag start. Never hand-type `text-right` inside `cell()`; the
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
  `stack-tight/row/section`, `row-gap/tight` — tailwind.config.ts plugin + safelist + `cn()`
  `cf-*` groups, all pinned by the keystone test) or the `Stack`/`Inset`/`Row` primitives.
  An intent is the whole padding story for its element — never mix it with raw `p-*` there.
- Never hardcode arbitrary-px spacing. Guard: `src/components/ui/spacing-tokens.guard.test.ts`
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
- Receiving type faces: `src/lib/receiving/receiving-type-meta.ts` (+ `ReceivingTypeMark`).
- Urgency / priority is a priority-tier picker on `receiving.priority_tier`; SoT is `src/lib/receiving/priority-override.ts`
  (`is_priority` = synced tier-0).

## Copy-chip / serial display

- Three layers: pure helpers in `src/lib/copy-chip-format.ts`; behavior in `useCopyChip` / `useChipTooltip` (`@/hooks`);
  `CHIP_TONES` tone registry in `CopyChip.tsx` (incl. `price` for unit cost).
- Condition meta chips use `ConditionGradeChip` → `src/lib/condition-tone.ts` for per-grade underline/icon hue.
- `resolveSerialDisplay` / `resolveChipDisplay` are the label SoT for serials/chips.
- Display preview is **last-8** (`CHIP_DISPLAY_LEN` / `getLast8` / `getLast8Serial`); empty face is `--------`.
- Filled carrier tracking in order identity (`OrderIdentityChips`) is
  `TrackingNumberMenuChip` — primary copy; hover Open tracking page · Replace
  tracking (Replace opens `detail:order` on Shipping with the replace editor
  armed — never clipboard-steals). Receiving TRACK cells stay plain `TrackingChip`.

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
- **Receive / push-to-PO carries the item note**, never a print-only
  LabelEditPopover edit that never hit the dock: a pure print artifact must
  not travel to Zoho.
- **Grain must be legible in the picker**, not inferred from a kind's name —
  resolve it with `workspaceLabelGrainLabel(kind)` (table row above), never a
  hand-typed string.
- **A receive may SET the item note, never CLEAR one it was not given** —
  `notes = COALESCE($n, notes)` in every receive-side writer. The mobile QA
  sheet's Pass-all posts `notes: null`, so a bare `SET notes = $1` erased the
  desktop operator's note on every phone-side pass. Guard:
  `src/app/api/receiving/receive-note-preservation.guard.test.ts`.
- **A QA fail REASON is not a note.** It is a code from the QA-fail slice
  (`QA_FAIL_EXCEPTION_STATUS` in `src/lib/receiving/exception-codes.ts` —
  `DEFECTIVE` · `DAMAGED` · `INCOMPLETE`), sent as `exception_code` via
  `qa-fail-reason-wire.ts`, landing in `receiving_exceptions`. It also **decides
  the `qa_status`** the receive writes — the sheet used to hardcode
  `FAILED_FUNCTIONAL` and carry the real reason as prose, so the column built to
  tell a dead unit from a damaged one could not. `mark-received` 400s an
  unrecognized code and 400s a body whose `qa_status` contradicts the code.
  There is deliberately **no free-text sibling** (`ReasonChipPicker`'s contract).
- Guard: `src/components/receiving/workspace/line-edit/label-note-grain.guard.test.ts`
  (wiring) + `src/lib/print/workspace-label-kinds.test.ts` (faces + grain) +
  `tests/e2e/receiving-note-label-grain.spec.ts` (both composers in a browser,
  on the QA org).

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
- **The right-rail order inspector offers NO note-writing at all** (2026-08-02,
  `right-panel-display-HANDOFF.md` §3.2). The flag + trail block that used to
  mount there (`OrderTriageSection`) is deleted and the dock's composer is off
  on both branches. Note-writing lives on `/o/[orderId]`, reached from the
  open-full-page action in the header's icon row. **This is a placement rule,
  not a grain change** — the write path is untouched: `order_notes` via
  `POST /api/orders/[id]/notes`, one writable home, still guarded. Turning the
  section off *alone* would have RELOCATED the composer rather than removing it,
  because the dock read `showNotes={!showTriage}`.
- **Threads are still the other side of the line** — `order_notes` is internal
  and staff-authored; the customer conversation stays in Entity Threads. If that
  blurs in practice, collapse onto threads rather than growing a third home.
- Guard: `src/lib/orders/order-note-grain.guard.test.ts`.

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
  `uploadPhoto()` — GCS via the adapter, `photo_entity_links(entity_type='STAFF',
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

- Grid cells: `GridCellDash` → `—` (never blank, never `"N/A"`).
- Ledger details: `LedgerValue` / `DateTimeValue` default `fallback` is `—`.
- Dense condition meta tracks may still use `EMPTY_META_DASH` (`--`) from `conditions.ts` for optical alignment.
- Do not introduce new `"N/A"` defaults on ledger/grid primitives; migrate call sites toward `—` / omit-fact.

## Buttons

- Canonical `Button` (5 variants) lives in `src/design-system/primitives`. `PrimaryButton` is now a thin alias.
- New code uses `Button`; don't hand-roll button class strings.
- Icon-only actions use `IconButton` with a `size` (xs/sm/md/lg/touch) for the hit-box — never a hand-set
  `h-N w-N` on the button (guard: `control-size-tokens.guard.test.ts`). `touch` = the 44px tap floor that
  `tokens/touch.ts` used to own (retired).

## Workbench chrome pill

**SoT is the band History tab** — soft concentric corners on all sides
(`WORKBENCH_CHROME_PILL_CLASS` = `nestedCornerClass('card', 0.5)` → `rounded-xl`), the same
radius band `TabSwitch` uses for its active pill inside `WorkbenchChromeHeader` `density="band"`.
Quiet filter icons stay on `ToolbarButton` (`rounded-lg`) — a milder flatten, not square.

- Solid trailing CTAs (return-to-scan **Unbox**, Import / Add / Check) and the Unbox History week
  calendar compose `WORKBENCH_CHROME_PILL_CLASS` on **all four corners**.
- A vertical hairline (`WorkbenchTrailingCluster` leading divide) separates quiet rail from solid
  actions — it does **not** demand a square-flat edge. Square-flat (`rounded-l-none` /
  `rounded-r-none`) against that hairline was the wrong update.
- **Anti-pattern:** `rounded-*-none` on a hairline-facing edge, or a one-off `rounded-full` that
  drifts from the band History pill.

**Exemplar — Unbox History chrome:**

```text
[ History ] … [⌕][👤][▽] [ Calendar ]|[ Unbox ]
  soft xl                          soft xl │ soft xl
  (band tab SoT)                   same pill on both sides of the hairline
```

Detail: `display/workbench-ops-queue.md` → Trailing Display & Actions; return-to-scan Look in
`display/workbench.md` → Multi-region pages.

## Station entity-context header (inbound carton + shipping active order)

- **SoT:** `@/components/station/entity-context` → `CartonContextCard` + `StationContextBar` /
  `StationMoreDetails` (card implementation under `receiving/workspace/line-edit/`; barrel is the
  public waist).
- **Two-row face (family SoT):** row 1 = urgency · platform · type → listing · ticket/Claim · Photos;
  row 2 = lifecycle · order#/PO# · tracking → PO$. Omit optional props per station — never invent
  empty placeholder tracks. Editors open external tabs / pairing — do not regroup into stacked form
  sections.
- **Identity chrome:** mount identity inside `StationContextBar` as an
  absolute float over the work canvas (`stationContextBarHostClass` — no in-flow gray shelf).
  **Top padding SoT:** `STATION_IDENTITY_INSET_TOP` (`top-0`) pins identity
  flush under GlobalHeader as a square-top strip (`stationIdentityPanelClass` —
  `rounded-t-none` · `border-t-0` · `p-1`). Never
  stack host `py-*` under that absolute host. **Unbox station push is flush:**
  `TICKET_PUSH_HOST_PAD_CLASS = ''` and no push `my-2` (wide column uses
  `DETAIL_STACK_PUSH_COLUMN_CLASS`). Pair with `StationWorkbench`
  `reserveIdentityClearance="stacked"`.
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
  CSV import's shim and it is now a guard failure
  (`order-note-grain.guard.test.ts`).
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
