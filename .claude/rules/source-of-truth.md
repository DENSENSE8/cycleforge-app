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
| Lifecycle / status dots | lifecycle tone registries / `workflowStageDot` (do not invent status maps) |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Motion **intent** (which physics for this job) | `src/design-system/motion/roles.ts` — `motionRole.swap.scan` · `swap.focus` · `push.rail` · `gesture.press` · `feedback.pulse`. Five roles; a sixth means a new JOB, never a new duration. Catalog (`framerPresence` / `framerTransition`) stays the implementation — see **Motion roles + import path** below |
| Motion **import path** (the engine) | `@/design-system/motion` — the ONLY motion import in `src/`; `framer-motion` / `motion/react` banned outside `src/design-system/motion/**`. Guard: `motion-major.guard.test.ts` |
| Typeface cuts (sans · condensed · mono) | `src/lib/fonts.ts` + `typography/families.ts` (stacks mirrored in `styles/globals.css`) |
| Type role → size/leading/tracking/weight/family/numerals | `tailwind.config.ts` `fontSize['role-*']` + the CF Type plugin |
| Font weight ceiling (600) | `typography/weights.ts` (`MAX_FONT_WEIGHT`) |
| Spacing scale + intents | `src/design-system/tokens/spacing.mjs` (+ `Stack`/`Inset`/`Row` primitives) |
| Focus affordance | `src/design-system/tokens/focus-ring.ts` (`focusRing(archetype, tone)`) |
| Depth elevation (flat · raised · overlay) | `src/design-system/tokens/shadows.ts` (`elevationClass`) |
| Ops table / spreadsheet surface shell | `src/design-system/tokens/table-surface.ts` (`TABLE_SURFACE_*` + `TABLE_FROZEN_HEADER_CLASS`) |
| Sticky LedgerGrid column-header row (select-all · sort · frozen · tip) | `@/design-system/components/grid` `LedgerGridColumnHeader` + layout API — Receiving / Incoming / Pickup / Catalog / Repair adapters thin; **Orders deferred** (resize/reorder recipe). Inner label: `GridHeaderLabel` |
| Grid surface features (triage wash · multi-select · in-cell edit · Fields · day bands) | `@/design-system/components/grid` `GridSurfaceCapabilities` on `GridSurfaceDescriptor` — see **Grid surface capabilities** below |
| Grid leaf-row fill (selection · optional triage · card) | `ledgerRowFillClass` in `src/components/ui/queue-row-chrome.ts` (gates flag wash on `capabilities.rowTriageFlags`) |
| Grid column justification (end vs start) | `@/design-system/components/grid` `resolveGridColumnAlign` / `gridCellAlignClass` / `gridHeaderCellAlignClass` — see **Grid column justification** below |
| Grid identity columns (freeze · lock · never in-cell edit) | Column model `frozen: true` → `gridFrozenKeys(columns)` (per surface); house default + editability floor: `GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` — see **Grid identity pane** below |
| Grid column visibility (per-staff) | `@/design-system/components/grid` `useGridColumnVisibility` / `useGridFields` + `GridFieldsMenu` — see **Grid column visibility + sort** below |
| Grid column sort (URL-durable) | `@/hooks/useUrlColumnSort` → `?colsort=` / `?coldir=` — see **Grid column visibility + sort** below |
| Collection-surface action planes | `display/workbench.md` — in-cell · row-scoped · multi-select · record, one primary plane each |
| Workbench branch (Layer C recipe) | `SURFACE_REGISTRY.workbenchBranch` + `WORKBENCH_BRANCH_IDS` in `src/lib/stations/surface-keys.ts` — `ops-queue` · `master-detail` · `board` · `fact-stack` · `service-workspace`; null on Station/Monitor/Canvas. Law: `display/workbench.md` + child recipe files |
| Collection map keep-alive | Prefer `display:none` over unmount when focus overlays the map — reference `ReceivingRightPane`. Service-workspace forbids unmounting the queue on ticket open — `display/workbench-service.md` |
| Return-to-scan chrome CTA | **Every** scan-station hybrid page (Unbox · Testing · Pack · …): solid primary in `WorkbenchTrailingCluster.actions` — top-right of the workbench context bar (`WorkbenchChromeHeader` trailing), **above the KPI strip** — on **every** strip tab. Rejoins Station scan actions (close focus overlay → bench tab’s data table → focus station scan bar). Reference: Unbox `UnboxWorkspaceHeader` (“Unbox”). Law: `display/workbench.md` → Multi-region pages (+ `display/station.md` § hybrid) |
| Station column shell / wash | `@/components/station/workbench` (`StationWorkbench`, `StationPanelRoot` + `StationAmbientWash`, `STATION_WORKBENCH_*`) — **Station region** shell, not Workbench contract. Rule: `display/station-workbench.md` |
| Surface / box shell | `Panel` (generic) · `SectionCard` (monitor) · `CardShell` (rows) — never hand-roll |
| Honest absence (missing fact) | `GridCellDash` / ledger `fallback` default `—` — never invent `"N/A"` on ledger/grid primitives |
| Photo gallery viewer | `@/components/shipped/photo-gallery` — `usePhotoGallery` + `PhotoViewerPortal` → `PhotoViewerModal` (composed launcher: `PhotoGallery` / `launcherLayout`). Never a page-local lightbox or `createPortal`+`AnimatePresence` fork around the modal. Read surfaces pass `{ url }` only (omit numeric `id` / upload targets so delete/upload stay off). |
| Carton read surface | `/carton/[id]` → `CartonInspector` → `inspection/CartonInspectionPage` + `carton-inspector-model.ts`. Read model + atoms only (D6 / `pattern-evolution.md`). Photos = `ReceivingPhotosSection` readOnly below pipeline (same component as details-stack Progress). Work escape = one quiet `openInUnboxHref` control — never `"Open in Unbox"` spam on findings/header. IA: disposition header; col1 contents·activity·record; col2 Panel+ReceivingCartonPipeline·photos·history·findings. Linked PO suppresses Unmatched. Not Station column shell — recipe: `display/carton-read.md`. |
| Order note (annotation on an order) | `order_notes` **only**, via `POST /api/orders/[id]/notes` (`src/lib/orders/order-notes.ts` + `useOrderNotes` / `OrderNotesTrail`). The scalar `orders.notes` is **read-only legacy** — displayed, searched, counted, never written by the product. Guard: `order-note-grain.guard.test.ts` — see **Order note grain** below |
| Receiving note vs label text (**per line item**) | `receiving_line.notes` = operator item note (**never printed**) · `receiving_line.label_note` = the printed face center · `receiving_line.zoho_notes` = Zoho line description · `receiving.zoho_notes` / `support_notes` = PO-header / carton. **All three line columns are per LINE ITEM — never hoist a label note to the carton.** Notes dock (`LineNotesCard`) writes `notes`; label editor (`LabelEditPopover` / As Listed) writes `label_note`. Guard: `label-note-grain.guard.test.ts` — see **Note vs label grain** below |
| Label kind → grain (what the sticker goes on) | `src/lib/print/workspace-label-kinds.ts` — `KIND_META.grain` + `workspaceLabelGrainLabel(kind)` (`PO / carton` · `Per item` · `Container`), carried into every picker by `labelOptionsForSelect`. Never hand-type a kind's name or grain at a call site |
| Dialog / AlertDialog | `@/design-system/components/Dialog` · `AlertDialog` · `requestConfirm` / `ConfirmDialogHost` — never hand-roll `fixed inset-0` scrims for new modals; station floor confirms stay on `ConfirmSheet` |
| Switch / Checkbox | `@/design-system/primitives` `Switch` / `Checkbox` |
| Dropdown / Context menu | `@/design-system/primitives` `DropdownMenu` / `ContextMenu` |
| App chrome / canvas / wash / work-canvas depth | `src/design-system/tokens/app-surface.ts` + `appContentShellClass` (`appWorkCanvasEdgeClass` owns the depth-edge hairline on every desktop page). Receiving rail+workspace share `CONTEXT_PANEL_HOST` ground (`context-panel-column.ts`); Unbox/Triage under that host use `appWorkCanvasLayoutClass` (no full-bleed card sibling) |
| Global detail-stack overlay shell | `@/design-system/shells/detail-stack` (`DETAIL_STACK_LAYOUT`, `DETAIL_STACK_RESIZE`, `DETAIL_STACK_COLLAPSE`, `detailStackAsideClassName`, `detailStackAsideStyle(widthPx?)`, …) |
| Left context-sidebar wrapper | `ContextPanelLayout` + `context-panel-column.ts` (`CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE`) — every route rail beside the workspace; resize + collapse via `HorizontalEdgeResizeHandle`. MasterNav / `SidebarNavColumn` is a separate push spine |
| Right-edge slot occupancy + modality | `RightRailHost` + `src/lib/right-rail/store.ts` — THE right details-panel wrapper; see **Right-rail modality** below |
| Right-rail record-inspector header | `PaneHeader` + blocks (`PaneHeaderLabel` · `PaneHeaderActionBar iconOnly` · `PaneHeaderCloseButton`) — dense identity + contextual icons; **never** `SidebarIntakeFormShell` on a record peek. Recipe: [`display/right-rail-inspector.md`](display/right-rail-inspector.md). Guard: `right-rail-inspector-header.guard.test.ts` |
| Sidebar intake / create form chrome | `SidebarIntakeFormShell` — **create · import · prefs** overlays only (`detail:new-order`, Import eBay, FBA create, grid column display). Not a record-inspector header |
| Nav search (type-to-jump over the nav registry) | `src/lib/nav/nav-search.ts` (ranked matcher) + `nav-destinations.ts` (pages **and** modes flattened) — the ⌘K palette and the MasterNav spine both compose it. NOT the cross-entity engine — see **Nav search** below |
| ⌘K / Ctrl+K ownership | `src/components/CommandBar.tsx` — the ONLY binder. No other surface may bind it (a suppressor inside a focus trap is the one exception) or advertise it. Guard: `cmdk-owner.guard.test.ts` |
| Keyboard ownership (Escape / ambient hotkeys) | `src/lib/overlay-stack/store.ts` (+ `useRegisterOverlay` / `useAnyOverlayOpen`) — see **Escape ownership** below |
| Station entity-context header | `@/components/station/entity-context` (`CartonContextCard` + `StationContextBar`) — Unbox / Triage / Testing / Shipping active-order |
| Workbench chrome scoped search | `@/design-system/primitives/ToolbarSearchToggle` — collapsed Search icon; expands on hover / focus / click (or when query non-empty); composes `SearchField`. Never mount an always-open `SearchField` in a `WorkbenchChromeHeader` `search` slot **when search refines an on-screen list**. **Entry-path exceptions:** `/ops/photos` (always-open chrome field) and `/search` (context-rail `SearchBar` in `SearchSidebarPanel`; header launcher hidden) — rationale in `ui-design-system.md` → Scoped search chrome. |
| Omnichannel / chat-style composer dock | `@/design-system/primitives` `OmnichannelComposerDock` (was `StationComposerDock` until 2026-08-01 — a birthplace name on a shared shell, corrected when Support became Workbench branch `service-workspace`; the dock is not Station-contract property) — Unbox overview carton notes **and** all ticket reply chrome (`SupportChatComposer`: inline under thread **and** `variant="station-dock"` via `SupportTicketComposerDock`). Same elevated white shell + auto-grow height; ticket footer = VisibilityToggle · Library (`+`) · Attach (paperclip) · Send (or `trailingAction` as `<StationTerminalDock embedded>` — Send suppressed, Enter still commits). Placement SoT for floating docks: `slicedActionDockWrapperClass()`. Never hand-roll a second sticky/amber ticket composer beside this shell. |
| Resizable document PDF slide-over | `@/design-system/components/DocumentSlideOver` (+ `DocumentPreviewFrame`, `useHorizontalEdgeResize`) — Labels Print, Testing manuals |
| Horizontal pane edge resize grip | `@/design-system/components/HorizontalEdgeResizeHandle` (+ `useHorizontalEdgeResize`) — context rails (`ContextPanelLayout`) + non-modal detail inspectors (`RightRailHost`); never hand-roll a second pill/strip for the same job |
| Recent-rail scrollport / more-below lip | `@/components/sidebar/rail-shell/SidebarRailScrollport` (+ `useMoreBelow` / `SCROLL_MORE_BELOW_CLASS` in `tokens/scroll-edge.ts`) — station + SidebarShell-hosted recent feeds; never hand-roll a second bottom fade. `SidebarRailShell` is content-sized and does **not** own vertical scroll |
| Buttons | `src/design-system/primitives` `Button` |
| Product icon glyphs | `@/components/Icons` (`src/components/icons/*`) — never duplicate nav primitives |
| Station page + L2 mode nav icons | `src/lib/nav/station-nav-icons.ts` + semantic wrappers `src/components/icons/stations.tsx` — mode glyphs unique via `MODE_ICON_GLYPH_KEYS` |
| Top-band chrome icon **display** (glyph box) | `src/components/layout/header-shell.ts` (`TOP_CHROME_ICON_GLYPH` for GlobalHeader Mode / Recents / WO / goal) — native SVG stroke only; do not layer `navIconStrokeClass` on header chips (muddies dense glyphs). Glyph *identity* stays Icons / station-nav |
| L2 Mode + Recents (page modes + cross-page MRU) | `HeaderModeSwitcher` + `HeaderRecentsSwitcher` in `GlobalHeader` — data = `SIDEBAR_PAGE_NAV` / `useSidebarModeNav` / `useRecentModes`. Never a sidebar pill-band twin; no MRU chips in the spine org band. |
| Header pin stations (Quick Access pins) | `HeaderPinsSwitcher` in `GlobalHeader` (hairline after Recents → pin current → sortable icons → overflow) — data = `useQuickAccess` / `cf.quickAccess` cache; durable SoT = `staff_preferences.prefs.quickAccess` via `<QuickAccessSync/>`. Never remount a pin list in a Quick Access / staff menu. Desktop Quick Access **actions** stay in `GlobalHeaderActions` in order **search · clipboard · phone QR · kiosk · inbox · AI (far-right)** — Sparkles opens the assistant right-rail occupant at the edge it owns; no staff avatar on desktop. |
| Identity mark (org + staff circle) | `@/components/identity` — `IdentityMark` (circle · ring · image-or-initials · `xs`…`2xl`) and `StaffAvatar` (photo → colour+initials, resolved by staff id). **Never hand-roll a `rounded-full` + initials span**, and never fork a local `initials()` — the SoT is `staffInitials` (`StaffBadge.tsx`). See **Staff profile photo** below |
| Org / workspace switch (spine top) | `OrgWorkspaceControl` in the MasterNav 40px top band — current `organizationName` on a **circle `IdentityMark`** (same `sm` density as the staff footer) + an **always-mounted dropdown trigger**, single-org included: a control that is a button for some accounts and inert text for others teaches two affordances for one slot, and the single-org menu still names the workspace and routes to `admin.view`-gated Settings → Organization. Switch path = `useSwitchOrg` / `requestSwitchOrg` (`src/lib/identity/switch-org.ts`). Page selection is the selected spine body row — never a twin “name of now” label in the top band. Org does **not** use staff photos (org brand logo is a separate lane). **Menu is a child of the trigger** — `AnchoredLayer` `bottom-stretch` on the button + dense `SIDEBAR_SPINE_MENU_*` chrome (`sidebar-spine.ts`); never a wider magic `w-[Npx]` or a chunkier twin of the band. Guard: `header-mode.guard.test.ts`. |
| Staff account (spine footer) | `StaffAccountFooter` below Settings/Admin — `StaffAvatar` · name · role · more (phone history / feedback / QA settings) · sign-out. Mobile keeps a compact account avatar in `GlobalHeaderActions`. When the spine is collapsed (0 width), org + staff are unreachable — same as Admin/Settings; open via header toggle / edge peek. **⋯ menu is a child of the footer row** — `AnchoredLayer` `top-stretch` + dense `SIDEBAR_SPINE_MENU_*` chrome (same SoT as the org menu); never a wider magic `w-[Npx]`. Guard: `header-mode.guard.test.ts`. |
| Staff profile photo | `staff.avatar_photo_id` → the photos platform (`STAFF` entity type). Read it with `<StaffAvatar>`, never a per-surface photo join — see **Staff profile photo** below |
| Scan Stations (spine section drill) | `STATION_GROUPS` (+ `icon`) + required `stationGroup: 'floor'` on `kind: 'station'` rows in `sidebar-navigation.ts`; membership via `SPINE_SECTIONS` / `spineSectionIdForPage`. **`floor` is the only station group** — the `desk` twin died 2026-08-01 (see the domain row below). Members, in pipeline order: Receiving subgroup (Arrival / Unbox / Local Pickup / Repair Service) + Testing / Packing / Scan out. Subgroup header from `STATION_SUBGROUPS`. **Never move a scan bench into a domain drill** — an operator at the dock answers to their input model, not to the domain of the records they touch. Footer-pinned `TechRailSearchBar` above Settings/Admin (+ `StaffAccountFooter` below) filters root sections or the open drill's pages. Guard: `station-nav-groups.guard.test.ts` + `main-nav-groups.guard.test.ts`. |
| Main Analytics Monitor / Workflow Studio (spine section drills) | `MAIN_GROUPS` (+ `icon`) + required `mainGroup` on `kind: 'main'` rows. **Analytics Monitor** = Operations only (Live / TV). **Workflow Studio** = Studio + Catalog. Home / Search / Media / Chat top-pinned. Guard: `main-nav-groups.guard.test.ts`. Law: `display/workbench-master-detail.md` (spine context). |
| MasterNav spine type ladder | Org band `OrgWorkspaceControl` trigger = `text-role-body`; **identity menus** (org switch + staff ⋯) = dense child — names + actions `text-role-caption`, meta `text-role-micro`, marks `xs`; page/drill/mode/section labels = `text-role-caption` (pages semibold, modes medium); counts = `text-role-micro`; staff footer name = `text-role-caption`. Never bare `text-sm` on these surfaces; never sentence-case `text-role-eyebrow` for destinations. Idle page/section labels use default ink (icons stay muted); idle modes stay default ink. Law: `display/workbench-master-detail.md`. Guard: `main-nav-groups.guard.test.ts` + `header-mode.guard.test.ts`. |
| MasterNav section accents | `spineAccentFor` / `SPINE_SECTION_ACCENTS` in `src/lib/nav/spine-section-accent.ts` — monitor sky · floor **amber-700** · inbound **teal-700** · catalog emerald · inventory **cyan-700** · fulfillment indigo · sales rose · support **orange-700** · studio violet; top pin + footer = `SPINE_NEUTRAL_ACCENT` (blue). The map is a **total** `Record<SpineSectionId, …>`, so a new section without a hue is a type error. Active fill / mode wash / icon tint compose from the map — never hardcode `bg-blue-600` alone in `SidebarNavList`. **An active row is a fill PLUS `ring-1 ring-inset ring-{hue}-400/30`** (mode wash: `/20`) — a bare colour swatch has no seated edge. **A hue's SHADE is picked for contrast, not symmetry:** amber / cyan / orange fill at 700 because at 600 they sit under the AA 4.5:1 floor for the 12px caption these rows use (amber-600 ≈2.9:1). Do not "restore" 600 for hue symmetry. Guard: `main-nav-groups.guard.test.ts`. |
| MasterNav row hover/press travel | `SPINE_ICON_LIFT_CLASS` (same module) — CSS-only `translate(2px, -1px)` hover / `(1px, 0)` press on the **14px leading glyph**, `motion-safe:`-gated because the framer `MotionConfig` floor does not cover CSS transforms. Requires `group` on the row button. **Never** a framer `whileHover` on a spine row (a re-render per mousemove across 20 rows for 2px the compositor gives free), **never** a row-level `scale` (breaks the baseline dense siblings align to), **never** a hover/active `font-*` shift (reflows text mid-pointer). Guard: `main-nav-groups.guard.test.ts`. |
| Spine row membership (the TWO registries are one declaration) | `APP_SIDEBAR_NAV` (flat rows) + `SIDEBAR_PAGE_NAV` (mode registry) — `MasterNav`'s `toPageNav` merges them as `{ ...page, icon, label }`, so for any page owning a `SIDEBAR_PAGE_NAV` entry the mode registry **wins** every membership field (`kind` · `mainGroup` · `stationGroup` · `stationSubgroup` · `domainGroup` · `href` · `requires`) and the flat row's copy is inert. A disagreement does not error and does not double-render — it silently ships one answer while the other reads as documentation. Declare membership in both **identically**. Guard: `main-nav-groups.guard.test.ts` → "agree on every shared membership field". |
| Business-domain sections (spine section drills) | `DOMAIN_GROUPS` (+ `icon`) + required `domainGroup` on `kind: 'domain'` rows. **Inbound** = Inbound (Incoming · Receiving Board). **Catalog** = Catalog (Reference · Manuals · Labels · Pairing · Catalog link · QC · Kit Parts). **Inventory** = Inventory · Sourcing · Locations. **Fulfillment** = Shipping (Orders · Labels · Ready · FBA · Packing Review). **Sales** = Sales (Sales Board · Local Pickup History). **Support** = Support (6 modes). Root order: **Analytics Monitor → Scan Stations → Inbound → Catalog → Inventory → Fulfillment → Sales → Support → Workflow Studio**. Ratified 2026-08-01 (`docs/todo/desk-domain-spine-split-CLAUDE-CODE-PROMPT.md`); replaces the retired `desk` grab-bag and `print` task slice. Guard: `main-nav-groups.guard.test.ts`. |
| Print is a TASK, never a section | There is no Print Stations drill and no `kind: 'labels'` / `'documents'`. Product labels = Catalog → Labels (`/products?view=labels`); bin/rack labels = Inventory → Locations (`/warehouse`, Labels tab); carton stickers = the Unbox bench. Every former Print row was an ALIAS of a URL a canonical page already owned, which is how `/products?view=labels` came to resolve to a nav id (`print-labels`) that was not the page it opened. **Carrier postage is not a print destination** — `/shipping/labels` stays Fulfillment → Labels and never folds into a label workspace. Guard: `main-nav-groups.guard.test.ts`. |
| Dashboard boards are domain homes, not an L1 | `/dashboard` owns no spine row. `getSidebarNavPageId` reads the `?mode=` DOMAIN and hands the URL to the owning page: `inbound`/`receiving` → Inbound › Receiving Board, `sales`/`pickup` → Sales, everything else → Fulfillment › Shipping › Orders. The route, its param spec and every bookmark are unchanged — only the nav identity moved. Guard: `sidebar-navigation.test.ts`. |
| Review splits by job (`/review`) | `/review` owns no spine row and no `SIDEBAR_PAGE_NAV` entry. Packing QA (bare URL) is Fulfillment › Shipping › **Packing Review**; `?mode=pairing` and `?mode=catalog-link` are Catalog work and highlight Catalog › Pairing / Catalog link. `getSidebarNavPageId` reads `?mode=` to pick the owner. The three workspaces are untouched — merging Review pairing into Catalog pairing is a separate LedgerGrid job, deliberately out of scope. Guard: `main-nav-groups.guard.test.ts` → "Review splits". |
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
- **The engine is named in exactly ONE file** — `src/design-system/motion/framer.ts`
  (`motion/react`). Everything in `src/` imports `@/design-system/motion`. The barrel is what
  makes the package a dependency decision instead of a 220-file migration.
- **The preset catalog is not deprecated.** `framerPresence.*` / `framerTransition.*` are the
  physics roles resolve to, and remain legal for surfaces no role covers. Do **not** sweep
  existing call sites onto roles for symmetry — migrate a surface while you are already
  editing its motion.
- Guard: `src/design-system/foundations/motion-major.guard.test.ts` (import boundary + single
  major + role↔preset identity).

## Grid column visibility + sort

- **Visibility resolves in exactly ONE place** — `useGridColumnVisibility` (descriptor `tier` + staff
  delta + viewport force-hide → the visible track list, which the header, rows, summaries and the grid
  template all consume). Column `tier: 'core' | 'optional'` is the default-set SoT: grids open **lean**,
  staff opt in from `GridFieldsMenu`, and prefs persist as a **delta** in
  `staff_preferences.tableColumns[tableId]`.
- **Never call `useIsColumnHidden()` from a grid family** — it is the retired cell-granularity path
  that left an empty ruled band instead of removing the track; it survives only for
  `ChipColumns` / `RowMetaColumns`.
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

## Grid identity pane

- **The frozen pane is declared on the column model** (`frozen: true`), and the key list is
  **derived** with `gridFrozenKeys(columns)` — never re-typed beside the model. One declaration
  drives all three invariants: pinned-left, immovable under drag-reorder, and never in-cell
  editable.
- **It is a per-surface answer to "what does an operator scan first here."**
  Orders (`/dashboard`) freezes **`select · order · title`** — on a dispatch queue the order is the
  container and the scan anchor (Shopify Admin / ShipStation pin it first), with the product title
  as the heavy secondary anchor for the physical pick. Catalog · Receiving · Incoming · Repair ·
  Pickup freeze **`select · title`**: Catalog has no order context, and on Receiving/Incoming the PO
  is secondary to the item being scanned. **Do not widen `GRID_IDENTITY_COLUMN_KEYS`** to serve one
  surface — it remains the house default and the key-only editability floor.
- **The pane must be a contiguous leading prefix** of the canonical order, starting with `select`.
  Sticky-left offsets sum the widths of the frozen columns *before* a given one, so a frozen column
  sitting after a scrolling one pins at the wrong origin.
- **A frozen column carries no `hideKey` and no `tier`** — it is structural, so `GridFieldsMenu`
  can never take the row's identity away (`isGridColumnVisible` rule 1). Promoting a fact column
  into the pane therefore *retires* its pref key; a stale `hidden: [...]` delta goes inert on its
  own, which is the whole migration.
- Guard: `src/lib/tables/grid-column-tier.guard.test.ts` (pane derived from `frozen`, contiguous
  prefix, never hideable, always in the default set).

## Grid column justification

- Source: `src/design-system/components/grid/grid-header-align.ts`
  (`resolveGridColumnAlign` · `gridCellAlignClass` · `gridHeaderCellAlignClass`).
- **Hard rule — digit tracks end, word tracks start.** Header and cell resolve the SAME decision
  from the column model; never re-decide with a per-surface ternary or a hand-typed
  `justify-end` / `text-right` on the cell.
  | Type | Align | Examples |
  |---|---|---|
  | `number` · `id` · `location` · `date` | **end** | Qty · price · **order ID** · SKU · serial · ticket · tracking last-8 · ship-by / age |
  | `text` · `longtext` · `tag` · `external` | **start** | Product title · condition · status · platform · tester name |
- Explicit `align` on the column model is the ONLY override — use it when a column's *type*
  is numeric-looking for the header glyph but the *cell* is prose (receiving `stage`) or a
  categorical chip (catalog `inventory`). Declare the exception once on the layout SoT.
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

## Right-rail modality (the detail slot)

- **Every resident edge PUSHES. Nothing floats over the work surface.**
  (Ruled 2026-08-01, superseding "navigators push, inspectors float".) The left
  spine (`SidebarNavColumn` / MasterNav) is a **resident push column** — it
  dictates permanent workspace layout, so opening it moves the frame. The
  **left context-sidebar wrapper** is `ContextPanelLayout` (route rail beside the
  workspace — not the spine): every mounted rail is drag-resizable + collapsible
  via `CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE` +
  `HorizontalEdgeResizeHandle` (`edge: 'trailing'`). Right-rail **record
  inspectors** are **non-modal push columns** (`modal={false}`): same inset card,
  no scrim, and the workspace reflows beside them rather than under them.

  **Width order of sacrifice — the panel takes its space from the LEFT before it
  takes it from the grid:** collapse/displace the spine (and, if still short, the
  context rail) first; only a viewport that cannot seat the grid's own minimum
  content width after both are parked may fall back to overlaying. That order is
  the whole ruling — it is what the earlier float-only rule lacked.

  **IMPLEMENTED 2026-08-01, with one correction the ruling had wrong.** The
  ladder lives in `src/lib/right-rail/frame.ts` (`resolveRightRailFrame`, pure +
  unit-pinned) and it has **two rungs, not three**: measured in the running app
  at 1440 and 1920, `[data-sidebar-nav-column]` reports **width 0 on every
  route** — `navOpen` is unpersisted `useState(false)` — so a spine rung would be
  dead code in the common case, and displacing it would fight
  `SidebarNavColumn`'s own ruling that a navigator must never auto-close. The
  only real donor is the **context rail** (360px + margins). Order is therefore:
  rung 0 nothing yields → rung 1 the context rail parks → else overlay.

  **The park is an EPHEMERAL MASK, never a write.** `ContextPanelLayout` reads
  `parkRail` and ORs it into its collapsed state; it must never call
  `setCollapsed(true)` from that path, or opening a record would silently leave
  `context-panel-collapsed` set in the operator's localStorage forever. A
  push-park renders **no expand strip** (the rail returns on its own when the
  panel closes, so a restore button that cannot restore is worse than none) —
  which is why a push-park costs **0** in the ladder while an operator-chosen
  collapse costs the 32px strip.

  **The threshold is derived, not a breakpoint:** `MIN_WORK_SURFACE_PX` (784 —
  the larger of the Outbound grid's 640 show-all + gutters and the station
  workbench's 720 + gutters) + panel gutters + the panel's own 360 minimum =
  a **1160px content row**. Below that, overlay. The floor is deliberately ONE
  static constant and **not** a per-lane `contentMinWidthRem`: on `/dashboard`
  that value is filtered by a `ResizeObserver` on the very scrollport the push
  narrows, so feeding it back would make the decision depend on its own outcome.

  **Measured before/after** (1440, `/review?mode=catalog-link`): the float
  covered **400px of the grid** and the work surface yielded 0; the push leaves
  zero overlap and the grid gives up only 60px, because parking the rail returns
  376. Proof is geometric (`table.right <= rail.left`), not visual — a screenshot
  cannot tell "pushed" from "covered".

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
  - **The far right of that row is `up · down · close`, in that order** — record
    prev/next then dismiss, one right-aligned cluster. Not split across two rows.
  - **Row 2 is dense identity** — `PaneHeaderLabel` (eyebrow = mode / entity
    kind; value = a **short durable key**: order id, item #, SKU, ticket #,
    tracking). Roles only (`text-role-eyebrow` / caption-density value).  
    **Never a wrapping hero title** — full `product_title` / listing sentences /
    prose belong in the scroll **body** as fact rows. Never `text-role-title` /
    `text-role-display` / intake `<h2>` for rail identity.
  - **`SidebarIntakeFormShell` is forbidden on record inspectors.** That shell
    is create/import/prefs chrome (left-circle close + wrapping uppercase
    title). Review → Catalog link once put a Bose product sentence in that
    title prop — the exact anti-pattern this law bans. Intake overlays
    (`detail:new-order`, Import eBay, FBA create, grid column display) keep
    the intake shell; the moment a rail opens a **picked row**, migrate to
    `PaneHeader`.
  - **The close control is mandatory and belongs to the panel.** A non-modal
    push column has no scrim to click off, so a header that omits it leaves
    Escape as the only dismiss. Two headers actively *swallowed* the prop
    (`ShippedDetailsHeader` did `void _onClose` behind a comment claiming
    "close lives on RightRailHost (backdrop / Esc)" — untrue since the flip), so
    the lanes operators actually work had no visible dismiss at all. Compose
    `PaneHeaderCloseButton`.
  - **A destructive action belongs to the record's own control, never to the
    multi-select action set** that happens to have one row in it.
- **One owner:** `RightRailHost` is THE right details-panel wrapper — it renders
  exactly the top occupant of `src/lib/right-rail/store.ts`. Panels register via
  `useRegisterRightPanel` / `DetailStackRailRegistrar` and own **no** geometry.
  Never add a private `fixed right-0 z-panel w-[420px]` element — that is the
  exact bug the store exists to fix.
- **Exactly TWO right-edge grammars exist, and there is no third.** Both push;
  they differ in SCOPE, not in whether the work surface reflows.
  1. **App push column** — a `RightRailHost` occupant. App-wide, one at a time,
     pushing the work surface. The default for a picked record.
  2. **Station push column** — `UnboxPushColumn`. Squeezes its own station's
     workbench in-flow, exclusive within that station, never a rail occupant.
     Unbox's Displays / Ticket / Claim / tool.

  **There is no ambient, always-on right-edge region**, and one must not be
  rebuilt. One was built for the Unbox step procedure — `procedure-store.ts` +
  `RightRailProcedureRegion` + `useRegisterRightRailProcedure` +
  `UnboxProcedureRail` — and retired within the day.

  **The live checklist that replaced it is a DISPLAY, which is the whole point.**
  As of 2026-08-02 the Unbox procedure has two views: the work **step column** in
  the workbench centre (`UnboxProcedureColumn`) and the live **checklist** as the
  first/default tab of the Displays push column (`UnboxProcedureChecklist`). The
  checklist is always-visible *because the operator picked that display and it
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
  reading. Displays opens/closes from the pane-anchored `StationMoreDetails`
  progress ring (`GoalRing` / `unbox-displays-expand-button`) — not the parked
  strip — so the affordance stays put while a push column is open. When a linked
  ticket is parked and no push owns the edge, `ReceivingPushExpandStrip` restores
  the ticket only (`ReceivingTicketExpandControl`).
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
  absolute `maxWidth` (chat / wizard ceilings), and `maxWidthPad` tuned to leave
  Unbox usable; dismiss uses the same edge `onCollapse` chevron as the context
  rail; Ticket closed + linked shows an in-flow expand strip
  (`ReceivingTicketExpandControl` / `CONTEXT_PANEL_COLLAPSE_STRIP_CLASS`).
  **Gutter is host padding** (`TICKET_PUSH_HOST_PAD_CLASS` = `py-2 pr-2` on the
  LineEditPanel overflow host) — not child margin — because `overflow-hidden`
  clips trailing margins and made the card look flush to the display edge.
- **A queue-processing inspector registers a STABLE occupant id** (`detail:order`,
  `detail:receiving` — not `detail:order:<id>` / `detail:receiving:<id>`) so
  record→record navigation swaps content in place instead of playing exit-then-enter
  with an empty slot between. See `display/motion-crossfade.md`. (Ticket / Claim
  are push, not rail occupant ids.)

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

- **One macro-family (IBM Plex), three cuts.** `sans` (display/title/body/data/caption) ·
  `condensed` (eyebrow/micro) · `mono` (identifiers). Loaded in `src/lib/fonts.ts`, stacks in
  `typography/families.ts`, mirrored byte-for-byte in `styles/globals.css`. There is deliberately
  **no** `heading`/`display`/`label` slot — pick a ROLE, not a family.
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
  - `flat` — flush with canvas (no lift)
  - `raised` — in-flow cards / panels; intensity `soft` (bookmark chrome) or
    `default` (glass work cards)
  - `overlay` — floating UI (menus, popovers, dialogs)
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
- Depth needs a ground plane: `background-canvas` sits a real step below card
  white (light `#eef2f7` vs `#ffffff`). At the old ~2% delta the shadow had
  nothing to cast onto and every surface merged into one sheet.
- Never hand-roll `shadow-* shadow-scrim/*` for these jobs; dial ink/spread only in the SoT.
- z-index remains separate (`tokens/z-index.ts`) — same elevation style can stack at different orders.

## Ops table / spreadsheet surface shell

- Source: `src/design-system/tokens/table-surface.ts`.
  - `TABLE_SURFACE_CLASS` — `rounded-xl` + `border-border-soft` + `bg-surface-card` +
    `elevationClass('raised')`.
  - `TABLE_SURFACE_CLIP_CLASS` — surface + `overflow-hidden` (**the one recipe** — clips
    airtable cell paints at the corner curve). `TABLE_SURFACE_SCROLLPORT_CLASS` aliases it.
  - `TABLE_FROZEN_HEADER_CLASS` — `bg-surface-card` frozen header (same plane as
    body rows; borders carry hierarchy — never `surface-strong`, which equals
    `border-subtle` in light and erases header grid).
- Airtable skin (`data-grid-skin="airtable"`): continuous RIGHT+BOTTOM cell rules
  (`border-default`) through **header and body**; shell owns the outer perimeter
  (drop trailing column right rule).
- Consumers: `DataTable`, `LedgerGridSurface`, outbound `OrdersGridView`.
- Never hand-roll `rounded-* border … shadow-*` / header fills for ops collection tables.

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

## Note vs label grain (per line item)

Receiving carries four note-shaped fields. They are four **different grains**, and
the two that live closest together were one column until 2026-07-31.

| Field | Grain | Printed? | Written by |
|---|---|---|---|
| `receiving_line.notes` | **line item** | **never** | notes dock (`LineNotesCard` → `OmnichannelComposerDock`) |
| `receiving_line.label_note` | **line item** | yes — the face center | label editor (`LabelEditPopover`, As Listed) |
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
- **Neither composer writes the other's column.** The notes dock patches `notes`
  only; the label editor patches `label_note` only. A single call site reading
  `row.notes` for a face silently re-creates the conflation — which is exactly
  how Testing's carton reprint drifted from Unbox's before the split landed.
- **Receive / push-to-PO carries the item note**, never the label text: a print
  artifact must not travel to Zoho.
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
  the record plane (the dashboard inspector, via `OrderTriageSection`) passes
  `showNotes={false}` to `ShippedPanelEditorDock`. Two composers over one store
  is the same confusion in a new shape.
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
  (`settings/sections/StaffPhotoCard.tsx`) posts to this route.
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

## Station entity-context header (inbound carton + shipping active order)

- **SoT:** `@/components/station/entity-context` → `CartonContextCard` + `StationContextBar` /
  `StationMoreDetails` (card implementation under `receiving/workspace/line-edit/`; barrel is the
  public waist).
- Condensed one-row anatomy: listing · PO# / order# · tracking · CLAIM · photos · platform/type/priority.
  Editors slide below on demand — do not regroup into stacked form sections.
- **Bookmark chrome:** mount identity as `density="bar"` inside `StationContextBar` as an
  absolute float over the work canvas (`stationContextBarHostClass` — no in-flow gray shelf;
  top inset matches `CONTEXT_PANEL_OUTER_MARGIN` so identity + more-details share the sidebar
  card’s top edge); pair with `StationWorkbench` `reserveIdentityClearance`. Corner utilities
  go in `StationMoreDetails` (embedded `LineEditToolbar`). Do not put carton identity in the
  workbench `entityContext` / `toolbar` slots.
- **Compose for Unbox / Triage / Testing / Shipping (active order)** via thin adapters
  (`LineCartonContextSection`, `TestingCartonHeader`, `ShippingEntityContextHeader`,
  `PackOrderIdentity`, `PickupEntityContextHeader`).
  Omit optional props to hide claim / photos / classify per station.
- **Never fork** a second condensed identity header (no page-local title + "Open listing" card).
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
