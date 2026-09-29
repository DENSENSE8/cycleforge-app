# Kinetic Ledger — Cycle Forge design system

This folder is the code SoT for **Kinetic Ledger**: data-first reseller-ops UI — dense, state-colored, scan-aware,
multi-tenant. **Legible throughput** over document calm.

**Agent law (always-on):** root `AGENTS.md` → Kinetic Ledger five laws.  
**Recipes:** `.claude/rules/ui-design-system.md`, `.claude/rules/contextual-display.md`.

## North Star

### Product identity

- Multi-tenant **reseller operations** (warehouse floors, boards, tables, timelines, Studio graph, mobile scan).
- Industry blend: **ops density** (Carbon / Stripe Dashboard) + **Linear chrome discipline** + **POS/scan floors** + **Studio canvas**.
- Not a document product skin. Calm chrome is fine; document whitespace as the product shape is not.
- **Exact flush + plane depth:** work columns share one canvas ground; depth =
  surface steps + `elevationClass` + `nestedCorner` — not floating gutter islands
  between spine · context · center · right. Frame budget (center floor · single
  right edge for AI vs detail):
  [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) →
  **Depth elevation** · **Frame column budget** · **Right-rail modality**.

### Five laws

1. **Facts and state drive chrome** — chrome never invents a second story.
2. **Region contracts** (Station / Workbench / Monitor / Canvas) are I/O + persistence — not layout skins.
3. **Data shape chooses primary surface** — table | list | board | card | timeline | KPI zones | canvas.
4. **Presentation kinds resolve via SoT modules** — labels, tones, chips, dates, capabilities, search hits; views stay dumb.
5. **Compose named primitives/blocks; grow the SoT when wrong** — pattern evolution, not freeze.

### Station Workbench (Unbox-family right pane)

Right-pane unit work (Unbox / Testing / Triage / Shipping / Packing / Repair intake) composes
`StationWorkbench` from `@/components/station/workbench` — toolbar → entity context →
`SectionTabsSlider` → tab-aware `StationTerminalDock`. Region contract:
[`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md).

### Task modes (`modes/registry.ts`)

A mode is what the operator is DOING in a region; it is orthogonal to theme.

| Mode | Where | Feel |
|---|---|---|
| `industrial` | `/m/*` operation flows only (phone and iPad: scan, pack, scan-out, count — the route declares it); never a desk (owner 2026-09-28) | Canvas `#fafafa`, white rows, flush corners, 13px, 32px hit; motion only on the scan-status spot |
| `triage` | every desktop route (In place / Split, no Floor), `/m/*` reading flows, right-rail detail occupants | Slate, 4px corners, 14px, 12px page pad |
| `counter` | Kiosk shell (`/kiosk`, `/kiosk/v2`, `/m/consult`) | 12px corners + pill chips, 16px, 40px hit / 56px CTA, tenant `--mode-brand` |
| `assistant` | Right-rail assistant dock, `/ai-chat` | 12px corners, 15px, 200ms enter + 1200ms pulse |

Coarse pointers raise hit floors to 48px, and page padding and body text where the registry says so.

- **Nesting is by REGION, one level deep:** a page region plus at most one nested
  region (e.g. the right rail). `ModeRegion` reports a third level in development;
  a region re-declaring the mode it already sits in (a portalled dialog or sheet)
  is not a new level.
  The scan bar and state colours (success/warning/danger/info/fulfillment) never change by mode.
- **Page mode is declared, not mounted:** `src/lib/routing/mode-registry.ts` maps
  every route prefix to its mode (longest first; `mode-registry.test.ts` fails on an
  undeclared page) and `RouteModeRegion`, mounted once in `AppShellSwitch`, applies
  it. Pages do not mount a page-level `ModeRegion`. There is no device collapse: a
  coarse pointer (iPad) keeps the route's mode. Outside every region `:root`
  carries the triage values.
- **Mechanism:** `<ModeRegion mode="…">` for a nested region or a portal that
  escapes the page's DOM (`providers/ModeRegion.tsx`; `useMode()` reads it). The
  registry generates `[data-mode]` CSS, injected by `app/layout.tsx` as
  `<style id="app-mode-registry">`.
  On light schemes the region remaps the neutral `--ds-color-*` vars, so existing
  `bg-surface-*` / `text-text-*` / `border-border-*` adopt the mode for free. Mode-only
  roles come from `rounded-mode(-pill)`, `p(x)-mode-page`, `min-h-mode-hit(-cta)`,
  `bg-mode-well` / `bg-mode-bar`, `border-mode-control`, `text-mode-warn`,
  `text-mode-body`, `duration-mode-feedback`. Look them up with `ds_tokens mode`.
- **Spacing follows the mode, by INTENT:** padding and gaps are the spacing
  intents — `inset-chip` / `inset-field` / `inset-cozy` / `inset-card` /
  `inset-empty`, `stack-tight` / `stack-row` / `stack-section`, `row-gap` /
  `row-tight` (primitives `Inset`, `Stack`). Each mode declares their values
  in `spacing` (`packages/design-tokens/src/modes.ts`, px) → `--mode-inset-*`
  / `--mode-stack-*` / `--mode-row-*` (rem, so the font scale moves them), and
  the utilities multiply by `--cf-density`. **Triage** runs `TRIAGE_SPACING` —
  a native desktop rhythm on Fluent 2's 4px ramp (2 · 4 · 8 · 12 · 16 · 20 ·
  24 · 32, 6 as the icon nudge): list/menu rows `inset-cozy` 12×8 so a 14px
  row lands on the 32px hit, facts `stack-tight` 8, rows `stack-row` 12,
  sections `stack-section` 32. Industrial, counter and assistant stay on
  `DESK_SPACING` (the pre-mode values). A mode gets roomier or tighter by
  declaring its own scale — one edit re-pads every intent in that mode and
  nothing outside it. Components pick the intent, never a literal `p-*` for
  a recurring job, and never override an intent's value locally.
- **Label voice follows the mode:** every mode declares a `labelVoice` (`mono` on
  the floor, `sentence` on the desks) → `--mode-label-case` / `-tracking` / `-font`
  / `-weight` / `-size`. `text-role-eyebrow` / `text-role-micro` read the case and
  tracking intrinsically, `mode-label` / `mode-label-case` read the rest; labels
  never add `uppercase tracking-widest` — today every voice is sentence case
  (owner 2026-09-28, the floor included). Caps-by-identity codes (SKU, lifecycle
  code) keep an explicit `uppercase`.

Density still applies inside a mode: `--cf-density` (`[data-density='compact']`
0.92, the DataTable zoom) multiplies every intent and the stock spacing scale.

### Disclosure ladder — progressive disclosure, just in time

Owner 2026-09-27. The operator's buffer holds only what the current decision
needs; everything else is ONE intent away (click, hover, Space/Enter, a wedge
scan) and never loaded up front. Five layers, each opened by one intent and
closed by Esc back to the layer above:

| Layer | Carries | Opened by | Primitive |
|---|---|---|---|
| L0 row | the **What**: identifier, state code, next physical action | — | the record row (`LifecycleCode`, next-step badge) |
| L1 glance | read-only explanation of what the row already says | hover / focus, Space quick-look | `HoverTooltip` |
| L2 anchored list | a list about the row, **its verbs inline per row** | click / Enter on a trigger | `AnchoredLayer` / house `Popover`, rows on `RECORD_TRAILING_CELL_CLASS` |
| L3 record | the **Why**: history, logs, exception detail | Enter on a row, a scan | `DeskRecordPlane`; sections inside collapse via `EvidenceDisclosure` |
| L4 confirm | a destructive or irreversible step | a verb inside L2 / L3 | `Dialog` / `AlertDialog` |

1. **Separation of depth.** The row never carries the Why; the record never
   repeats the row's What as its body. A fact the row needs to route on moves
   down to L0 — it does not get a tooltip.
2. **Stable frame.** Opening a layer never navigates or remounts the list: the
   list stays mounted under every layer (`DeskRecordPlane` keeps it mounted in
   both views) and the global search stays put. A record opens **in place** by
   default (owner 2026-09-27; the `desk.<id>.view` setting defaults to
   `in-place`) — Split is the staffer's own choice. Layers render in their own
   zone — anchored panel, split column, overlay — whose corner follows the
   mode (`rounded-mode-*`: square on the Floor, rounded in triage).
3. **Action proximity.** A verb lives in the layer that shows its facts — a
   popout row's Edit / Copy / ✕ sit in that row, never in the page header.
   L1 holds no verbs (a tooltip cannot be entered).
4. **Keyboard first.** Drill-down: Enter on a focused row opens L3 and moves
   focus INTO it (`DeskRecordPlane`, both views). Escape hatch: Esc closes the
   innermost layer and returns focus to the element that opened it
   (`DeskRecordPlane` → the record's row; `AnchoredLayer` → its opener). Only
   L4 traps focus; L2 / L3 are non-modal so J/K keep walking the list.
5. **A scan is a drill-down.** On To ship (`/shipping/orders`) a wedge scan of
   an order # or tracking # opens that order's L3 in place through the record
   cursor (intent `'scan'`) — `useToShipScanOpen` claims the global wedge's
   `wedge-scan` event; `matchScannedOrder` (`src/lib/orders/scan-order-match.ts`)
   resolves loaded rows, `/api/orders/lookup` the rest. Known but off the list
   → a toast with Open; unknown → a toast. A scan never re-filters the list.

Runtime focus behaviour has no DOM test stack yet (`skill://add-guard` Tier 4)
— it is enforced by the two primitives above, not by a source regex.

### AI surfaces are a separate system (`ai/`)

AI surfaces (`/ai-chat` first) do NOT use Kinetic Ledger chrome. They mount
`AiSurface` and compose `@/design-system/ai` — theme-following neutrals, an
iridescent accent used only while the AI works, soft 12–20px corners, a chat
prose scale, a fixed centred chat frame, and Motion + Motion+ presets. SoT and
usage: [`ai/README.md`](./ai/README.md) (values in `ai/tokens.ts`).

### Visual principles

- Data-first hierarchy and compact scanning.
- Line-based separators over **random** card-heavy soup (named rollup cards and boards are allowed).
- Functional color cues for instant state recognition.
- Inline editing and inline actions as the default interaction model for ops surfaces.
- Typed chips / status presentation via SoTs — not ad-hoc pill invention.

## Implemented In This Folder

### Tokens

- **Cross-platform source:** `packages/design-tokens` (`@cycleforge/design-tokens`)
  owns the colour primitives, the state tones (`STATE_TONES`: info · warning ·
  fulfillment · danger · success), the light theme's values (`LIGHT_THEME`) and
  the task-mode registry. `tokens/colors/base.ts`, `themes/light.ts` and
  `modes/registry.ts` import from it — never restate a value here.
  `pnpm tokens:build` renders `generated/tokens.css` (desktop bundle),
  `generated/DesignTokens.swift` (iOS) and `generated/tokens.json` (design-mcp);
  verify gate `Design tokens` (`pnpm tokens:check`) fails on any drift.
- **Lifecycle states:** `LIFECYCLE` (package `lifecycle.ts`) is the one meaning,
  code, word and tone of to pick · picked · urgent · packed · out of stock ·
  shipped — to pick is `neutral` grey, picked `info` blue, packed `fulfillment`
  purple, shipped `success` green, everywhere. Web class
  maps read `LIFECYCLE_CLASSES` / `STATE_TONE_CLASSES`
  (`tokens/lifecycle.ts`); tone vocabularies read `LIFECYCLE[state].tone`.
  `tokens/lifecycle.guard.test.ts` fails any packed/shipped entry that picks
  its own colour. Success/warning TEXT is the -700 step (≥ 4.5:1); their fills
  stay -600/-500.
- Color base and semantic maps:
  - `tokens/colors/base.ts` (re-exports `baseColors` from the package)
  - `tokens/colors/semantic.ts` — includes `condition` palette (used/new/parts/quantity)
- Typography:
  - `tokens/typography/families.ts`
  - `tokens/typography/sizes.ts`
  - `tokens/typography/weights.ts`
  - `tokens/typography/presets.ts` — composed Tailwind class presets (`sectionLabel`, `fieldLabel`, `dataValue`, `monoValue`, `chipText`, `cardTitle`, `tableHeader`, `tableCell`, `microBadge`). Every preset is sentence case — no CSS `uppercase` anywhere on screen (owner 2026-09-28); eyebrows / chips / field·section labels stay small micro chrome, not caps.
- Density and structure:
  - `tokens/spacing.ts` — includes `density` presets (compact/standard/spacious)
  - `tokens/borders.ts`
  - `tokens/radius.ts` — the corner-radius SoT (renamed from `radii.ts`). **Zero-radius law:** ops
    chrome is flush-square — solid CTAs, tab bands, selects, chips and toggle rows compose
    `cornerClass('flush')` (`rounded-none`); soft radius and horizontal pill bands are debt. Roles:
    `flush` (ops default) · `chip` · `row` · `control` · `field` · `card` · `canvas` · `pill` (status
    dots / avatars / Switch only); `nestedCorner(outer, padStep)` for concentric nesting. Tab-band SoT
    is `TabDisplay`; compose-field SoT is `DenseComposeFields` / `SearchableSelectField appearance="flush"`.
  - `tokens/shadows.ts` — raw box-shadow CSS vars + elevation roles
    (`elevationClass('flat' | 'raised' | 'overlay')`; raised intensity `soft` | `default`)
  - `tokens/table-surface.ts` — ops table / spreadsheet shell
    (`TABLE_SURFACE_CLASS` / `CLIP` / `SCROLLPORT` + `TABLE_FROZEN_HEADER_CLASS` —
    xl radius + raised lift + sunken frozen header; airtable column rules continuous)
- Motion:
  - `foundations/motion.ts` — CSS-oriented durations / cubic-bezier strings (`micro=100ms`, `fast=150ms`)
  - `foundations/motion-presets.ts` — Motion (`motion/react`) presets used on station surfaces:
    - `motionBezier.easeOut` / `motionBezier.layout` — cubic tuples aligned with **ActiveStationOrderCard** / **Up Next OrderCard**
    - `motionDuration` — second-scale timings (now includes `tableRowMount`, `dropdownOpen`, `overlaySearchIn`, `chipCopyFeedback`)
    - `motionTransition` — named transitions (`stationCardMount`, `upNextRowMount`, `tableRowMount`, `dropdownOpen`, `overlaySearchIn`, `chipCopyFeedback`, chevrons, serial rows, badges, work-order springs). No height transitions: `<Collapse>` owns height timing.
    - `motionPresence` — `initial` / `animate` / `exit` objects (`tableRow`, `dropdownPanel`, …); `motionVariants` for the variants API. **No height presets:** height animates only through `components/Collapse.tsx` (below).
  - `components/Collapse.tsx` — **the one height reveal** (2026-09-27). `<Collapse open>` for a region, `<CollapseItem>` for keyed list rows under a caller's `AnimatePresence`. It measures the parent's row-gap and its own margins on mount and moves them inside the animated height, so nothing snaps when the box mounts or unmounts (the "closes, then a final hiccup" bug). `className` styles the content box; the frame takes no padding / border / background. ESLint (`no-restricted-syntax`, "Animate height only through <Collapse>") rejects `height` in any `initial` / `animate` / `exit`.
- CSS variable generation:
  - `tokens/css-variables.ts`

### Themes (the theme registry — SoT for all theme-varying color)

- `themes/registry.ts` is the single source of truth for every theme-varying
  CSS variable (`--ds-color-*` + `--background`/`--foreground`), the
  `ThemePalette` contract, the `STAFF_ACCENTS` table, and the CSS generator
  (`themeRegistryCssText()` → injected by `app/layout.tsx` as
  `<style id="app-theme-palettes">`).
- Palettes: `themes/light.ts` (default; values from `LIGHT_THEME` in the
  token package), `themes/dark.ts`, `themes/mono.ts`
  (strict grayscale; collapses staff accents; keeps a muted
  success/warning/danger safety triad), `themes/slate.ts` (cool industrial).
- Two `<html>` attributes, stamped by `src/lib/theme/theme.ts`:
  `data-theme="<name>"` selects the palette block; `data-color-scheme="dark"`
  (from `palette.scheme`) scopes the raw-neutral compatibility remap in
  `src/styles/globals.css` + dark staff-accent overrides — any dark-family
  theme inherits both for free.
- **Adding a theme**: author `themes/<name>.ts` (the `ThemeVars` Record type
  forces full variable coverage), register it in `THEME_PALETTES`, widen
  `ThemeName`. The boot script, the Appearance switcher (with preview
  miniature), and persistence pick it up automatically. Run the contrast audit
  before shipping (see the audit report's §5 execution log).
- **Consuming color**: use the semantic utilities bound to the registry —
  `bg-surface-card/canvas/sunken/hover/strong/inverse`, `text-text-default/
  muted/soft/faint/inverse/inverse-soft`, `border-border-hairline/soft/default/
  emphasis/strong/inverse`, functional trios (`*-success/warning/danger/accent`),
  and tone fills (`bg-fill-info` …). Alpha modifiers work (`bg-surface-card/90`
  → `color-mix()`); raw neutrals are ratcheted by
  `src/components/ui/color-neutrals.guard.test.ts`.

### Primitives (`primitives/`)

- `PanelRow.tsx` — base row with label, accessory, actions, divider
- `IconButton.tsx` — icon-only button with tone variants
- `SearchField.tsx` — decoupled draft architecture, debounced, tone-colored; hover-reveal paste glyph (smaller than the leading Search icon)
- ~~`ToolbarSearchToggle.tsx`~~ — **deleted 2026-08-03.** Workbench / rail scoped search SoT is `TechRailSearchBar` (`@/components/sidebar/tech/TechRailSearchBar`): always-open field + paste; `variant="chrome"` for headers (in-field Search glyph in a sunken bordered well), `variant="rail"` for footers.
- `DeferredQtyInput.tsx` — number input with internal draft, clamped on blur
- `StatusText.tsx` — sentence-case label with colored underline
- `StickyHeader.tsx` — sticky top/bottom with optional frosted-glass backdrop
- `ConditionText.tsx` — inline condition+qty+title with color mapping; exports `getConditionColor`, `formatConditionLabel`
- `ActionButtonGroup.tsx` — row of icon action buttons with consistent spacing

### Components (`components/`)

- Layout/data rows: `DetailLineRow`, `DetailsPanelRow`, `PanelSection`, `MetricLineRow`
- Status/feedback: `StatusBadge`, `InlineSaveIndicator`, `AppToaster` (Kinetic Ledger Sonner theme — light semantic fills via `@/lib/toast`; never `richColors`)
- Values/editing: `UnderlineValue`, `InlineEditableValue`
- Actions: `CopyActionIcon`, `ExternalLinkActionIcon`
- Search/labels: `StatusMicroLabel`
- Overlays: `AssignmentOverlayCard`, `Tooltip`
- **Workbench spreadsheet (SoT):** `components/grid/`
  - `LedgerGrid` — virtualized sticky-header spreadsheet shell (`scrollX`, `gridSkin="airtable"`, optional day bands). Golden path: Pending / To Ship via `useOrdersSpreadsheet` → `NonlinearTableHost`. Under ancestor page scroll + `scrollX` it runs **split-x mode**: the header band lives outside the inner h-scroll box (an `overflow-x` container captures `position: sticky` on both axes) and is translated via the synced `--cf-grid-sx` offset. H-scroll affordance: **sticky bottom X gutter** (`GridStickyXScrollbar` + `useSyncedHorizontalScrollbar` — always reachable for triage; body keeps `no-scrollbar`) plus `cf-grid-overflow-start` / `-end` inset shadows via `applyGridOverflowXClasses` (right edge visible at rest when columns sit off-card). Dense / admin tables use `TableStickyXScroll`.
  - Outer frame: `TABLE_SURFACE_CLIP_CLASS` (framed card — rounded-xl + raised) or `TABLE_SURFACE_SHEET_CLASS` (flush Sheets plane — hairline only, `border-l-0`; Receiving golden via `LedgerGridSurface` `surface="sheet"` + `WORKBENCH_SHEET_HOST`). Airtable draws **BOTTOM-only** row rules (`border-hairline`) through header + body — **no vertical column rules** (1B; structure recedes).
  - `LedgerCellEditor` — Sheets-style in-cell edit commit shell.
  - `VirtualGroupedSections` — shared date→groups/rows virtualizer (LedgerGrid + station/receiving feeds).
  - **Column visibility (ONE rule, one place):** `useGridColumnVisibility({ columns, tableId, forceHidden })` resolves descriptor default tier + the staffer's persisted delta + ephemeral viewport collapse into the visible track list; the view passes that list to the header, rows, group summaries **and** its geometry fn, so a hidden column loses its TRACK. `useGridFields(tableId, columns)` backs `GridColumnDetailsPanel`, generated from the descriptor and opened from `GridColumnGutter`. **Portal or nothing — two hosts (2026-08-06, tightened 2026-08-08):** pass the Band-3 triage `controlsSlotRef` element (the norm) **or** the inspector View cluster's element (Unbox · To-ship) as `columnTriggerPortalTarget`, so ▦ sits resident beside filter / staff / week / sort. A table with neither host paints **no** ▦ — the card-corner hover-reveal float is deleted, and there is no `triggerPortalOnly` opt-out any more. Never page chrome (retired 2026-08-02 with `GridFieldsMenu`) and never a resident header track / `pr-9` (covered `TRACKING`). Column models carry `tier: 'core' | 'optional'` — `optional` ships OFF so grids open lean and staff opt in; prefs persist as a delta (`hidden`/`shown`) in `staff_preferences.tableColumns[tableId]`, never an absolute list. **Do not** call `useIsColumnHidden()` from a grid family — that is the retired cell-granularity path (it left an empty ruled band where the track should have gone) and now serves only the legacy `ChipColumns`/`RowMetaColumns` row primitives. Guard: `grid-column-tier.guard.test.ts` + `grid-column-visibility.test.ts` + `workbench-trailing-cluster.guard.test.ts`.
  - **Column width is a per-staff drag:** `ColumnResizeHandle` on each resizable header cell mutates only the surface's `--cf-col-<key>` var (so header, rows, summaries and the frozen pane's sticky-left `calc()` reflow together with no React render), committing once on drop through `useGridColumnWidths` → `staff_preferences.tableColumns[t].widths`, applied back via `LedgerGrid` `columnVars`. `isGridColumnResizable` is the one rule for who gets a grip: variable-content tracks yes; `select` and the fixed-format types (`number` · `id` · `location`) no — their cells render a last-8 chip or a short numeral run, so a drag only moves whitespace. Override with `resizable` on the column model.
  - **Column sort is URL-durable:** `useUrlColumnSort({ isColumn, defaultDir })` owns `?colsort=`/`?coldir=` — deliberately NOT `?sort=`/`?dir=`, which are already taken by *server* ordering vocabularies on `/incoming` (`useIncomingFilters`) and History (`normalizeHistorySort`). Both params are registered in `MODE_SCOPED_PARAMS` + `stripCrossSurfaceParams`, so a column sort clears on mode/surface switch. Pending/Testing (`useQueueDisplaySort`) and Repair (`useRepairDisplaySort`) keep their composite wrappers.
  - **Headless state engine (TanStack Table v8 — state math ONLY):** `useGridSurface` (`"use no memo"` — React Compiler trap) owns column defs + sorting + visibility + column order; markup, virtualization, grouping/folds, fetch, and mutations stay house. `grid-surface-descriptor.ts` (`buildLedgerColumnDefs`, `makeGridSurfaceDescriptor`, `GridSurfaceDescriptor`) lifts a house column-model list (`ORDERS_QUEUE_COLUMNS` / `INCOMING_GRID_COLUMNS` / `RECEIVING_GRID_COLUMNS`) into TanStack defs carrying the house model on `meta.gridColumn`. **Never** mount a foreign UI grid (AG Grid / MUI / Glide) and never let TanStack own widths/markup — geometry stays on the house CSS-var templates.
  - `LedgerGridSurface` — descriptor-driven station composer (card shell + skeleton + teaching empty + TanStack sort surface + `LedgerGrid`). Adopters: `IncomingGridView`, `ReceivingGridHost`. Pending composes `LedgerGrid` directly (full-bleed ancestor scroll, URL `?sort=` SoT, force-hide, drag order).
  - Shared VALUE cells for grid rows/summaries: `@/components/ui/grid-cells` (`GridCellDash`, `GridDateCellValue`, `GridAgeCellValue`, `GridPlatformMarkValue`, `GridStaffCellValue`, `GridDateTimeCellValue`, `GridStatusCellValue`) — compose these, never re-type the em-dash / age-tone / date-tooltip / brand-mark markup per surface.
  - **Row anatomy — a fact belongs to its own COLUMN** (2026-08-02): a column is the only address at which a fact can be sorted, hidden, resized, highlighted and aligned with its own kind. So **no status dot in the identity cell** — the title column shows the title; the dot rides the `status` track. **The status cell is `GridStatusCellValue`**: the house 3-layer chip with the dot **inside** it, tone from the surface's lifecycle registry (`workflowStage().badge`, `pickupOrderStatusChipClass`, …) and the ring derived from the resolved ink (`ring-current/20`), so no registry needs a new field — never a page-local status chip (four surfaces had one). A civil day and its stamp share ONE column. **The `META_COL` dot track on list/accordion rows is NOT this** and stays correct: a list has no columns, so the row's left edge is the only address a state mark can have. Full set + the `order`-freeze / `#`-header preconditions: `.claude/rules/display/workbench-ops-queue.md` → Row anatomy.
  - **Frozen-pane sticky offset:** `gridFrozenLeft(columns, key)` (`components/grid/grid-column-geometry.ts`) — one implementation, taking the SURFACE's own columns, with the width fallback as the track's rem FLOOR. Ten hand-rolled copies pushed `var(--cf-col-KEY, ${col.width})` instead, and `col.width` is a `minmax()` grid-track string: illegal inside `calc()`, so `left` computed to `auto` and the pane silently did not pin at all (invisible to review, because a staffer who had drag-resized the preceding column set the var to a real px and saw it work). Guard: `grid-frozen-left.guard.test.ts`.
  - **Do not** fork sticky header / scrollX / virtual body chrome for ops queues — compose `LedgerGrid` + a domain thin composer (`useOrdersSpreadsheet`, receiving/station wrappers). Domain cell registries stay out of DS.
  - **Two expand jobs (never merge):** Maximize2 / non-edit open = domain `onOpenRecord` (detail pane); parent→child collection drill = `LedgerDrillHost` / `LedgerDrillParentMap` (parent rollups only on the drill map; list sheets stay flat leaves via `groupRowsBy`).
  - Sibling SoT for non-virtualized HTML tables: `components/AdminTable/` (lifecycle/admin tables — `{ key, header, cell, align, width }` schema; **no TanStack, no virtualizer** — that simplicity is its job). Boards / pickers / rails stay their own surfaces.
- **New components:**
  - `DateGroupHeader.tsx` — sticky date group header for tables with variant-based tonal backgrounds
  - `FormField.tsx` — standardized form field wrapper (label, required indicator, hint)
  - `OverlaySearch.tsx` — animated toggle between trigger element and search input
- **Re-exported from `components/ui/`:**
  - `CopyChip.tsx` — semantic chip family (TrackingChip, FnskuChip, SerialChip, OrderIdChip, TicketChip, SourceOrderChip)
  - `TabSwitch.tsx` — legacy soft-pill tab switcher with variant support
  - `TabDisplay.tsx` — industrial SoT tab switcher (flush / zero radius; Displays nested verbs)
- Sidebar intake chrome: `sidebar-intake/` (intakeFormClasses, SidebarIntakeFormShell) — **create / import / prefs only**. Record right-rail peeks use `PaneHeader` + `PaneHeaderLabel` (see `.claude/rules/display/right-rail-inspector.md`).

### Procedure & scan progress (`components/procedure/` + station chrome)

The **instrument-panel** families — a Station's derived procedure and the chrome that reads it.
House law: [`.claude/rules/display/instrument-panel.md`](../../.claude/rules/display/instrument-panel.md).

A procedure has **TWO views and exactly ONE derivation**. Two surfaces was never the hazard; two
derivations drifting was.

| Job | Compose | Never |
|---|---|---|
| "What do I do right now" | `ProcedureDeck` (centre — flat 36px faces, outline selection, evidence band under the list) | Expanding the selected face; a sibling evidence region *above* the face list |
| "Where am I in the whole job" | `ProcedureChecklist` (a Displays body) | A pinned always-on procedure column |
| Open / close that checklist | `ScanStationProgressControl` (Displays strip `rightSlot`) | A Checklist Lucide cell on the Displays icon strip |
| Draw procedure completion | `ScanStationProgressRing` | `GoalRing` — a different product concept |
| Daily goal pace (GlobalHeader) | `GoalRing` | Copying it onto a station bench |
| Inspector body facts | `OrderFactList` + `OrderFactRow` (`@/components/order-record`) | Card soup; a hero title in the header |

**Import path:** `@/design-system/components/procedure` — exports `ProcedureDeck`,
`PROCEDURE_STEP_FACE_HEIGHT` (a Tailwind class string, `'h-9'` — 36px; not a number),
`ProcedureChecklist`, and `type ProcedureStepRow`.

**Step vocabulary** (`procedure/types.ts`): `ProcedureStepState = 'done' | 'active' | 'pending' |
'skipped'`. **`skipped` is NOT `done`** — it is a human waiver recorded *without* evidence and must
never render with a check mark. A step goes `done` because the evidence exists, never because
someone remembered to tick it (org-editable hand-ticked lists were deleted 2026-08-01 and stay
deleted).

| Always | Never |
|---|---|
| Hand the deck **every** step, in vocabulary order | Filter or re-sort before passing — the deck is a transform (`procedure-deck-order.guard.test.ts`) |
| Derive both views from one hook (Unbox: `useUnboxProcedureSteps`) | Let a second surface compute its own answer |
| Keep the ring bare — 16px, no numeral, no plate behind it | Put a numeral inside it or a card shell around it |
| Let exactly **one** queued card peek below the focus card | Stack a multi-layer pile (it reads as a failed paint, not depth) |
| Encode state in glyph + tone | Encode state in opacity — dimming is a FOCUS channel |
| Re-dispatch focus to the scan bar after any pointer click | Leave focus on a control the next wedge scan would type into |

**Two known debts — do not propagate:**

1. `ScanStationProgressRing` hardcodes `#E2E8F0` (track) / `#94A3B8` (idle) / `#334155` (selected).
   That predates the no-page-local-hex law; a named `instrument-selected` recipe is the fix. Do
   **not** copy those literals to a second surface meanwhile.
2. `ProcedureDeckProps` and `ProcedureCardFace` are module-private, and `ProcedureStepState` is not
   in the barrel. A station porting the deck must supply a `face()` mapper whose return type it
   cannot import. **Export them in the same change that first consumes them** — exporting ahead of a
   consumer adds a new knip finding and fails the gate.

## CopyChip Semantic Rules

**Hard rule: chip variants are semantically bound to data types and must never be interchanged.**
Quiet faces: tone is **icon hue + mono + click-to-copy** (no bottom underline rule).
Plain full-string cells use `CopyableCellValue` (same `useCopyChip` behavior).

| Chip | Icon hue | Icon | Use for | Never use for |
|------|----------|------|---------|---------------|
| `TrackingChip` | Blue (default) · **carrier brand hex when known** | MapPin (`CarrierMark`) | Carrier shipping tracking numbers (UPS, FedEx, USPS…) — brand paint from `carrier-brand.ts` | FNSKU codes, order IDs |
| `UnitPriceChip` | Emerald | Receipt | Zoho PO unit cost / money facts | Qty / counts |
| `FnskuChip` | Purple | Package | Amazon FNSKU identifiers (e.g. `X001ABC123`) | Shipping tracking numbers |
| `SerialChip` | Emerald | Barcode | Device / unit serial numbers | Any non-serial value |
| `OrderIdChip` | Gray | Hash | Internal order IDs | Tracking or FNSKU |
| `TicketChip` | Orange | Ticket | Repair / support ticket IDs | Any other type |
| `SourceOrderChip` | Gray | Hash | External platform order numbers | Tracking or FNSKU |

**FNSKU ≠ Tracking Number.** FNSKUs are Amazon product identifiers scanned at FBA intake. Tracking numbers are carrier labels attached to outbound shipments. Displaying an FNSKU inside a `TrackingChip` (blue, MapPin) or a tracking number inside an `FnskuChip` (purple, Package) is a design-system violation.

## Tab Switcher Rules

**Industrial SoT (Displays nested verbs):** use `TabDisplay` from
`src/design-system/components/TabDisplay.tsx` (barrel: `@/design-system/components`).
Square / flush / zero corner radius — no soft pills. Densities: `nested` (shipped for
Unbox Displays verb switchers), `band` / `icon` reserved for later migrations.

**Legacy soft pills:** `TabSwitch` (`variant="solid"` etc.) remains for non-Displays
call sites until they migrate to `TabDisplay`. Table and desk tab strips are NOT
among them — those are `TableTabs` (`components/tables/TableStatusBar`), the one
flush strip a table foots itself with. Custom pill buttons or ad-hoc toggle rows are not
permitted. Wrap legacy `TabSwitch` in `SidebarTabSwitchChrome` when it sits in a
sidebar header row.

**`TabDisplay` (industrial):**

| `density` | Geometry | Use for |
|---|---|---|
| `nested` | Displays verb / claim-mode switchers | Photos · Ticket · Linkage · Claim New/Link |
| `band` | ~40px flush strip sizing | Workbench lifecycle (API ready; consumers still on TabSwitch) |
| `icon` | Quiet topic strip | Owned by `SectionTabsSlider` `density="icon"` — SpaceX `h-10` edge-to-edge plate + underline active + trailing ⋮ |

| `appearance` | Weight | Active treatment | Use for |
|---|---|---|---|
| `underline` | **Parent** | Bottom rule + body type; no inverse fill | Displays nested verbs (Link·Note, Units·Prebox) |
| `segment` | **Child** | Sunken rail + **flush** light face (no gutter); caption type | Local subset under a parent (Claim New ticket·Link existing; Photos Move·Send) |
| `fill` | High-contrast | Inverse sliding rectangular face, inset by a `p-0.5` gutter | When a single-layer inverse switcher is required |

Parent must sit above child and carry more weight — never stack two inverse fills.

**`segment` carries no gutter** (2026-08-05). It shared `fill`'s `p-0.5` inset
until then, which put 2px of sunken rail around a light face on a light rail —
a floating capsule doing the job the rail's own hairline already does. `fill`
keeps its gutter because an inverse face genuinely needs to read as inset.

**`TabSwitch` `variant` (legacy soft pill — one sliding pill, always):**

| `variant` | Rail | Active pill | Active text | Labels | Use for |
|---|---|---|---|---|---|
| `default` | `bg-surface-sunken` sunken track | light `bg-surface-card` pill | per-tab semantic hue (`color`) | sentence case, `font-semibold` | most in-app tab rows |
| `solid` | light `bg-surface-card` + `border-border-default` | **dark `bg-surface-inverse` pill** | `text-text-inverse` (white) | title-case, `font-semibold` | headline lifecycle switchers (Dashboard · Outbound) — high-contrast Linear-style control **(legacy)** |
| `upNext` | tinted station rail (`bg-surface-strong`) | light pill + station outline | semantic hue | sentence case | station up-next queue |

- `TabSwitch` `countStyle`: `badge` (mini pill bubble, default) or `plain` (inline — preferred for dense ops headers). `TabDisplay` always uses plain tabular counts.
- `solid` / `TabDisplay` labels come from the source string as-is (no CSS uppercasing) — store them title-case. All treatments are token-only so they flip under `data-theme` dark mode.
- Don't hand-set rail colors at the call site — pick the SoT primitive (`TabDisplay` for Displays nested verbs; `TabSwitch` variant until migrated) rather than forking chrome via class overrides.

## Functional Color Mapping (the color story)

Color carries meaning in this app — a hue is never decorative. When building any
new status/tone map, **pick the hue by meaning from this table**, then take the
value from the token SoT (`tokens/colors/semantic.ts`) — never eyeball a shade.

### Functional hues (meaning → hue → token)

| Meaning | Hue | Token (`semanticColors`) |
|---|---|---|
| Repair / Support ticket | Orange | `functional.repair` |
| Inventory alert / blocked | Red | `functional.inventoryAlert` |
| System identifiers | Gray | `functional.identifier` |
| Logistics / Tracking / info | Blue | `functional.logistics` |
| Success / Inbound / passed / **shipped** | Green | `functional.successInbound` |
| Fulfillment channel | Purple | `functional.fulfillment` |
| Queued / Pending | Yellow | `functional.queued` |
| Brand / primary accent | Navy | `text.accent`, `background.accent` |

### Status-pill triad (Tailwind aliases)

For status pills/badges, the canonical combination is **surface + text + border**
of one tone. These are wired as semantic Tailwind utilities (CSS vars curated in
`src/styles/globals.css`, values mirror `semanticColors`):

| Tone | Pill recipe | Meaning |
|---|---|---|
| Success | `bg-surface-success text-text-success border border-border-success` | passed / inbound / shipped / done |
| Warning | `bg-surface-warning text-text-warning border border-border-warning` | caution / pending-late / repair |
| Danger | `bg-surface-danger text-text-danger border border-border-danger` | failed / blocked / overdue |
| Accent | `bg-surface-accent text-text-accent border border-border-accent` | brand / selected |

> Note the doubled prefix (`text-text-success`, `bg-surface-success`) — the color
> key carries the role, matching the neutral family (`text-text-default`,
> `bg-surface-canvas`, `border-border-soft`). Prefer these over raw
> `bg-emerald-50`/`text-rose-600`; they flip with dark mode once T2 lands.

### Rule for new tone registries

A new domain status map (e.g. `lib/<domain>-status.ts`) **maps each state to a
meaning in the table above**, then to the matching tone. Do not introduce a new
hue without adding it here first. Consolidating the scattered inline `STATUS_TONE`
maps onto this story is **T1** of `docs/design-system-token-simplification.md`;
the dark-mode flip of these tones is **T2**.

## System Rules

- Prefer **rows + dividers** for ordinary collections — not nested card grids as list items.
- Named rollup zones (`SectionCard`, `KpiStrip`) and pipeline boards are first-class when data shape requires them.
- Primary separation through ghost borders and tonal shifts.
- Labels: 9px, sentence case, heavy weight (see typography presets).
- Values: 13px bold, with monospace for technical identifiers.
- **Status / identifiers:** resolve via presentation SoTs — `StatusText` / lifecycle tones / typed `CopyChip` / condition chips as appropriate. Do not invent a parallel badge system.
- Interaction micro-motion: 100–150ms; named Motion presets only (`foundations/motion-presets.ts` + reduced-motion hooks).

## Desktop ↔ Mobile Design Mapping

### Mode Detection (`providers/UIModeProvider.tsx`)

The `UIModeProvider` wraps `useDeviceMode()` and exposes a single `mode: 'desktop' | 'mobile'` value via React context. Components consume it via `useUIMode()` or the safe `useUIModeOptional()`.

Detection priority:
1. `forceMode` prop (testing / Storybook)
2. User manual override (localStorage, via `DeviceModeToggle`)
3. Hardware detection (`navigator.userAgentData.mobile` → UA string fallback)
4. Viewport width + touch input (< 768px AND coarse pointer)

### Navigation

| Desktop | Mobile |
|---------|--------|
| MasterNav push spine + `ResponsiveLayout` | `RedesignedMobileShell` (`@/components/mobile/redesign/MobileShell`) |
| Left context rail via `ContextPanelLayout` | `MobileTopBar` with title + trailing actions |
| Collapsible rails (resize + park) | `MobileSidebarDrawer` for deep navigation |

### Lists / Tables

| Desktop | Mobile |
|---------|--------|
| Full `AdminTable` with columns, sticky headers | Card/list layout: primary text + secondary metadata |
| Hover row highlight, inline actions | Tappable rows, swipe actions or overflow `...` menu |
| `DateGroupHeader` for date grouping | Same component, full-width with larger touch targets |
| Multi-column data rows | Single-column stacked layout |

### Forms

| Desktop | Mobile |
|---------|--------|
| Multi-column forms, inline validation | Single-column vertical, `mobileDensity.spacious` spacing |
| Compact inputs (h-8 to h-9) | Inputs promoted to h-11 minimum (44px touch target) |
| Tab between fields, Enter to submit | Progressive disclosure via accordion/steps |
| `FormField` horizontal layout option | `FormField` vertical-only on mobile |

### Scanning Flow

| Desktop | Mobile |
|---------|--------|
| `StationScanBar` (`@/components/station/scan-bar`): focus-locked wedge input | `ScanInput` (`@/components/mobile/redesign/ScanInput`) — the same bar plus a ZXing camera toggle |
| Auto-focused, always ready, Enter to confirm | Auto-scan or tap capture, manual entry fallback |
| Inline success/error feedback (ring + shake) | Viewfinder ring color + success checkmark / error X |
| Results appear inline below input | Results appear as cards, camera closes on success |

Tone + buzz on a scan go through `useScanFeedback()` (`src/lib/scan-feedback`):
`playScanFeedback('success' | 'warn' | 'reject')` — `warn` = landed, but look (a duplicate
serial). It reads the station-wide settings page `scan`: org master switch `scan.soundsEnabled`
plus per-staff `scan.sound` / `scan.haptics` (Settings › Your setup › Hardware). Dock presses use
`usePressHaptic()` behind the same haptics toggle. Never call `playScanTone` / `vibrateScan`
directly from a station — that skips the switches.

### Buttons & Actions

| Desktop | Mobile |
|---------|--------|
| `PrimaryButton` at standard sizes (h-8 to h-10) | Sizes promoted: sm→h-11, md→h-12, lg→h-14 (44px+ targets) |
| Label always visible | `iconOnly` option hides label (icon + aria-label) |
| Secondary actions inline | Secondary actions in overflow menu (`...`) |
| Hover states | Active/press states, `whileTap` scale feedback |

### Mobile Touch Targets

`tokens/touch.ts` is **retired**; a control owns its own hit box:

- `IconButton size="touch"` (`h-11 w-11`) — the 44px iOS-HIG tap floor, and the only
  way to spell it. Never a hand-set `h-N w-N` on the button (guard:
  `control-size-tokens.guard.test.ts`).
- `Button` promotes its own sizes on mobile via `useUIModeOptional()`.
- Safe-area insets are applied by the shell that owns the edge
  (`RedesignedMobileShell` / `MobileTopBar`), not by a shared token module.
- Spacing is the density-aware scale (`tokens/spacing.mjs`, `calc(rem × var(--cf-density))`),
  so mobile rows tighten through `data-density` rather than a parallel `mobileDensity.*` map.

### Mobile Motion Presets (`foundations/motion-presets.ts`)

Mobile-specific additions to the existing motion system:
- `motionDurationMobile.*` — sheet slides (0.32s), camera enter/exit, scan feedback, FAB, nav
- `motionTransitionMobile.*` — spring-damped sheets, camera transitions, scan success/failure
- `motionPresenceMobile.*` — sheet (y: 100%), camera (scale+opacity), FAB (scale from 0.6), scan feedback (pulse/shake)

### Mobile Icon UX Rules

- **Primary actions** = icon + optional short label
- **Bottom nav** = icon + 9px sentence-case label (always visible, per iOS HIG)
- **Secondary actions** = overflow menu (`...` icon) on mobile, inline on desktop
- **Toolbar** = max 2 trailing icon buttons (`IconButton size="touch"`)
- **Accessibility**: all icon-only buttons require `ariaLabel`; desktop adds `title` for tooltip hover

### Accessibility & Usability

**Mobile-specific:**
- All tappable elements meet 44px minimum (enforced by `mobileDensity` and `PrimaryButton` size promotion)
- Safe-area-inset handling in `RedesignedMobileShell` / `MobileTopBar`
- `prefers-reduced-motion` respected: app-wide `<MotionConfig reducedMotion="user">` (`ReducedMotionProvider`)
- Camera permission denied: graceful fallback to manual text entry in `ScanInput`

**Desktop scanning:**
- `StationScanBar` auto-focuses on mount, window refocus, and after each scan submission; the global focus hotkey is `DEFAULT_FOCUS_SCAN_HOTKEY`
- Visual confirmation: green ring pulse (success), red ring + shake (error)
- Enter key hint badge always visible

### Folder Structure

```
design-system/
├── providers/
│   ├── UIModeProvider.tsx    — React context: mode, capabilities, override
│   └── index.ts
├── foundations/
│   └── motion-presets.ts     — Extended with motionDurationMobile, motionTransitionMobile, motionPresenceMobile
├── primitives/
│   ├── Button.tsx            — Mode-aware button (auto-promotes touch targets on mobile)
│   └── IconButton.tsx        — Owns the hit box via `size`; `size="touch"` is the 44px floor
└── components/
    └── RouteShell.tsx        — Mode-aware route frame
```

The mobile app shell is **not** in the design system — it lives with its routes at
`@/components/mobile/redesign/` (`RedesignedMobileShell` · `MobileTopBar` ·
`MobileSidebarDrawer` · `ScanInput`), mounted by `src/app/m/(shell)/layout.tsx`.
Desktop framing is `ResponsiveLayout` + the MasterNav spine.

> **Retired 2026-08-07.** The `ResponsiveShell` / `desktop/` / `mobile/` shell family
> and `tokens/touch.ts` were deleted — a pre-flush-square generation superseded by the
> components above. Nothing imported them; the barrel was the only thing keeping them
> reachable. Do not reintroduce a second shell family beside the live one.

## Next Integration Step

Migrate existing components to consume new design system primitives:

1. **OrderCard / FbaItemCard / RepairCard** — replace inline `getConditionColor` helpers with `ConditionText` primitive
2. **DeskPickTable / PackerTable** — replace inline sticky date headers with `DateGroupHeader` component
3. **UpNextFilterBar** — replace inline AnimatePresence toggle with `OverlaySearch` component
4. **Sidebar form sections** — replace inline label styling with `FormField` component
5. **All expand/collapse patterns** — `<Collapse open>` / `<CollapseItem>` (`components/Collapse.tsx`); a hand-rolled `height` animation is a lint error (the `ExpandableSection` primitive was deleted 2026-07-31; the `collapseHeight` preset was retired 2026-09-27)
6. **Typography** — replace hand-rolled `text-[10px] uppercase tracking-[0.2em]` with `typographyPresets.sectionLabel` etc.

See `.design-system-rules.md` for complete auto-UX integration rules.
