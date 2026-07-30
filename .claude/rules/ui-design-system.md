# UI / design-system conventions

House identity is **Kinetic Ledger** — data-first reseller ops: dense, state-colored, scan-aware, multi-tenant.
**Legible throughput** over document calm. Calm chrome (Linear discipline), not document-IA as the product shape.

House identity: [kinetic-ledger.md](kinetic-ledger.md).  
Region contracts + data→surface: [contextual-display.md](contextual-display.md).  
Token inventory: `src/design-system/DESIGN_SYSTEM.md`.

These conventions recur across rails, triage panels, inspectors, boards, tables, and modals. Reuse them — don't reinvent presentation per feature.

## Reasoning order (every UI region)

1. **Region contract** — Station / Workbench / Monitor / Canvas (I/O + persistence only).
2. **Data shape → primary surface** — card | list | table | board | timeline | KPI zones | canvas.
3. **Density** — `floor` | `ops` | `rollup` | `studio`.
4. **Presentation kinds** — resolve facts via SoTs; views stay dumb.
5. **Compose / grow** named shells — never page-local twins of the same job.

## Density modes

| Mode | When | Layout feel |
|---|---|---|
| `floor` | Station / mobile scan | One focus surface; big pass/fail; minimal chrome |
| `ops` | Daily pick+edit, boards, tables | Dense rows; dividers; inline actions |
| `rollup` | Analytics / goals | More air; KPI heroes; named SectionCard zones (grid OK) |
| `studio` | Graph authoring | Spatial canvas; inspector secondary |

Spacing is density-aware by construction — see **Spacing from the density-aware scale** below.

## Compose rails; never rebuild rail infrastructure

When the job is **mode-scoped pick+edit** with a sidebar navigator:

- `SidebarRailShell<TRow>` (`src/components/sidebar/SidebarRailShell.tsx`) owns everything infrastructural:
  fetch + `queryKey`, optimistic `updateEvent`/`deleteEvent`/`deleteGroupEvent` listeners, selection, pinning,
  `topCount` vs `limit`, collapse-grouping, `visibleIndices` keyboard nav, chevron `navigateEvent`, stagger reveal.
- A thin domain wrapper supplies only the renderers. `RecentActivityRailBase`
  (`src/components/sidebar/receiving/RecentActivityRailBase.tsx`) is the reference: it passes `renderRowMain`,
  `renderPopover`, `getStatusDot`, `getStatusDotLabel`. All 5 receiving/testing rails wrap it with minimal per-rail logic.
- New rail → wrap `RecentActivityRailBase`/`SidebarRailShell`, don't fork a new list component.

Rails are a **recipe** for workbench pickers — not proof that every Workbench must be dual-pane.

## Layout: data- and density-scoped (not “no grids forever”)

### Always ban

- **Random card soup** — decorative grids of nested cards for ordinary collections.
- **Nested cards-as-rows** — e.g. `SectionCard` inside a list of `SectionCard`s.
- **Second visual language** beside Kinetic Ledger tokens.
- **Hand-rolled `<table>` / tab band / row markup** for a tabular ops surface. **Do:** compose the
  Workbench spreadsheet SoT — `LedgerGrid` (+ `VirtualGroupedSections`, optional `gridSkin="airtable"`)
  from `@/design-system/components/grid`, with a **domain thin composer** for cells/columns (golden:
  Pending via `OrdersGridView`). Page chrome still uses `DashboardScrollShell` +
  `WORKBENCH_CHROME_COLUMN`/`WORKBENCH_BODY_COLUMN` + `WorkbenchChromeHeader` + `KpiTile` where needed;
  day bands via `LedgerGrid` `showDayHeaders` / `DateGroupHeader`, multi-line folds via
  `CollapsibleGroupRow` + `groupRowsBy` (not Maximize2 — that opens the detail pane). HTML
  `DataTable`, boards, pickers, and rails stay sibling surfaces. *Extending a hand-rolled queue
  shell is growing a fork — migrate onto `LedgerGrid` instead.*
  **Grid state math** (column defs / sort / visibility / order) goes through the headless waist —
  `useGridSurface` + `GridSurfaceDescriptor` / `buildLedgerColumnDefs` (TanStack Table v8, state
  ONLY; station recipe: `LedgerGridSurface`). Never mount a foreign UI grid (AG Grid / MUI /
  Glide), never hand-roll a second sort-toggle state machine, never give TanStack widths/markup/
  grouping (grouping = ask-first, plan Phase E). Shared row VALUE cells: `@/components/ui/grid-cells`.
  Keep `"use no memo"` on `useGridSurface` (React Compiler freeze trap).
  **Column visibility** resolves in exactly ONE place — `useGridColumnVisibility`
  (descriptor `tier` + staff delta + viewport force-hide → the visible track
  list, which the header, rows, summaries and the grid template all consume).
  Grids open **lean**: mark secondary columns `tier: 'optional'` and let staff
  add them from `GridFieldsMenu` (generated from the descriptor, persisted per
  staff as a delta). **Never** call `useIsColumnHidden()` from a grid family —
  it is the retired cell-granularity path that left an empty ruled band instead
  of removing the track; it survives only for `ChipColumns`/`RowMetaColumns`.
  **Column sort** is URL-durable via `useUrlColumnSort` (`?colsort=`/`?coldir=`,
  never `?sort=` on station routes — that is server ordering).
- **Hand-rolling the card shell** — never re-type `rounded-2xl border border-border-soft
  bg-surface-card shadow-sm`. Compose **`Panel`** (generic static surface — its default *is* that
  shell; props: `padding`/`radius`/`elevation`/`borderless`), **`SectionCard`** (`@/design-system/
  components/monitor` — Monitor rollup zones), or **`CardShell`** (selectable/animated list rows).
  **Ops tables / spreadsheets** compose `TABLE_SURFACE_*` from `tokens/table-surface.ts`
  (rounded-xl + raised + sunken frozen header). Guard: `surface-box-tokens.guard.test.ts` (`npm run test:surface-box-guard`)
  ratchets hand-rolled shells down; a true one-off carries a same-line `ds-allow-box` comment.

### Allow by surface

- **Station (`floor`):** scan bar + single active-entity card; fact stacks and `divide-y` rows *inside* the card. No browse grids competing with scan focus.
- **Workbench (`ops`):** primary = list **or** table **or** board **or** master–detail (data shape decides). Fact stacks for record bodies. Scroll region `flex-1 overflow-y-auto`; sticky chrome with `border-t`/`border-b` as needed.
  - **Scoped search chrome:** icon-first `ToolbarSearchToggle` (`@/design-system/primitives`) — collapsed at rest, expands on hover/focus. Never an always-open `SearchField` in the workbench header search slot.
    - **Sanctioned exception — `/ops/photos` (Media Library), approved 2026-07-28.** The one surface
      that mounts an always-open `SearchField` in the `WorkbenchChromeHeader` `search` slot.
      **Why:** it is a photo-*evidence* archive whose primary job is exact-identifier retrieval
      (pull the unboxing shots for a PO / serial / claim ticket to settle a damage or carrier
      dispute). Everywhere else search *refines a list already on screen*, so collapsed-at-rest
      correctly demotes it; here search **is** the entry path, and click-to-expand puts a gesture in
      front of the surface's main job. **Scope:** this surface only — it does not license an
      always-open field in any other chrome header. Adding a second exception is Ask-first; if a
      third appears, the rule itself is wrong and should be re-cut around "is search the entry path
      or a refinement?" rather than grown case by case.
  - **Display sort chrome:** quiet trailing dropdown (current value + caret), **left of Import** when present — never a solid `TabSwitch` beside search. SoT: `QueueSortSwitch` / Labels trailing sort. Rule: `.cursor/rules/workbench-sort-chrome.mdc`.
- **Monitor (`rollup`):** vertical scroll shell + **named rollup zones** may use responsive CSS grid (`KpiStrip`, tri-panel of `SectionCard`s). Compose `@/design-system/components/monitor` — see [display/monitor-rollup-blocks.md](display/monitor-rollup-blocks.md).
- **Canvas (`studio`):** spatial graph layout; inspector is secondary detail, not a second graph.

Field group = label above, value below:

```tsx
<div className="space-y-1">
  <p className="text-role-micro uppercase">…</p>
  {value}
</div>
```

## Monitor surface tokens (rollup density)

- **Card shell:** `rounded-2xl border border-border-soft bg-surface-card shadow-sm`  
  (`MONITOR_SECTION_CARD_*` in `src/design-system/components/monitor/shell.ts`).
- **KPI tile anatomy:** eyebrow label → hero number (tabular) → `DeltaChip` (not nested cards).
- **List rows inside cards:** house one-row anatomy + `divide-y` (`MonitorListBlock` / `MonitorListRow`) — never nested
  `SectionCard`s as rows.
- **Theme-driven dark:** use `bg-surface-canvas` / `bg-surface-card` / `text-text-*` so `data-theme` +
  `src/design-system/themes/*` restyle the Monitor. No page-local dark hex.

## One row anatomy

- Left-aligned, content order: **title → meta → chips(right)**. Do not center or `flex-1`-stretch row content.
  - Title: `truncate text-role-caption font-semibold text-text-default`.
  - Meta: `truncate text-role-eyebrow uppercase tracking-widest text-text-soft` (the role bakes 600 + condensed).
  - Title vs meta separate by **color and case**, not by weight — both sit at 600 (see the weight cap below).
- **Queue/station left edge** (`QUEUE_ROW` in `src/components/ui/queue-row-chrome.ts` + `META_COL` in `RowMetaColumns.tsx`):
  - Stack: `QUEUE_ROW.px` → optional select gutter (`QUEUE_ROW.selectGutter`) → `META_COL` dot track → title.
  - Meta indent via `metaIndentFor(track, selectMode)` — never hand-rolled `calc` or page-local `px-4`.
  - Wide track (`indentWide` / `dotTrackWide`) only for received/expected qty surfaces (Receiving).
  - `CollapsibleGroupRow` nest children: no extra horizontal padding when `showChevron={false}`
    (`queueGroupNestClass`); nest cue is border + wash only.
- **Selection is background + ring only, never a size/height shift.** Keep row content identical across states:
  - selected: `QUEUE_ROW.selectedClass` (`bg-blue-50 ring-1 ring-inset ring-blue-400`)
  - focused (no click): `bg-gray-50 ring-1 ring-inset ring-gray-200`
  - default: `hover:bg-gray-50`; constant `py-1.5`.

## Eyebrow headers + chips (micro-typography scale)

- Section/rail header = an eyebrow: `text-role-eyebrow uppercase tracking-widest text-text-soft`, optional
  right action slot. Use `leading-none` on suffixes so they don't inflate row height. **Don't add a weight class** —
  `role-eyebrow` bakes 600 and the condensed cut.
- Action buttons in a header bleed their hit-box with negative margin (`-my-0.5` / `-my-1.5`), they don't grow the row.
- Chip/badge = 3 layers: `rounded {bg-x-50} {text-x-700} ring-1 ring-inset {ring-x-200} inset-chip
  text-role-micro uppercase tracking-widest`. Pills (`rounded-full`) drop vertical padding to keep row height.
- **Typed identifiers** use the semantic `CopyChip` family — never interchange chip variants (see `DESIGN_SYSTEM.md`).

## Type: one family, three cuts, capped at 600

**Contextuality is width and role binding — never a second face.** IBM Plex is the whole system
(`src/lib/fonts.ts`; stacks in `tokens/typography/families.ts`, mirrored in `styles/globals.css`):

| Cut | Job | How you get it |
|---|---|---|
| **Sans** | display · title · body · data · caption | the default — `text-role-*` |
| **Sans Condensed** | eyebrow · micro (dense chrome) | **intrinsic** to `text-role-eyebrow` / `text-role-micro` |
| **Mono** | identifiers (serial · FNSKU · tracking · SKU) | `font-mono` / the `CopyChip` family |

- **Pick a ROLE, not a family.** `text-role-eyebrow`/`-micro` bind the condensed cut themselves
  (tailwind.config.ts CF Type plugin), so a 10–11px label stays legible without wrapping a grid column.
  Writing `font-condensed` by hand to narrow arbitrary text is the fork — it drifts the moment someone
  forgets it. `families.ts` deliberately has no `heading`/`display`/`label` slot.
- **600 is the ceiling.** `font-bold`/`font-extrabold`/`font-black` are banned: at 10–14px on a 1080p
  warehouse monitor 700+ bleeds counters shut, and `next/font` no longer loads a 700 cut, so a stray
  `font-bold` renders as synthesized faux-bold. **Do:** `font-semibold`, or *no weight class at all*
  when the role already bakes 600 (display · title · eyebrow · micro).
- **Emphasis comes from contrast and tracking, not ink.** Need a title to out-rank its meta? Move the
  meta to `text-text-soft` / uppercase-tracked, don't add weight.
- **Numerals align by default** — `role-display`/`-title`/`-data` bind `tabular-nums` intrinsically; a
  surface that genuinely wants proportional figures opts out with `proportional-nums`. Mono never
  ligates (`fi`/`fl` in a serial would render a string the operator can't retype).
- **LedgerGrid column justification is a hard SoT** — digit / order-ID / date / tracking tracks
  **end**-align; word / tag / platform tracks **start**-align. Resolve via
  `resolveGridColumnAlign` (`grid-header-align.ts`); never hand-type `justify-end` on a cell.
  Full table: [source-of-truth.md](source-of-truth.md) → Grid column justification.
- Guard: `typography-tokens.guard.test.ts` (raw px, retired tokens, the weight cap, the family
  bindings). Genuine one-off: same-line `ds-allow-weight`. Codemod: `scripts/codemods/cap-font-weight.mjs`.

## Presentation kinds (data drives UI)

Views assemble **resolved** facts. Do not invent maps in components:

| Facet | Resolve via |
|---|---|
| Civil day / instant | `src/utils/date.ts` |
| Condition grade | `conditionLabel` / `condition-tone` |
| Source platform | `src/lib/source-platform.ts` |
| Lifecycle / status dots | lifecycle tone registries / `workflowStageDot` |
| Identifiers (serial, FNSKU, tracking, …) | typed `CopyChip` variants |
| Capabilities / providers | `capabilityNoun` / runtime provider label |
| Cross-entity search rows | `SearchHit` + `searchHitHref` |

Full waist: [source-of-truth.md](source-of-truth.md).

## Contextual info via HoverTooltip — not `title=`

- Use `HoverTooltip` (`src/components/ui/HoverTooltip.tsx`) for any label/explanation: it renders in a body portal,
  positions off-screen then clamps to the viewport, so it is never clipped by a scrolling sidebar.
- Pass `focusable={false}` when the tooltip wraps something already inside a focusable row/button.
- Status indicator = a small dot (`h-2 w-2 rounded-full {semantic color}`) wrapped in `HoverTooltip` for its label.

## Icons: structural and paired, never decorative

- Import from `@/components/Icons`. Always pair an icon with text (e.g. `<Check className="h-3.5 w-3.5"/> Resolve`),
  except the status dot — and **GlobalHeader Mode / Recents** (icon-only with `HoverTooltip`; active mode or History glyph).
- **Nav chrome law:** MasterNav L1 page rows render SoT page icons
  (lighter stroke); L2 modes (GlobalHeader Mode menu, header “now” identity, scan rails) keep glyphs
  with heavier stroke. CommandBar Pages / mobile page rows stay label-only until those surfaces
  are migrated. Stroke SoT: `nav-weight.tsx`. **Exception — GlobalHeader icon
  actions:** native SVG stroke only (`TOP_CHROME_ICON_GLYPH` in
  `header-shell.ts`); keep mode stroke ≤ 2.25 (`nav-weight.tsx`); 2.75 muddies dense glyphs.
  Cross-page MRU is the GlobalHeader Recents popover (`HeaderRecentsSwitcher`) — never spine chips.
- Size by context: row dot `h-2 w-2` · field/inline `h-3.5 w-3.5` · button/loader `h-4 w-4` (`Loader2 animate-spin`).
- **Icon buttons own their box via `IconButton size`** (`xs` 24 · `sm` 28 · `md` 32 · `lg` 36 · `touch` 44px —
  `src/design-system/primitives/IconButton.tsx`), never a hand-set `h-N w-N` on the button. Omit `size` only for a
  bare glyph-button where the glyph is the whole hit target. The 44px mobile tap floor is `size="touch"` (the old
  `tokens/touch.ts`, retired). Guard: `control-size-tokens.guard.test.ts` (`npm run test:control-size-guard`),
  ratcheting the hand-set-box call sites down; genuinely bespoke geometry carries `ds-allow-control-size`.

## Color only from semantic tokens

- Source: `src/design-system/tokens/colors/semantic.ts` (+ CSS vars in `src/styles/globals.css`). No hardcoded hex,
  no arbitrary Tailwind shades. (Existing hardcoded colors, e.g. in `KpiDetailsModal`, are tech debt — don't copy them.)
- Status dots/tones derive from the lifecycle registry (`workflowStageDot(status)`), not ad-hoc choices.
- Pick `gray-` **or** `slate-` per feature and stay consistent (studio panels use `slate-`).
- Functional hue story (repair orange, logistics blue, …): `DESIGN_SYSTEM.md`.

## Spacing from the density-aware scale

- The numeric spacing scale (`p-3`, `gap-2`, …) is **density-aware**: values live in
  `src/design-system/tokens/spacing.mjs` (`theme.extend.spacing`), each `calc(rem × var(--cf-density, 1))`,
  so padding/gap tighten with `data-density` exactly like the `role-*` type scale.
- Recurring padding jobs use a **Tier-2 intent**, never another hand-picked `px-N py-M` pair:
  `inset-chip` (badge) · `inset-field` (control / header band) · `inset-cozy` (compact row) ·
  `inset-card` (card body) · `inset-empty` (dashed empty/error box) · `stack-tight/row/section`
  (column rhythm) · `row-gap/tight` (inline groups) — or compose the `Stack`/`Inset`/`Row` primitives.
- **An intent is the whole padding story for its element** — never stack a raw `p-*`/`px-*` on top:
  both survive `cn()` and the intent wins in CSS order.
- **Never** hardcode arbitrary-px spacing (`p-[6px]`-style). Guard: `spacing-tokens.guard.test.ts`
  (`npm run test:spacing-guard`); genuine safe-area / fixed-overlay geometry carries a same-line
  `ds-allow-spacing` comment. Pair→intent codemod: `scripts/codemods/spacing-intents.mjs`.

## Focus affordance from the SoT

- Focus styling comes from **`focusRing(archetype, tone)`** (`src/design-system/tokens/focus-ring.ts`),
  composed via `cn()` — never a hand-rolled `focus:ring-*` recipe. It collapses the ~670 drifted
  recipes to one canonical form per archetype × semantic tone.
- Three archetypes by how the element takes focus: **`field`** (`:focus`, the input itself — ring +
  border shift) · **`control`** (`:focus-visible`, a button — ring + offset, so a mouse click never
  flashes it) · **`wrapper`** (`:focus-within`, a frame around a child input — border shift).
- Tones are **semantic** (`accent` default · `danger` · `warning` · `success` · `neutral`), not raw
  shades; ring opacity is canonical per archetype (field /20, control /40). `Button`/`IconButton`
  consume `focusRing('control', 'accent')`; new inputs use `focusRing('field', …)`.
- Guard: `control` sibling `focus-ring-tokens.guard.test.ts` (`npm run test:focus-ring-guard`) ratchets
  raw `focus:ring-*` down; a genuine one-off carries a same-line `ds-allow-focus` comment.

## Async / empty / error states

- Loading = spinner + text: `<Loader2 className="h-4 w-4 animate-spin" /> Loading…`.
- Error/empty = dashed bordered box, centered: `rounded-xl border border-dashed {border-rose-200|border-gray-200}
  {bg-rose-50|bg-gray-50} px-4 py-6 text-center`.
- Teach and degrade: failing sub-resources render empty; they never 500 the whole record.
