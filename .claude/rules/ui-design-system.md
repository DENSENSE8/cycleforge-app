# UI / design-system conventions

House identity is **Kinetic Ledger** — data-first reseller ops: dense, state-colored, scan-aware, multi-tenant.
**Legible throughput** over document calm. Calm chrome (Linear discipline), not document-IA as the product shape.

Always-on constitution: root **`AGENTS.md` → Kinetic Ledger**.  
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
- **Hand-rolled `<table>` / tab band / row markup** for a tabular ops surface. **Do:** compose the golden
  page recipe — `DashboardScrollShell` + `WORKBENCH_CHROME_COLUMN`/`WORKBENCH_BODY_COLUMN` +
  `WorkbenchChromeHeader` (tabs) + `KpiTile` + `DateGroupHeader`/`groupRowsBy` day bands + `RowTitle` /
  `RowMetaColumns` / `ChipColumns` / `LedgerValue`. Golden page: `DashboardOrdersView.tsx`.
  *Extending an existing hand-rolled table is not "matching siblings" — it is growing a fork. Migrate the
  region to the recipe instead, and resolve every per-kind label/hue through a registry
  (`workflow-stages.ts`-style), never a map inlined in the view.*
- **Hand-rolling the card shell** — never re-type `rounded-2xl border border-border-soft
  bg-surface-card shadow-sm`. Compose **`Panel`** (generic static surface — its default *is* that
  shell; props: `padding`/`radius`/`elevation`/`borderless`), **`SectionCard`** (`@/design-system/
  components/monitor` — Monitor rollup zones), or **`CardShell`** (selectable/animated list rows).
  Guard: `surface-box-tokens.guard.test.ts` (`npm run test:surface-box-guard`) ratchets hand-rolled
  shells down; a true one-off carries a same-line `ds-allow-box` comment.

### Allow by surface

- **Station (`floor`):** scan bar + single active-entity card; fact stacks and `divide-y` rows *inside* the card. No browse grids competing with scan focus.
- **Workbench (`ops`):** primary = list **or** table **or** board **or** master–detail (data shape decides). Fact stacks for record bodies. Scroll region `flex-1 overflow-y-auto`; sticky chrome with `border-t`/`border-b` as needed.
- **Monitor (`rollup`):** vertical scroll shell + **named rollup zones** may use responsive CSS grid (`KpiStrip`, tri-panel of `SectionCard`s). Compose `@/design-system/components/monitor` — see [display/monitor-rollup-blocks.md](display/monitor-rollup-blocks.md).
- **Canvas (`studio`):** spatial graph layout; inspector is secondary detail, not a second graph.

Field group = label above, value below:

```tsx
<div className="space-y-1">
  <p className="text-[10px] font-black uppercase">…</p>
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
  - Title: `truncate text-caption font-bold text-gray-900`.
  - Meta: `truncate text-eyebrow font-semibold uppercase tracking-widest text-gray-500`.
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

- Section/rail header = an eyebrow: `text-eyebrow font-black uppercase tracking-widest text-gray-500`, optional
  right action slot. Use `leading-none` on suffixes so they don't inflate row height.
- Action buttons in a header bleed their hit-box with negative margin (`-my-0.5` / `-my-1.5`), they don't grow the row.
- Chip/badge = 3 layers: `rounded {bg-x-50} {text-x-700} ring-1 ring-inset {ring-x-200} px-1.5 py-0.5
  text-[8.5px|9px|10px] font-black uppercase tracking-widest`. Pills (`rounded-full`) drop vertical padding to keep row height.
- **Typed identifiers** use the semantic `CopyChip` family — never interchange chip variants (see `DESIGN_SYSTEM.md`).

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
  except the status dot — and **MasterNav MRU jump chips** (icon-only with `HoverTooltip`; mode or page SoT glyph).
- **Nav chrome law:** MasterNav L1 page rows (and modeless MRU jumps) render SoT page icons
  (lighter stroke); L2 modes (dropdown, hover, header “now”, mode MRU, scan rails) keep glyphs
  with heavier stroke. CommandBar Pages / mobile page rows stay label-only until those surfaces
  are migrated. Stroke SoT: `nav-weight.tsx`.
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
