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
- **Soft radius / horizontal pill bands on ops chrome** — a new `HorizontalButtonSlider`, a soft
  `TabSwitch` pill band, or any `rounded-lg`/`xl`/`2xl`/`full` CTA / tab / select on a workbench or
  station surface. Ops chrome is flush-square (`cornerClass('flush')`): compose `TabDisplay` for tab
  bands and `DenseComposeFields` / `SearchableSelectField appearance="flush"` for compose fields.
  `TabSwitch` / `HorizontalButtonSlider` are legacy — migrate, never add a new one.
- **Hand-rolled `<table>` / tab band / row markup** for a tabular ops surface. **Do:** compose the
  Workbench spreadsheet SoT — `LedgerGrid` (+ `VirtualGroupedSections`, optional `gridSkin="airtable"`)
  from `@/design-system/components/grid`, with a **domain thin composer** for cells/columns (golden:
  Pending via `OrdersGridHost`). **Airtable structural noise (1B):** BOTTOM row hairlines only —
  no vertical column rules; data contrast outranks structure. Page chrome still uses `DashboardScrollShell` +
  `WORKBENCH_CHROME_COLUMN`/`WORKBENCH_BODY_COLUMN` + `WorkbenchChromeHeader` + `KpiTile` where needed;
  day bands via `LedgerGrid` `showDayHeaders` / `DateGroupHeader`. **Sheet list
  bodies are flat leaves** — `groupRowsBy` may still order multi-line groups, but
  in-grid PO·order summary headers are **not** the list display; parent rollups
  belong on `LedgerDrillHost` / `LedgerDrillParentMap` (List|Drill). Maximize2
  opens the detail pane, not a fold. HTML
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
  - **Scoped search chrome:** always-open `TechRailSearchBar` `variant="chrome"` (`@/components/sidebar/tech/TechRailSearchBar`) — same primitive as MasterNav / station-rail footers (`variant="rail"`). Leading Search glyph **inside** the field + **hover-reveal paste** (leftmost trailing control). Field-density filters seat in `trailingSuffix` (after paste); context-panel rail footers auto-seat `RailFilterCollapseButton` in the age column. The retired icon-first `ToolbarSearchToggle` is deleted.
    - **Entry-path surfaces** may still mount a bare always-open `SearchField` / `SearchBar` when search **is** the job (not a list refinement):
      1. **`/ops/photos` (Media Library)** — always-open `SearchField` in the `WorkbenchChromeHeader` `search` slot (approved 2026-07-28). Photo-*evidence* archive whose #1 job is exact-identifier retrieval (PO / serial / claim ticket).
      2. **`/search`** — cross-entity find; **`GlobalHeaderSearch`** is the sole
         entry field (synced to `?q=`). Typing / resolving here *is* the job —
         the header `SearchPendingBar` is the **only** pending chrome while
         resolve/retrieve runs. The body must not invent “Opening…” / idle-teach
         placeholders — with no `?q=` the body is **blank** (Amazon-like; the
         auto-focused header field is the search surface), and it never paints a
         “Search everything” empty state. Multi-hit browse is full-bleed
         `SearchBrowseShell` under the header (no locked-width stage field, no
         context rail).
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

**The definite-height contract, spelled out (ruled 2026-08-04 —
`docs/todo/station-multi-section-scroll-host-RULING.md`):**

```css
/* Outer host: rigidly constrained, never auto */
.host { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* The one active immersive floor */
.floor-active { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
```

`min-height: 0` on **both** levels is load-bearing — flex's default `min-height: auto` makes a
child refuse to shrink below its content size, so without it the container inflates to fit
content instead of triggering `overflow`. This is the same failure shape as the `space-y-*` +
`flex-1` void above, one level deeper. If the floor hosts `layout`-animated content (a Motion
`motion.div layout`/`layoutId` descendant — e.g. `ProcedureDeck`), the element carrying
`overflow-y-auto` must also carry Motion's `layoutScroll` prop, or Motion silently mismeasures
that ancestor's scroll offset when computing layout-projection math
(`docs/todo/station-multi-section-scroll-host-MOTION-FINDINGS.md` §1.4 — this is *already* a
live, independent bug on `StationWorkbench`'s existing single port).

**Two immersive ports never coexist.** When a host grants one section the floor, the **outer**
scroller must go `overflow-hidden` for the duration — never leave two active scrollports on the
same axis. An operator cannot know which one their wheel is about to move, and `overscroll-behavior:
contain` is not a substitute for disabling the outer port outright (Slack / Discord thread-panel
precedent: scroll chaining to the parent view is deliberately cut, not merely contained).

**Do not lean on `scroll-padding-bottom` to keep a target clear of an absolute-positioned
sibling (a floating dock, a fixed composer).** The pairing has open, unresolved Chromium bugs —
[issue 40055750](https://issues.chromium.org/issues/40055750) and
[issue 365913982](https://issues.chromium.org/issues/365913982) both report `scroll-padding`
corrupting what `Element.scrollIntoView()` considers "in view," and a
[Playwright report](https://github.com/microsoft/playwright/issues/3105) documents
`scrollIntoView` failing specifically when the target sits under a sticky/covering element — close
to this exact shape. **Use a physical trailing spacer element instead**: a zero-content sentinel
node sized to the clearance rem, appended after the last scrollable child. It makes `scrollHeight`
honestly larger, so a plain `scrollIntoView({ block: 'end' })` on the real target clears the
overlay without depending on the browser's scroll-padding viewport-rect math at all. `sticky` is
**not** the right tool for "keep the last card above the dock" either — a sticky element is
constrained to its own containing block's bounds, so once the block ends, so does the stick; let
`padding-bottom` (or the spacer) plus `justify-content: flex-end` hold the resting position
instead.

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
- **Ops activity feeds** (station recent rails · GlobalHeader inbox) compose the compact
  activity face — `CompactActivityRow` + `RailRowBody`: status **dot** · title · **one** fact
  (qty / state) · short age (`formatLaneAgeCompact` → `4h`). Never a chat-notification twin
  (large kind glyph · `4 hrs ago` · chip/pill parade). Distinct from `StackedRowIdentity`
  (title → typed `CopyChip` keys). Detail + guard: `source-of-truth.md` → Compact activity row.
- **Queue/station left edge — list & accordion rows only** (`QUEUE_ROW` in
  `src/components/ui/queue-row-chrome.ts` + `META_COL` in `RowMetaColumns.tsx`):
  - Stack: `QUEUE_ROW.px` → optional select gutter (`QUEUE_ROW.selectGutter`) → `META_COL` dot track → title.
  - The `META_COL` dot track is **correct here and only here**: a list row has no columns, so the
    row's own left edge is the only address a state mark can have.
  - Meta indent via `metaIndentFor(track, selectChildPage)` — never hand-rolled `calc` or page-local `px-4`.
  - Wide track (`indentWide` / `dotTrackWide`) only for received/expected qty surfaces (Receiving).
- **On a `LedgerGrid` surface a fact belongs to its own COLUMN — never to a neighbour's cell**
  (ruled 2026-08-02). Concretely: **no status dot in the identity cell.** The dot belongs to the
  `status` track, leading its chip (`GridStatusCellValue`).
  - **Why, and it is not taste:** a column is the only address at which a fact can be sorted,
    hidden, resized, highlighted and aligned with its own kind. A dot parked in the title cell has
    none of that — it cannot be turned off by the operator who does not want it, it moves when the
    *title* is resized, and it spends the title's truncation budget on every row to repeat what the
    status column already says.
  - This is the one place the grid families **diverge from the list rows above**. A dot on the row's
    left edge is right for a list (no columns exist) and wrong for a grid (a column does). Both
    rules are live; do not delete one to make them agree.
  - A dot may still lead a value *inside its own column* — that is the fact at its own address.
- **Selection never size/height-shifts.** Keep row content identical across states:
  - list / accordion selected (**record pick**): `QUEUE_ROW.selectedClass` (`bg-blue-50 ring-1 ring-inset ring-blue-400`)
  - airtable LedgerGrid selected: `QUEUE_ROW.selectedLedgerClass` / `ledgerRowStateClass(true)` (`bg-blue-50` fill only — inset ring fights cell rules + sticky `bg-inherit` and reads as a top/right L-glow)
  - **navigator selected** (facet / saved-view / capture-day / Desk segment — orienting a filter, not a record): `NAV_ROW.selectedClass` (`bg-surface-sunken font-semibold text-text-default`) — quiet, no hue fill. Same module as `QUEUE_ROW` (`queue-row-chrome.ts`). Never reuse `QUEUE_ROW.selectedClass` on a context-rail navigator.
  - focused (no click): `bg-gray-50 ring-1 ring-inset ring-gray-200`
  - default: `hover:bg-gray-50`; constant `py-1.5`.

## Conversation & message rows

**Discriminator: read vs select.** The row shell follows the job, not a single
universal ban. Both shells share one waist (`MergedRecordStream` over
`TimelineItem` adapters + `DateGroupHeader` + `renderBlockMarkdown`) — never a
third chat renderer (`SupportChatThread` stays deleted).

- **Select / scan (ledger)** — dense triage queues and selectable streams
  (`variant="ledger"`, default, including `/support`). Flat rows on **one shared
  left reading edge** (`divide-y divide-border-hairline`). Direction (inbound /
  outbound) is the leading mark's identity — an avatar, a station glyph — **not**
  a bubble fill. Backgrounds default to transparent; internal notes may tint with
  `bg-surface-sunken` **and** say so in words on the row. Prove the shared edge by
  measuring — every row's `getBoundingClientRect().left` must resolve to ONE value.
- **Read + reply (bubble)** — station Ticket Displays (`streamVariant="bubble"` /
  `variant="bubble"`). The job is prose top-to-bottom then answer; inbound vs
  outbound is distinguished by the bubble shell (house tokens — soft fill/border,
  capped width — never the deleted-thread `bg-blue-600 text-white` look). Internal
  still labels in words. Composer + stream share `DISPLAYS_BODY_INSET` (`px-4`);
  the Displays host stays flush.
- **Day banding is required** for any thread spanning >24h — compose
  `DateGroupHeader`, never a second one.
- **No per-row redundancy.** A chip repeated on every row (`PUBLIC`, the author on
  consecutive messages) is paid for N times and read once.
- **Block markdown must render** — headings, lists, blockquotes — on the house type
  scale. There is **no Tailwind typography plugin in this repo**, so `prose` does
  not exist and the block scale is defined once in the renderer
  (`src/lib/support/markdown.ts` → `renderBlockMarkdown`), never per call site. The
  grammar escapes first, then tokenizes, and never reaches
  `dangerouslySetInnerHTML`.
- **Assume the thread is long.** Render a bounded tail with an explicit
  "show earlier" page, or virtualize — never an unbounded map.

## Eyebrow headers + chips (micro-typography scale)

- Section/rail header = an eyebrow: `text-role-eyebrow uppercase tracking-widest text-text-soft`, optional
  right action slot. Use `leading-none` on suffixes so they don't inflate row height. **Don't add a weight class** —
  `role-eyebrow` bakes 600 and the condensed cut.
- Action buttons in a header bleed their hit-box with negative margin (`-my-0.5` / `-my-1.5`), they don't grow the row.
- Chip/badge = 3 layers: `rounded-none {bg-x-50} {text-x-700} ring-1 ring-inset {ring-x-200} inset-chip
  text-role-micro uppercase tracking-widest`. Flush-square is the ops default (`cornerClass('flush')`);
  `rounded-full` stays only for status dots · avatars · removable pills (which drop vertical padding to
  keep row height). Legacy soft-`rounded` chips flatten when the `chip` role flushes (Wave 0c).
- **LedgerGrid / DataTable column headers are not eyebrows.** They use `tableHeader`
  (`text-role-micro font-normal text-text-soft`) — **Sentence case** as authored
  (`label` / `gridLabel`); never CSS `uppercase`. Eyebrows · chips · `sectionLabel` /
  `fieldLabel` keep uppercase-tracked micro chrome. Golden consumer: Unbox History.
  Guard: `table-header-casing.guard.test.ts`.
- **A grid STATUS cell is that chip with a dot leading it, inside** — `GridStatusCellValue`
  (`@/components/ui/grid-cells`), never a page-local chip. Tone comes from the surface's lifecycle
  registry (`workflowStage().badge`, `pickupOrderStatusChipClass`, …); the third layer derives from
  the resolved ink (`ring-current/20`), so no registry needs a new field.
  - **Lifecycle badges are pastel only** — `bg-*-50 text-*-700` (or `bg-surface-*` neutrals). Never
    solid white-ink fills (`bg-*-600 text-white`) in a status column, and never encode status as a
    full-cell Sheets wash (that channel is staff highlight prefs only). Guard:
    `workflow-stages.badge.guard.test.ts`. Golden consumer: Unbox History status track.
  - **Why a chip and not bare text:** a state is a categorical label, and bare text in a ruled band
    reads as one more data value. Four surfaces had each grown their own local chip for this exact
    job before the primitive existed.
  - **Why the dot is inside:** a dot beside a chip is two objects in one cell — the shape a column
    exists to prevent. Inside, they read as one token and travel together under a drag-resize.
  - **The dot is not redundant with the tone.** It carries the finer vocabulary — receiving's
    `getStatusDotBg` goes emerald when a non-terminal line is quantity-complete; terminal
    dispositions (FAILED / RTV / SCRAP) keep their failure tones. Two facts, one token, and the
    non-terminal dot is the one that moves first.
- **Typed identifiers** use the semantic `CopyChip` family — never interchange chip variants (see `DESIGN_SYSTEM.md`).
  Platform-aware order / PO chips pass the catalog-resolved `platformLabel` so
  the hover value reads `Platform full-id`; the visible face remains last-8 and
  clipboard payload remains the bare id. Formatter + paint live only in
  `src/lib/source-platform.ts`; unknown stays neutral.

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
  **Sheets body caveat:** caption-dense `ledgerCell` (`text-role-caption`) does **not** bind
  tabular intrinsically — magnitude scan columns (qty · price · date · id) must add `tabular-nums`
  (or use `text-role-data`) on the value face. Dense CopyChip faces bind `tabular-nums` for the
  same reason.
- **LedgerGrid column justification is a hard SoT, and the test is MAGNITUDE vs LABEL/ID** — not
  digit-ness. A magnitude is compared *down* the column (qty · price · **date**) and **end**-aligns
  so the ones place stacks; a label or ID is *read* one row at a time (title · condition · status ·
  platform · **tracking** · **order #** · SKU · serial) and **start**-aligns. Resolve via
  `resolveGridColumnAlign` (`grid-header-align.ts`); never hand-type `justify-end` on a cell.
  **Headers always match** the data they name. Helpers emit `justify-*` **and** `text-left` /
  `text-right` so full-width faces cannot zig-zag. Empty faces are `GridCellDash` flex children
  of that same aligned cell.
  **`ALIGN_BY_TYPE.id` is `start` (2026-08-04)** — all ids left with tracking/order. Magnitudes
  only: `number` · `price` · `date`. **`location` / `tracking` stay start**; **`date` stays end**.
  Full table: [source-of-truth.md](source-of-truth.md) → Grid column justification.
  **Unbox History / Receiving:** deterministic fact tracks are fixed (`resizable: false` +
  content-hard `minmax`); **Product** alone is `minmax(16rem, 1fr)` + resizable — Fields
  still toggles visibility.
- Guard: `typography-tokens.guard.test.ts` (raw px, retired tokens, the weight cap, the family
  bindings). Genuine one-off: same-line `ds-allow-weight`. Codemod: `scripts/codemods/cap-font-weight.mjs`.

## Instrument typography + telemetry rows

The type rules above, applied to the surfaces where an operator reads state back off a bench.
Identity: [`display/instrument-panel.md`](display/instrument-panel.md).

**Telemetry row anatomy** — the readout unit. Label above or beside, value below or after; never a
sentence that assembles fields into prose.

```tsx
<div className="space-y-1">
  <p className="text-role-micro uppercase">TRACKING</p>   {/* condensed cut, intrinsic */}
  <span className="font-mono tabular-nums">…7719</span>   {/* mono ⇒ retypable */}
</div>
```

- **The label takes a role, not a family.** `text-role-eyebrow` / `text-role-micro` bind the
  condensed cut themselves, which is what keeps a 10–11px label legible inside a grid column.
- **Mono is a contract, not a texture.** It marks a value the operator may have to retype or read
  aloud — serial · FNSKU · tracking · SKU · order id. A platform label, a staff name, or a status
  word is **not** mono. "Sci-fi monospace everywhere" is the anti-pattern; mono everywhere means
  mono signals nothing.
- **Numerals align by default** on the data roles; a readout that must line up in a column keeps
  `tabular-nums`, and mono never ligates (an `fi` in a serial would render a string nobody can
  retype).
- **Emphasis is contrast and tracking, never weight** — the 600 cap is unchanged here. A telemetry
  row that needs its value to out-rank its label moves the *label* to `text-text-faint`; it does not
  add ink to the value.

### Instrument-selected surface (D10 — ruled 2026-08-02)

**Yes, unify — one named recipe, once the ring's colors are tokens.** The selected state means *this
instrument is the one you are reading now*, and it appears in two places today with two different
implementations:

| Surface | Selected today | Target |
|---|---|---|
| Displays icon-rail cell | `bg-surface-sunken` | unchanged — this is already the recipe |
| `ScanStationProgressRing` stroke | hardcoded `#334155` | resolve from the same ink ramp as the rail's selected cell |

The ring hardcodes `#E2E8F0` (track) / `#94A3B8` (idle) / `#334155` (selected). Those literals
predate the no-page-local-hex law and are **debt, not precedent** — do not copy them onto a second
surface, and do not "fix" the mismatch by hardcoding the rail to match the ring. The migration is
the ring adopting tokens; the named recipe lands in the same change, not before it (a token nothing
consumes is a knip finding).

### Bans specific to instrument chrome

- **No numeral inside the scan progress ring.** It is a 16px bare SVG at ~3ft; a numeral in it is
  unreadable and turns a glanceable mark into a thing you stop and parse. Progress counts belong in
  the control's accessible label and the checklist body.
- **No card plate behind the ring**, and no glow / arc / faux-3D treatment — decoration untied to
  live state is the P1 violation.
- **No fourth typeface** for a "technical" or "HUD" feel. Three cuts, one face each. Reaching for a
  display face to signal *instrument* is exactly what the one-macro-family rule protects against.
- **No `font-bold` to make a readout look instrumental.** The 700 cut is not loaded; it renders as
  synthesized faux-bold and reads as blur at bench distance.

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
- **Nav chrome law — ONE stroke for every altitude of the spine**
  (rewritten 2026-08-02; it used to read *"L2 modes keep glyphs with heavier stroke"*).
  **Every MasterNav row draws its SoT glyph** — root destinations *and* child rows (a page's modes,
  a station inside a subgroup) — all at the light page stroke (**1.5**, down from 2: these draw at
  14px beside 12–14px text, where a 2-weight stroke on a 24-unit viewBox is a heavy graphic rather
  than chrome). A child row is the switch between one page's siblings, which is the job the
  GlobalHeader Mode menu draws with the *same icon set* — two doors onto one destination must not
  disagree about whether it has a face. **What child rows do not get is a heavier stroke:** at 2.25
  a child glyph out-draws its own parent at 1.5, inverting the ladder it was meant to express.
  Subordination is the indent (`pl-7`), the caption/medium type against the parent's body/semibold,
  and the muted ink. The heavier 2.25 stays where a glyph is the **whole control** rather than a
  label's companion — GlobalHeader Mode menu, header “now” identity, scan rails,
  `HorizontalButtonSlider` — so `STATION_GLYPH_KEYS` uniqueness stays live.
  CommandBar Pages / mobile page rows stay label-only until those surfaces
  are migrated. Stroke SoT: `nav-weight.tsx`. **Exception — GlobalHeader icon
  actions:** native SVG stroke only (`TOP_CHROME_ICON_GLYPH` in
  `header-shell.ts`); keep mode stroke ≤ 2.25 (`nav-weight.tsx`); 2.75 muddies dense glyphs.
  Cross-page MRU is the GlobalHeader Recents popover (`HeaderRecentsSwitcher`) — never spine chips.
  Quick Access **pins** are `HeaderPinsSwitcher`, directly beside the selected page
  with only the parent header cluster gap — no hairline or padded wrapper, and
  never a pin list in the avatar menu.
  **The spine body is a flat map for domains; Scan Stations alone is a Vercel list-replace
  drill (2026-08-03).** Root shows a Scan Stations enter row (`ChevronRight`) plus flat domain
  pages; entering replaces the map with Back + Receiving · Testing · Packing · Scan out.
  Domains stay flat — restoring an all-sections drill would bring back `Catalog › Catalog`.
  Order: `SPINE_SECTIONS`. **Workflow Studio is a FOOTER PIN above Admin**, not a section.
  No grab-bag desks, no scan bench inside a domain. A multi-child page draws its children only
  while it is the ACTIVE page. Body swap (map ⇄ stations-drill ⇄ ranked search) via
  `framerPresence.spineBodySwap` (opacity-only) — never a page-local `x` slide.
  Detail: `display/workbench-master-detail.md`.
- Size by context: row dot `h-2 w-2` · field/inline `h-3.5 w-3.5` · button/loader `h-4 w-4` (`Loader2 animate-spin`).
- **A leading glyph aligns to a text gutter OPTICALLY — put the INK on the gutter,
  not the box** (ruled 2026-08-02, after three reports against a passing E2E).
  For text and borders, box *is* ink. For an icon button it is not: an `sm` (28px)
  `IconButton` around a 14px glyph insets 7px, and a lucide glyph draws ~2px inside
  its own viewBox — so a box parked on a `px-4` edge draws its mark **~9px inside**
  the heading, avatar or card border directly beneath it.
  - **Do:** let the control's box overhang (a scale token — `pl-2` on the row, or
    `-ml-2` — never arbitrary px, so it tracks `--cf-density`). **A hit box may
    bleed past the content edge; the mark the operator reads may not sit off it.**
  - **Don't:** trust `getBoundingClientRect()` on an `<svg>` — that is the element
    box, and it will report "aligned" for a mark you can see is not. Measure
    `getBBox()` (viewBox units, less half the stroke, scaled to the render).
  - **Don't align a shared shell to one occupant.** Reference the *content gutter*
    every occupant shares. A band tuned against a sibling that is also a
    glyph-in-a-box agrees with that one surface and misses every other — and it is
    the one surface anyone thinks to measure. Reference: `UNBOX_PUSH_TOP_BAND`.
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
