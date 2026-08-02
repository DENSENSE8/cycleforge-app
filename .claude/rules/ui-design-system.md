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
  add them from the grid's top-right **column-display lip** →
  `GridColumnDetailsPanel` (generated from the descriptor, persisted per
  staff as a delta). Column display is never page chrome — see
  `display/workbench-ops-queue.md` → Trailing Display & Actions. **Never** call `useIsColumnHidden()` from a grid family —
  it is the retired cell-granularity path that left an empty ruled band instead
  of removing the track. It survives on four surfaces, pinned shrink-only by
  `use-is-column-hidden.guard.test.ts` — full list in
  [source-of-truth.md](source-of-truth.md) → Grid column visibility + sort.
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
  - **Scoped search chrome:** icon-first `ToolbarSearchToggle` (`@/design-system/primitives`) — collapsed at rest, expands on hover/focus. Never an always-open `SearchField` in the workbench header search slot **when search is a refinement of an on-screen list**.
    - **Entry-path exception (principle).** When search **is** the surface's primary entry path — not a refinement — an always-open / always-synced query field is allowed. Known cases:
      1. **`/ops/photos` (Media Library)** — always-open `SearchField` in the `WorkbenchChromeHeader` `search` slot (approved 2026-07-28). Photo-*evidence* archive whose #1 job is exact-identifier retrieval (PO / serial / claim ticket).
      2. **`/search`** — the cross-entity results surface; the context-rail `SearchBar` in `SearchSidebarPanel` is the entry field (always open + synced to `?q=`). The global header launcher is hidden on this route so the page is not dual-input. Typing here *is* the job.
      Everywhere else, search refines a list already on screen, so collapsed-at-rest correctly demotes it. Do not grow this list case-by-case without re-checking the principle.
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

## Scroll ownership — one port per region, and the HOST owns it

**A component mounted into an existing scroll host is CONTENT, never a viewport.**
Check who owns the scroll before you write `overflow-*`.

- **Do:** compose the host's port — `StationWorkbench` for station bodies,
  `DashboardScrollShell` for workbench pages, `RightRailHost`'s body for a rail occupant —
  and let the child size to its content.
- **Don't:** ship `flex-1 overflow-y-auto` inside a `space-y-*` wrapper. `flex-1` has **no
  basis** there, so the port is never height-constrained: it does not scroll, and every
  `flex-1`, `h-full`, `snap-*` and `min-h-*` on it becomes dead CSS **that still occupies
  space**. The Unbox procedure column shipped exactly this (2026-08-02) — the nested port
  rendered its height floors as empty white voids and the scroll-snap never engaged.
- **A scroll-snap surface must be verified to actually snap.** Snap on a zero-height port is
  invisible in code review and obvious at the bench. Snap belongs on the **host** port (behind
  an opt-in prop — never globally for every station), with `snap-start` on the sections.
- A nested port is legitimate only when the child has a **definite height** of its own — a
  `max-h-*`, or `flex-1 min-h-0` inside an ancestor chain that resolves to a fixed height.
  Prove it or drop the `overflow-*`.

**`rounded-*-[inherit]` on a child is not a clip.** `border-radius: inherit` copies the
parent's radius *value* onto the child's own box, so a 4px accent rail inherits a 16px card
radius and renders as a lens/notch. For an edge accent use a **border on the element itself**
(`border-l-4`), which follows that element's own corner radius natively. Do **not** reach for
`overflow-hidden` on the parent instead — that shears the focus rings off any input inside it.

## Monitor surface tokens (rollup density)

- **Card shell:** `rounded-2xl border border-border-soft bg-surface-card shadow-sm`  
  (`MONITOR_SECTION_CARD_*` in `src/design-system/components/monitor/shell.ts`).
- **KPI tile anatomy:** eyebrow label + compact `DeltaChip` (top-right) → hero number (tabular). No status footer row.
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
- **Selection never size/height-shifts.** Keep row content identical across states:
  - list / accordion selected: `QUEUE_ROW.selectedClass` (`bg-blue-50 ring-1 ring-inset ring-blue-400`)
  - airtable LedgerGrid selected: `QUEUE_ROW.selectedLedgerClass` / `ledgerRowStateClass(true)` (`bg-blue-50` fill only — inset ring fights cell rules + sticky `bg-inherit` and reads as a top/right L-glow)
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

## Type: three cuts, one face each, capped at 600

**Contextuality is width and role binding — never a fourth slot.** Three cuts, one face per cut
(`src/lib/fonts.ts`; stacks in `tokens/typography/families.ts`, mirrored in `styles/globals.css`):

| Cut | Job | How you get it |
|---|---|---|
| **Sans — Inter** | display · title · body · data · caption | the default — `text-role-*` |
| **Condensed — IBM Plex Sans Condensed** | eyebrow · micro (dense chrome) | **intrinsic** to `text-role-eyebrow` / `text-role-micro` |
| **Mono — IBM Plex Mono** | identifiers (serial · FNSKU · tracking · SKU) | `font-mono` / the `CopyChip` family |

**The sans cut moved IBM Plex Sans → Inter (2026-08-02)** for small-size legibility: this UI lives at
12–14px and Inter was drawn for screen UI at exactly that size (larger x-height, more open apertures).
It is a SWAP, not a second language — there is still one sans face and every `text-role-*` resolves
through the same stack. Condensed + mono stayed Plex because Inter ships neither, and both are
load-bearing (condensed keeps 10–11px chrome inside a grid column; mono keeps a serial retypable).
**A display / heading face on top of these three is still banned** — that is what the old
"one macro-family" rule was actually protecting.

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
- **LedgerGrid column justification is a hard SoT** — digit / date / tracking / SKU tracks
  **end**-align; word / tag / platform tracks **start**-align. Resolve via
  `resolveGridColumnAlign` (`grid-header-align.ts`); never hand-type `justify-end` on a cell.
  **Exception, ruled 2026-08-02:** an identifier that is the row's own **transaction identity**
  (PO # · sales order # · `order`) aligns **start** — it is a name you read, not a magnitude you
  compare — while a **catalog item number / SKU** stays end-aligned as a reference attribute.
  Same `type: 'id'`, different role; express it with an explicit `align: 'start'` on that
  surface's column model, never by changing `ALIGN_BY_TYPE.id`. Shipped 2026-08-02 on the Orders
  and Receiving `order` columns; `date` / `tracking` stay unadjudicated (and their spec assertions
  stay red on purpose).
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
| Staff / org identity mark | `StaffAvatar` / `IdentityMark` (`@/components/identity`) — never a page-local circle or `initials()` |
| Cross-entity search rows | `SearchHit` + `searchHitHref` |

Full waist: [source-of-truth.md](source-of-truth.md).

## Contextual info via HoverTooltip — not `title=`

- Use `HoverTooltip` (`src/components/ui/HoverTooltip.tsx`) for any label/explanation: it renders in a body portal,
  positions off-screen then clamps to the viewport, so it is never clipped by a scrolling sidebar.
- Pass `focusable={false}` when the tooltip wraps something already inside a focusable row/button.
- Status indicator = a small dot (`h-2 w-2 rounded-full {semantic color}`) wrapped in `HoverTooltip` for its label.

## Icons: structural and paired, never decorative

- Import from `@/components/Icons`. Always pair an icon with text (e.g. `<Check className="h-3.5 w-3.5"/> Resolve`),
  except the status dot — and **GlobalHeader Mode / Recents / Pins** (icon-only with `HoverTooltip`; active mode, History, or pin glyph).
- **Nav chrome law:** MasterNav L1 page rows render SoT page icons
  (lighter stroke); L2 modes (GlobalHeader Mode menu, header “now” identity, scan rails) keep glyphs
  with heavier stroke. CommandBar Pages / mobile page rows stay label-only until those surfaces
  are migrated. Stroke SoT: `nav-weight.tsx`. **Exception — GlobalHeader icon
  actions:** native SVG stroke only (`TOP_CHROME_ICON_GLYPH` in
  `header-shell.ts`); keep mode stroke ≤ 2.25 (`nav-weight.tsx`); 2.75 muddies dense glyphs.
  Cross-page MRU is the GlobalHeader Recents popover (`HeaderRecentsSwitcher`) — never spine chips.
  Quick Access **pins** are `HeaderPinsSwitcher` (hairline after Recents) — never a pin list in the avatar menu.
  **Section drills:** root shows Analytics Monitor / Scan Stations / Inbound / Catalog / Inventory /
  Fulfillment / Sales / Support (`SPINE_SECTIONS`); drill body is back + that
  section's pages. **Workflow Studio is a FOOTER PIN above Admin**, not a drill (2026-08-02).
  No `Triage Desk` / `Print Stations` grab-bag, and no scan bench inside a domain.
  Swap via `framerPresence.spineDrill` (opacity-only) — never a page-local `x` slide.
  Detail: `display/workbench.md`.
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
- **`space-y-*` is `margin-block-END` in Tailwind v4 — a per-item `margin-top` cannot cancel it.**
  v4 compiles `space-y-N` to `margin-block-end` on every child *except the last*, so the gap belongs
  to the element **above**. A layout that overrides one child's `margin-top` (an overlap, a pull-up,
  a tucked card) therefore gets the gap *plus* its override, and both the computed `margin-top` and
  the class list read exactly as intended while it is wrong. **Do:** when any item needs a different
  gap from its siblings, drop the space utility and set the margin per item. **Don't:** assume v3's
  `& > * + *` `margin-top` semantics.

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
- **Never reserve height a body has not asked for.** A `min-h-[N]` floor on a container whose
  content is dynamic renders as an empty void the moment a small body lands in it — and an
  empty box at a bench reads as *"this step is broken"*, while costing the vertical room the
  surface is spending to exist. Reserve geometry only for a **skeleton at the real geometry**
  (a known row count at a known row height), never for "presence". A fixed height on a
  genuinely fixed one-row object (a collapsed face) is not this — that height *is* its
  geometry.
