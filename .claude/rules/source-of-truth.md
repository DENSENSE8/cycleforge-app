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
| Capability / provider nouns | `src/lib/integrations/capability-labels.ts` (+ server connections) |
| Cross-entity search row | `SearchHit` / `src/lib/search/search-hit.ts` + hybrid retrieval |
| Lifecycle / status dots | lifecycle tone registries / `workflowStageDot` (do not invent status maps) |
| Z-index | `src/design-system/tokens/z-index.ts` |
| Typeface cuts (sans · condensed · mono) | `src/lib/fonts.ts` + `typography/families.ts` (stacks mirrored in `styles/globals.css`) |
| Type role → size/leading/tracking/weight/family/numerals | `tailwind.config.ts` `fontSize['role-*']` + the CF Type plugin |
| Font weight ceiling (600) | `typography/weights.ts` (`MAX_FONT_WEIGHT`) |
| Spacing scale + intents | `src/design-system/tokens/spacing.mjs` (+ `Stack`/`Inset`/`Row` primitives) |
| Focus affordance | `src/design-system/tokens/focus-ring.ts` (`focusRing(archetype, tone)`) |
| Depth elevation (flat · raised · overlay) | `src/design-system/tokens/shadows.ts` (`elevationClass`) |
| Ops table / spreadsheet surface shell | `src/design-system/tokens/table-surface.ts` (`TABLE_SURFACE_*` + `TABLE_FROZEN_HEADER_CLASS`) |
| Sticky LedgerGrid column-header row (select-all · sort · frozen · tip) | `@/design-system/components/grid` `LedgerGridColumnHeader` + layout API — Receiving / Incoming adapters thin; **Orders deferred** (resize/reorder recipe). Inner label: `GridHeaderLabel` |
| Grid column justification (end vs start) | `@/design-system/components/grid` `resolveGridColumnAlign` / `gridCellAlignClass` / `gridHeaderCellAlignClass` — see **Grid column justification** below |
| Grid identity columns (freeze · lock · never in-cell edit) | Column model `frozen: true` → `gridFrozenKeys(columns)` (per surface); house default + editability floor: `GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` — see **Grid identity pane** below |
| Grid column visibility (per-staff) | `@/design-system/components/grid` `useGridColumnVisibility` / `useGridFields` + `GridFieldsMenu` — see **Grid column visibility + sort** below |
| Grid column sort (URL-durable) | `@/hooks/useUrlColumnSort` → `?colsort=` / `?coldir=` — see **Grid column visibility + sort** below |
| Collection-surface action planes | `display/workbench.md` — in-cell · row-scoped · multi-select · record, one primary plane each |
| Station Workbench shell / column / wash | `@/components/station/workbench` (`StationWorkbench`, `StationPanelRoot` + `StationAmbientWash`, `STATION_WORKBENCH_*`) — rule: `display/station-workbench.md` |
| Surface / box shell | `Panel` (generic) · `SectionCard` (monitor) · `CardShell` (rows) — never hand-roll |
| Honest absence (missing fact) | `GridCellDash` / ledger `fallback` default `—` — never invent `"N/A"` on ledger/grid primitives |
| Photo gallery viewer | `@/components/shipped/photo-gallery` — `usePhotoGallery` + `PhotoViewerPortal` → `PhotoViewerModal` (composed launcher: `PhotoGallery` / `launcherLayout`). Never a page-local lightbox or `createPortal`+`AnimatePresence` fork around the modal. Read surfaces pass `{ url }` only (omit numeric `id` / upload targets so delete/upload stay off). |
| Carton read surface | `/carton/[id]` → `CartonInspector` → `inspection/CartonInspectionPage` + `carton-inspector-model.ts`. Read model + atoms only (D6 / `pattern-evolution.md`). Photos = `ReceivingPhotosSection` readOnly below pipeline (same component as details-stack Progress). Work escape = one quiet `openInUnboxHref` control — never `"Open in Unbox"` spam on findings/header. IA: disposition header; col1 contents·activity·record; col2 Panel+ReceivingCartonPipeline·photos·history·findings. Linked PO suppresses Unmatched. Not Station Workbench — recipe: `display/carton-read.md`. |
| Receiving note vs label text (**per line item**) | `receiving_line.notes` = operator item note (**never printed**) · `receiving_line.label_note` = the printed face center · `receiving_line.zoho_notes` = Zoho line description · `receiving.zoho_notes` / `support_notes` = PO-header / carton. **All three line columns are per LINE ITEM — never hoist a label note to the carton.** Notes dock (`LineNotesCard`) writes `notes`; label editor (`LabelEditPopover` / As Listed) writes `label_note`. Guard: `label-note-grain.guard.test.ts` — see **Note vs label grain** below |
| Label kind → grain (what the sticker goes on) | `src/lib/print/workspace-label-kinds.ts` — `KIND_META.grain` + `workspaceLabelGrainLabel(kind)` (`PO / carton` · `Per item` · `Container`), carried into every picker by `labelOptionsForSelect`. Never hand-type a kind's name or grain at a call site |
| Dialog / AlertDialog | `@/design-system/components/Dialog` · `AlertDialog` · `requestConfirm` / `ConfirmDialogHost` — never hand-roll `fixed inset-0` scrims for new modals; station floor confirms stay on `ConfirmSheet` |
| Switch / Checkbox | `@/design-system/primitives` `Switch` / `Checkbox` |
| Dropdown / Context menu | `@/design-system/primitives` `DropdownMenu` / `ContextMenu` |
| App chrome / canvas / wash / work-canvas depth | `src/design-system/tokens/app-surface.ts` + `appContentShellClass` (`appWorkCanvasEdgeClass` owns the depth-edge hairline on every desktop page). Receiving rail+workspace share `CONTEXT_PANEL_HOST` ground (`context-panel-column.ts`); Unbox/Triage under that host use `appWorkCanvasLayoutClass` (no full-bleed card sibling) |
| Global detail-stack overlay shell | `@/design-system/shells/detail-stack` (`DETAIL_STACK_LAYOUT`, `DETAIL_STACK_RESIZE`, `DETAIL_STACK_COLLAPSE`, `detailStackAsideClassName`, `detailStackAsideStyle(widthPx?)`, …) |
| Left context-sidebar wrapper | `ContextPanelLayout` + `context-panel-column.ts` (`CONTEXT_PANEL_RESIZE` / `CONTEXT_PANEL_COLLAPSE`) — every route rail beside the workspace; resize + collapse via `HorizontalEdgeResizeHandle`. MasterNav / `SidebarNavColumn` is a separate push spine |
| Right-edge slot occupancy + modality | `RightRailHost` + `src/lib/right-rail/store.ts` — THE right details-panel wrapper; see **Right-rail modality** below |
| Keyboard ownership (Escape / ambient hotkeys) | `src/lib/overlay-stack/store.ts` (+ `useRegisterOverlay` / `useAnyOverlayOpen`) — see **Escape ownership** below |
| Station entity-context header | `@/components/station/entity-context` (`CartonContextCard` + `StationContextBar`) — Unbox / Triage / Testing / Shipping active-order |
| Workbench chrome scoped search | `@/design-system/primitives/ToolbarSearchToggle` — collapsed Search icon; expands on hover / focus / click (or when query non-empty); composes `SearchField`. Never mount an always-open `SearchField` in a `WorkbenchChromeHeader` `search` slot **when search refines an on-screen list**. **Entry-path exceptions:** `/ops/photos` (always-open chrome field) and `/search` (context-rail `SearchBar` in `SearchSidebarPanel`; header launcher hidden) — rationale in `ui-design-system.md` → Scoped search chrome. |
| Station composer dock (chat-style notes) | `@/design-system/primitives` `StationComposerDock` — Unbox overview carton notes **and** all ticket reply chrome (`SupportChatComposer`: inline under thread **and** `variant="station-dock"` via `SupportTicketComposerDock`). Same elevated white shell + auto-grow height; ticket footer = VisibilityToggle · Library (`+`) · Attach (paperclip) · Send (or `trailingAction` as `<StationTerminalDock embedded>` — Send suppressed, Enter still commits). Placement SoT for floating docks: `slicedActionDockWrapperClass()`. Never hand-roll a second sticky/amber ticket composer beside this shell. |
| Resizable document PDF slide-over | `@/design-system/components/DocumentSlideOver` (+ `DocumentPreviewFrame`, `useHorizontalEdgeResize`) — Labels Print, Testing manuals |
| Horizontal pane edge resize grip | `@/design-system/components/HorizontalEdgeResizeHandle` (+ `useHorizontalEdgeResize`) — context rails (`ContextPanelLayout`) + non-modal detail inspectors (`RightRailHost`); never hand-roll a second pill/strip for the same job |
| Recent-rail scrollport / more-below lip | `@/components/sidebar/rail-shell/SidebarRailScrollport` (+ `useMoreBelow` / `SCROLL_MORE_BELOW_CLASS` in `tokens/scroll-edge.ts`) — station + SidebarShell-hosted recent feeds; never hand-roll a second bottom fade. `SidebarRailShell` is content-sized and does **not** own vertical scroll |
| Buttons | `src/design-system/primitives` `Button` |
| Product icon glyphs | `@/components/Icons` (`src/components/icons/*`) — never duplicate nav primitives |
| Station page + L2 mode nav icons | `src/lib/nav/station-nav-icons.ts` + semantic wrappers `src/components/icons/stations.tsx` — mode glyphs unique via `MODE_ICON_GLYPH_KEYS` |
| Top-band chrome icon **display** (glyph box) | `src/components/layout/header-shell.ts` (`TOP_CHROME_ICON_GLYPH` for GlobalHeader Mode / Recents / WO / goal) — native SVG stroke only; do not layer `navIconStrokeClass` on header chips (muddies dense glyphs). Glyph *identity* stays Icons / station-nav |
| L2 Mode + Recents (page modes + cross-page MRU) | `HeaderModeSwitcher` + `HeaderRecentsSwitcher` in `GlobalHeader` — data = `SIDEBAR_PAGE_NAV` / `useSidebarModeNav` / `useRecentModes`. Never a sidebar pill-band twin; no MRU chips in `MasterNavHeader`. |
| Stations Floor / Desk (spine section drills) | `STATION_GROUPS` + required `stationGroup` on `kind: 'station'` rows in `sidebar-navigation.ts`; membership via `SPINE_DRILLS` / `spineDrillIdForPage`. Floor = pipeline scan benches; Desk = Review/Support. Type: page/mode destinations = `text-role-caption` (see spine type ladder in `display/workbench.md`). Guard: `station-nav-groups.guard.test.ts`. |
| Main Overview / Library (spine section drills) | `MAIN_GROUPS` + required `mainGroup` on `kind: 'main'` rows in `sidebar-navigation.ts`; membership via `SPINE_DRILLS` / `spineDrillIdForPage`. Overview = day boards; Library = catalog (Media is top-pinned). Type: same caption destinations + idle modes `text-text-default` (active mode blue). Guard: `main-nav-groups.guard.test.ts`. Law: `display/workbench.md`. |
| MasterNav spine type ladder | Identity `MasterNavHeader` = `text-role-body`; page/drill/mode labels = `text-role-caption` (pages semibold, modes medium); counts = `text-role-micro`. Never sentence-case `text-role-eyebrow` for destinations. Idle pages whisper muted; idle modes stay default ink. Law: `display/workbench.md`. Guard: `main-nav-groups.guard.test.ts`. |
| Stock drill-in (spine) | `STOCK_DRILL` + `kind: 'stock'` rows; root chevron row → back + Products → Inventory → Warehouse. Stations stay static (no drill). Motion: `framerPresence.spineDrill` / `framerTransition.spineDrill` (opacity-only ≤150ms; no horizontal slide). Auto-drill must not steal focus. Guard: `main-nav-groups.guard.test.ts`. Brief: `docs/todo/spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md`. Law: `display/workbench.md` + `display/motion-crossfade.md`. |

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

## Grid column visibility + sort

- **Visibility resolves in exactly ONE place** — `useGridColumnVisibility` (descriptor `tier` + staff
  delta + viewport force-hide → the visible track list, which the header, rows, summaries and the grid
  template all consume). Column `tier: 'core' | 'optional'` is the default-set SoT: grids open **lean**,
  staff opt in from `GridFieldsMenu`, and prefs persist as a **delta** in
  `staff_preferences.tableColumns[tableId]`.
- **Never call `useIsColumnHidden()` from a grid family** — it is the retired cell-granularity path
  that left an empty ruled band instead of removing the track; it survives only for
  `ChipColumns` / `RowMetaColumns`.
- **Sort is URL-durable** via `useUrlColumnSort` → `?colsort=` / `?coldir=`. **Never reuse
  `?sort=` / `?dir=` on station routes** — those are taken by server ordering, and colliding on them
  makes the grid and the query disagree about what "sorted" means.

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
  | `number` · `id` · `location` · `date` | **end** | Qty · price · **order ID** · SKU · serial · ticket · tracking last-4 · ship-by / age |
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

- **Navigators push, inspectors float.** The left spine (`SidebarNavColumn` /
  MasterNav) is a **resident push column** — it dictates permanent workspace
  layout, so opening it moves the frame. The **left context-sidebar wrapper** is
  `ContextPanelLayout` (route rail beside the workspace — not the spine): every
  mounted rail is drag-resizable + collapsible via `CONTEXT_PANEL_RESIZE` /
  `CONTEXT_PANEL_COLLAPSE` + `HorizontalEdgeResizeHandle` (`edge: 'trailing'`).
  Right-rail **record inspectors** are **non-modal floats** (`modal={false}`):
  same inset card, no scrim, no layout squeeze. Never push/squeeze a dense
  LedgerGrid or station column for a transient peek — at 1440px the arithmetic
  does not permit it. Modal remains reserved for blocking wizards and
  destructive confirms (delete, …) — **not** Unbox Claim (station push, same
  family as Ticket).
- **One owner:** `RightRailHost` is THE right details-panel wrapper — it renders
  exactly the top occupant of `src/lib/right-rail/store.ts`. Panels register via
  `useRegisterRightPanel` / `DetailStackRailRegistrar` and own **no** geometry.
  Never add a private `fixed right-0 z-panel w-[420px]` element — that is the
  exact bug the store exists to fix.
- **Modality is per occupant, `modal` defaults to `true`** so every existing panel keeps
  blocking behavior. Pass `modal={false}` for a non-modal **inspector**: no scrim, no
  `backdrop-blur`, no body scroll lock, `role="region"` + `ariaLabel` instead of
  `role="dialog" aria-modal`. That is the correct contract for a pick-a-row-and-edit-it
  surface — the operator's context (sibling rows, KPI strip, lifecycle tabs) is exactly
  what a scrim would hide. Reserve modal for surfaces that genuinely block until dismissed.
  Occupants that already float non-modally: dashboard order inspector (`detail:order`),
  receiving details (`detail:receiving`, keep `elevated` so the card clears Unbox
  `z-panel` workspace overlays — elevated z without the scrim), **intake / import
  planes** (`detail:new-order`, `detail:incoming-import-ebay`, `detail:order-sync`,
  `detail:incoming-sync` — same non-modal metric; Import popovers stay triggers
  only). Receiving details
  also pass `closeOnOutsideClick` so an invisible dismiss layer restores click-off
  close without darkening; dashboard / intake leave that flag off so the grid stays live.
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
  reading. When none is open, the parked `ReceivingPushExpandStrip` restores
  them.- **Do not "fix" a non-modal occupant by adding a focus trap.** The host has never
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

## Note vs label grain (per line item)

Receiving carries four note-shaped fields. They are four **different grains**, and
the two that live closest together were one column until 2026-07-31.

| Field | Grain | Printed? | Written by |
|---|---|---|---|
| `receiving_line.notes` | **line item** | **never** | notes dock (`LineNotesCard` → `StationComposerDock`) |
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
- Guard: `src/components/receiving/workspace/line-edit/label-note-grain.guard.test.ts`
  (wiring) + `src/lib/print/workspace-label-kinds.test.ts` (faces + grain).

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
