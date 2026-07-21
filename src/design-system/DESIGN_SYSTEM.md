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

### Density modes (map to spacing density tokens when building)

| Mode | When | Feel |
|---|---|---|
| `floor` | Station / mobile scan | One focus, big state, fail loud |
| `ops` | Daily pick+edit, boards, tables | Dense rows, inline actions |
| `rollup` | Analytics / goals | KPI heroes, named SectionCard zones |
| `studio` | Graph authoring | Spatial canvas; inspector secondary |

Token density presets also exist as `compact` / `standard` / `spacious` in `tokens/spacing.ts` — use them under the mode above.

### Visual principles

- Data-first hierarchy and compact scanning.
- Line-based separators over **random** card-heavy soup (named rollup cards and boards are allowed).
- Functional color cues for instant state recognition.
- Inline editing and inline actions as the default interaction model for ops surfaces.
- Typed chips / status presentation via SoTs — not ad-hoc pill invention.

## Implemented In This Folder

### Tokens

- Color base and semantic maps:
  - `tokens/colors/base.ts`
  - `tokens/colors/semantic.ts` — includes `condition` palette (used/new/parts/quantity)
- Typography:
  - `tokens/typography/families.ts`
  - `tokens/typography/sizes.ts`
  - `tokens/typography/weights.ts`
  - `tokens/typography/presets.ts` — composed Tailwind class presets (`sectionLabel`, `fieldLabel`, `dataValue`, `monoValue`, `chipText`, `cardTitle`, `tableHeader`, `tableCell`, `microBadge`)
- Density and structure:
  - `tokens/spacing.ts` — includes `density` presets (compact/standard/spacious)
  - `tokens/borders.ts`
  - `tokens/radii.ts` — graduated scale (none → sm → md → lg → xl → 2xl → 3xl → full)
  - `tokens/shadows.ts` — raw box-shadow CSS vars + elevation roles
    (`elevationClass('flat' | 'raised' | 'overlay')`; raised intensity `soft` | `default`)
- Motion:
  - `foundations/motion.ts` — CSS-oriented durations / cubic-bezier strings (`micro=100ms`, `fast=150ms`)
  - `foundations/motion-framer.ts` — Framer Motion presets used on station surfaces:
    - `motionBezier.easeOut` / `motionBezier.layout` — cubic tuples aligned with **ActiveStationOrderCard** / **Up Next OrderCard**
    - `framerDuration` — second-scale timings (now includes `tableRowMount`, `sidebarExpand`, `dropdownOpen`, `overlaySearchIn`, `chipCopyFeedback`)
    - `framerTransition` — named transitions (`stationCardMount`, `upNextRowMount`, `stationCollapse`, `upNextCollapse`, `tableRowMount`, `sidebarExpand`, `dropdownOpen`, `overlaySearchIn`, `chipCopyFeedback`, chevrons, serial rows, badges, work-order springs)
    - `framerPresence` — `initial` / `animate` / `exit` objects (now includes `tableRow`, `dropdownPanel`, `sidebarSection`); `framerVariants` for the variants API
- CSS variable generation:
  - `tokens/css-variables.ts`

### Themes (the theme registry — SoT for all theme-varying color)

- `themes/registry.ts` is the single source of truth for every theme-varying
  CSS variable (`--ds-color-*` + `--background`/`--foreground`), the
  `ThemePalette` contract, the `STAFF_ACCENTS` table, and the CSS generator
  (`themeRegistryCssText()` → injected by `app/layout.tsx` as
  `<style id="app-theme-palettes">`).
- Palettes: `themes/light.ts` (default), `themes/dark.ts`, `themes/mono.ts`
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
- `SearchField.tsx` — decoupled draft architecture, debounced, tone-colored
- `DeferredQtyInput.tsx` — number input with internal draft, clamped on blur
- `StatusText.tsx` — uppercase label with colored underline
- `ExpandableSection.tsx` — AnimatePresence height:'auto' wrapper (uses `framerPresence.sidebarSection`)
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
- **New components:**
  - `DateGroupHeader.tsx` — sticky date group header for tables with variant-based tonal backgrounds
  - `FormField.tsx` — standardized form field wrapper (label, required indicator, hint)
  - `OverlaySearch.tsx` — animated toggle between trigger element and search input
- **Re-exported from `components/ui/`:**
  - `CopyChip.tsx` — semantic chip family (TrackingChip, FnskuChip, SerialChip, OrderIdChip, TicketChip, SourceOrderChip)
  - `TabSwitch.tsx` — universal tab switcher with variant support
- Sidebar intake chrome: `sidebar-intake/` (intakeFormClasses, SidebarIntakeFormShell, SidebarIntakeFormField)

## CopyChip Semantic Rules

**Hard rule: chip variants are semantically bound to data types and must never be interchanged.**

| Chip | Color | Icon | Use for | Never use for |
|------|-------|------|---------|---------------|
| `TrackingChip` | Blue / `border-blue-500` | MapPin | Carrier shipping tracking numbers (UPS, FedEx, USPS…) | FNSKU codes, order IDs |
| `FnskuChip` | Purple / `border-purple-500` | Package | Amazon FNSKU identifiers (e.g. `X001ABC123`) | Shipping tracking numbers |
| `SerialChip` | Emerald / `border-emerald-500` | Barcode | Device / unit serial numbers | Any non-serial value |
| `OrderIdChip` | Gray / `border-gray-400` | Hash | Internal order IDs | Tracking or FNSKU |
| `TicketChip` | Orange / `border-orange-500` | Settings | Repair / support ticket IDs | Any other type |
| `SourceOrderChip` | Gray / `border-gray-400` | Hash | External platform order numbers | Tracking or FNSKU |

**FNSKU ≠ Tracking Number.** FNSKUs are Amazon product identifiers scanned at FBA intake. Tracking numbers are carrier labels attached to outbound shipments. Displaying an FNSKU inside a `TrackingChip` (blue, MapPin) or a tracking number inside an `FnskuChip` (purple, Package) is a design-system violation.

## Tab Switcher Rules

**Hard rule: all tab-like UI must use `TabSwitch` from `src/design-system/components/TabSwitch.tsx`** (barrel: `@/design-system/components`). Custom pill buttons or ad-hoc toggle rows are not permitted. Wrap the switcher in `SidebarTabSwitchChrome` when it sits in a sidebar header row.

**`variant` (the visual treatment — one sliding pill, always):**

| `variant` | Rail | Active pill | Active text | Labels | Use for |
|---|---|---|---|---|---|
| `default` | `bg-surface-sunken` sunken track | light `bg-surface-card` pill | per-tab semantic hue (`color`) | uppercase, `font-black`, tracked | most in-app tab rows |
| `solid` | light `bg-surface-card` + `border-border-default` | **dark `bg-surface-inverse` pill** | `text-text-inverse` (white) | title-case, `font-bold` | headline lifecycle switchers (Dashboard · Outbound) — high-contrast Linear-style control |
| `upNext` | tinted station rail (`bg-surface-strong`) | light pill + station outline | semantic hue | uppercase | station up-next queue |

- `countStyle`: `badge` (mini pill bubble, default) or `plain` (inline, same size as label — preferred for dense ops headers).
- `solid` labels come from the source string as-is (no CSS uppercasing) — store them title-case. All treatments are token-only (inverse surface/text, not black hex) so they flip under `data-theme` dark mode.
- Don't hand-set pill/rail colors at the call site — pick a `variant` and, if a genuinely new treatment is needed, **add a variant to the primitive** rather than forking chrome via `railClassName`.

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
| Success / Inbound / passed | Green | `functional.successInbound` |
| Fulfillment channel | Purple | `functional.fulfillment` |
| Queued / Pending | Yellow | `functional.queued` |
| Brand / primary accent | Navy | `text.accent`, `background.accent` |

### Status-pill triad (Tailwind aliases)

For status pills/badges, the canonical combination is **surface + text + border**
of one tone. These are wired as semantic Tailwind utilities (CSS vars curated in
`src/styles/globals.css`, values mirror `semanticColors`):

| Tone | Pill recipe | Meaning |
|---|---|---|
| Success | `bg-surface-success text-text-success border border-border-success` | passed / inbound / done |
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
- Labels: 9px, uppercase, heavy weight, tracked (see typography presets).
- Values: 13px bold, with monospace for technical identifiers.
- **Status / identifiers:** resolve via presentation SoTs — `StatusText` / lifecycle tones / typed `CopyChip` / condition chips as appropriate. Do not invent a parallel badge system.
- Interaction micro-motion: 100–150ms; named Framer presets only (`foundations/motion-framer.ts` + reduced-motion hooks).

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
| Left sidebar (360px) with labels, sections, back nav | Bottom `MobileNavBar` with 3–5 icon tabs + active dot |
| `DesktopShell` with sidebar + main content | `MobileShell` with toolbar + scrollable content + bottom nav |
| Collapsible sidebar (details panel override) | `MobileToolbar` (48px) with title + 1–2 trailing actions |
| Section headers within sidebar | Slide-in drawer for deep navigation (future) |

### Lists / Tables

| Desktop | Mobile |
|---------|--------|
| Full `DataTable` with columns, sticky headers | Card/list layout: primary text + secondary metadata |
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
| `ScanInputDesktop`: hidden input listening for scanner keystrokes | `ScanCameraMobile`: fullscreen camera viewfinder |
| Auto-focused, always ready, Enter to confirm | Auto-scan or tap capture, manual entry fallback |
| Inline success/error feedback (ring + shake) | Viewfinder ring color + success checkmark / error X |
| Results appear inline below input | Results appear as cards, camera closes on success |

### Buttons & Actions

| Desktop | Mobile |
|---------|--------|
| `PrimaryButton` at standard sizes (h-8 to h-10) | Sizes promoted: sm→h-11, md→h-12, lg→h-14 (44px+ targets) |
| Label always visible | `iconOnly` option hides label (icon + aria-label) |
| Secondary actions inline | Secondary actions in overflow menu (`...`) |
| Hover states | Active/press states, `whileTap` scale feedback |

### Mobile Touch Tokens (`tokens/touch.ts`)

- `touchTarget.min: 44px` — absolute minimum tappable area (iOS HIG)
- `touchTarget.comfortable: 48px` — standard action buttons
- `touchTarget.large: 56px` — FABs, primary CTAs
- `safeArea.*` — `env(safe-area-inset-*)` for notch/home-bar devices
- `mobileDensity.*` — promoted px/py/gap/minH for mobile rows
- `mobileIconSize.*` — consistent icon sizing (nav: 24px, toolbar: 20px, fab: 24px)
- `bottomNav.height: 56px` — bottom navigation height
- `fab.size: 56px` — floating action button diameter

### Mobile Motion Presets (`foundations/motion-framer.ts`)

Mobile-specific additions to the existing motion system:
- `framerDurationMobile.*` — sheet slides (0.32s), camera enter/exit, scan feedback, FAB, nav
- `framerTransitionMobile.*` — spring-damped sheets, camera transitions, scan success/failure
- `framerPresenceMobile.*` — sheet (y: 100%), camera (scale+opacity), FAB (scale from 0.6), scan feedback (pulse/shake)

### Mobile Icon UX Rules

- **Primary actions** = icon + optional short label (`MobileActionButton` extended FAB)
- **Bottom nav** = icon + 9px uppercase label (always visible, per iOS HIG)
- **Secondary actions** = overflow menu (`...` icon) on mobile, inline on desktop
- **Toolbar** = max 2 trailing icon buttons (44px touch targets)
- **Accessibility**: all icon-only buttons require `ariaLabel`; desktop adds `title` for tooltip hover

### Accessibility & Usability

**Mobile-specific:**
- All tappable elements meet 44px minimum (enforced by `mobileDensity` and `PrimaryButton` size promotion)
- Safe-area-inset handling in `MobileShell`, `MobileNavBar`, `ScanCameraMobile`
- `prefers-reduced-motion` respected: `UIModeProvider.prefersReducedMotion` flag
- Camera permission denied: graceful fallback to manual text entry in `ScanCameraMobile`

**Desktop scanning:**
- `ScanInputDesktop` auto-focuses on mount, window refocus, and after each scan submission
- Visual confirmation: green ring pulse (success), red ring + shake (error)
- Enter key hint badge always visible

### Folder Structure

```
design-system/
├── providers/
│   ├── UIModeProvider.tsx    — React context: mode, capabilities, override
│   └── index.ts
├── tokens/
│   └── touch.ts              — Touch targets, safe areas, mobile density, icon sizes
├── foundations/
│   └── motion-framer.ts      — Extended with framerDurationMobile, framerTransitionMobile, framerPresenceMobile
├── primitives/
│   └── PrimaryButton.tsx     — Mode-aware button (auto-promotes touch targets on mobile)
├── components/
│   ├── ResponsiveShell.tsx   — Auto-selects DesktopShell or MobileShell
│   ├── desktop/
│   │   ├── DesktopShell.tsx  — Sidebar + main content frame
│   │   └── ScanInputDesktop.tsx — Keyboard/scanner barcode input
│   └── mobile/
│       ├── MobileShell.tsx       — Toolbar + content + bottom dock + nav
│       ├── MobileNavBar.tsx      — Bottom tab navigation
│       ├── MobileActionButton.tsx — Floating action button (FAB)
│       ├── MobileToolbar.tsx     — Top app bar
│       └── ScanCameraMobile.tsx  — Fullscreen camera scanner
```

## Next Integration Step

Migrate existing components to consume new design system primitives:

1. **OrderCard / FbaItemCard / RepairCard** — replace inline `getConditionColor` helpers with `ConditionText` primitive
2. **TechTable / PackerTable / DashboardShippedTable** — replace inline sticky date headers with `DateGroupHeader` component
3. **UpNextFilterBar** — replace inline AnimatePresence toggle with `OverlaySearch` component
4. **Sidebar form sections** — replace inline label styling with `FormField` component
5. **All expand/collapse patterns** — replace inline AnimatePresence+motion.div with `ExpandableSection` primitive
6. **Typography** — replace hand-rolled `text-[10px] font-black uppercase tracking-[0.2em]` with `typographyPresets.sectionLabel` etc.

See `.design-system-rules.md` for complete auto-UX integration rules.
