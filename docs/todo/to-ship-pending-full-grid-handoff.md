# Handoff — To Ship · Pending → full **spreadsheet grid** (Airtable-class data grid)

> **Audience:** next coding agent (or human) taking the Pending queue from a *locked-column table*
> to a *full gridlined, resizable, frozen-column database grid*.
> **Surface:** Dashboard · Outbound · **To Ship** · Pending lane (`OrdersQueueTable` family).
> **Predecessor:** [`to-ship-pending-sheets-grid-handoff.md`](to-ship-pending-sheets-grid-handoff.md) — **DONE**.
> That pass gave every fact its own **locked track** (header ↔ cell) with quiet chips. This pass adds the
> **grid chrome**: visible cell borders, resizable columns, a frozen primary column, column-type headers,
> and row-height presets — the Airtable look, rendered in **Kinetic Ledger** tokens (calm chrome, not a foreign kit).
> **This is a lane-sized initiative.** Register a worktree lane (`../cycleforge-<id>` on `topic/<id>`) per
> `AGENTS.md` → Workflow; do not pile it onto an unrelated branch.

---

## 0. TL;DR — the one-paragraph brief

Today the Pending table is a **column-locked list**: fixed `grid-template-columns`, hairline **row** dividers,
day-band group headers, quiet icon-less identity chips. The target is a **true data grid** (reference: the
Airtable "Employees" screenshot): every cell is **bounded by vertical + horizontal hairlines**, columns are
**drag-resizable** with **persisted widths**, the **primary (Product) column is frozen** while the rest scroll
horizontally, each **column header carries a type glyph + a header menu**, and the operator can pick a
**row-height preset** (short / medium / tall). Build it by **composing/growing the existing orders-queue grid**
first (Phase 1–2, low blast radius, still To-Ship-only), then **promoting a reusable `LedgerGrid` primitive**
(Phase 3–5, ask-first) so Packed / Labels / Shipped / Tech inherit it. **Never** import ag-grid / react-data-grid /
TanStack Table *UI* / any foreign kit — this is house CSS grid + tokens.

---

## 1. Verdict — what "done" looks like

A warehouse operator opens **To Ship → Pending** and sees a **spreadsheet**, not a list:

- **Gridlines everywhere.** Each cell is bounded by a **vertical** hairline (column divider) and a **horizontal**
  hairline (row divider) from `border-border-hairline`/`border-border-soft`. The header row and the body share the
  same vertical rules, so the whole thing reads as one continuous grid (like Airtable / Google Sheets).
- **Resizable columns.** Hovering a column boundary shows a **resize handle**; dragging changes that column's
  width live (all rows reflow together, no per-row jank); the width **persists per-staff** and survives reload.
  Double-click the handle = *resize-to-fit content*.
- **Frozen primary column.** **Product** (and the select gutter) stays **pinned** on the left while
  qty → cond → age → notes → platform → order → tracking **scroll horizontally** under a **frozen, sticky header**.
  A soft shadow appears on the frozen edge when scrolled.
- **Typed column headers.** Each header shows a **type glyph** (text `T`, number `#`, single-select tag, date/clock,
  long-text lines, id/hash) + label, and opens a **header menu** (sort asc/desc · hide field · resize to fit).
  A trailing **"＋ / Fields"** affordance manages columns (reuse `ColumnConfigButton`).
- **Row-height presets.** A control (short / medium / tall) changes row height only (never font size), wired to the
  existing **density** SoT.
- **Day-band grouping survives.** Group headers (`TUE, JUN 9TH · 1`) render as **full-width band rows** spanning
  all columns (no interior vertical rules inside the band) — the Airtable "grouped rows" shape — docked **below**
  the frozen column header.
- **Keyboard + a11y.** The grid exposes `role="grid"` / `row` / `columnheader` / `gridcell`, arrow-key cell
  navigation, and keyboard column-resize; reduced-motion is honored.

If it still reads as a *list with aligned columns* (no visible column rules, no resize, no frozen pane), it is not done.

---

## 2. Reference → domain map (what each Airtable affordance becomes here)

| Airtable (reference img) | Cycle Forge (Pending) | Notes |
|---|---|---|
| Row of tabs (Employees/Departments/…) | Existing **Pending / Packed / Shipped** chrome | Do **not** restyle the tab band. |
| Toolbar: sort · filter · group · search · row-height · hide-fields | Existing **PRIORITY sort**, **All dates**, **ColumnConfigButton**, **search** + **new row-height** control | Extend the existing toolbar; don't build a second one. |
| Frozen **primary** column | **Product** (title) + select gutter | Freeze both leading tracks. |
| Cell **type glyph** in header (`T`, tag, date…) | Per-column type from a **column-type registry** | text · number · tag(single-select) · id · longtext · date/age. |
| **Single-select** pill cell (Datasets) | **Platform** (plain chip / tone), **Condition** (tone tag) | Already tone-driven via SoTs — keep. |
| **Collaborator** avatar cell (Contributors) | Optional **Staff** column (tester/packer initials) | Only if `rest`/staff column enabled; compose `StaffInitials`. |
| **Date** cell (Timestamp) | **Age** (days-late / lane-age) | Keep tabular; header glyph = clock. |
| **Resize** handles on dividers | New **resize hook** driving CSS width vars | See §5.3. |
| **＋ add column** | **Fields** menu (reuse `ColumnConfigButton`) | We don't add arbitrary columns — we show/hide the registry set. |
| Row **checkbox** gutter | Existing select cell (already wired, To-Ship always-select) | Bound it as a real grid cell. |

**House translation rule:** the reference gives us *interaction affordances and information density*, **not a
visual language**. Borders come from `border-border-*` tokens, tones from the lifecycle/condition/platform SoTs,
spacing from the density-aware intents. No Airtable blue, no foreign radius/shadow kit.

---

## 3. Current state (what already exists — start here)

The Sheets-grid pass landed a **10-track** locked grid. Read these before touching anything:

| Concern | Path | State |
|---|---|---|
| Grid template SoT (10 fixed tracks) | `src/lib/dashboard-order-row-layout.ts` | `ordersQueueGridTemplate()` = `select · status · title · qty · cond · age · notes · platform · order · tracking`; `ORDERS_QUEUE_COL` (widths, **un-exported**), `ordersQueueRowShellClass` (`grid … gap-x-2`), sticky offsets. |
| Sticky column header | `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` | Text label per track; grip + select-all in the lead cell; status is an in-flow SR-only cell. |
| Row renderer | `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` | Desktop = 10 grid cells; mobile stacks. Notes cell truncates; identity chips are **plain, icon-less** cells. |
| Multi-product group header | `src/components/dashboard/orders-queue/OrderGroupSummary.tsx` | Same 10-cell template; plain group chips. |
| Day band + group plumbing | `QueueDateSection.tsx`, `QueueGroupRow.tsx`, `src/components/ui/DateGroupHeader.tsx` | Day bands sticky at `ORDERS_QUEUE_DATE_STICKY` (`top-9`). |
| Table shell / scroll / sticky | `src/components/dashboard/OrdersQueueTable.tsx` | Owns scroll body (`data-testid="column-table-body"`), sticky header wiring, virtualization option. |
| Identity chips (plain variant) | `src/components/ui/OrderIdentityChips.tsx` (+ `CopyChip` family) | `variant="plain"` + `layout="cells"` already added. |
| Column show/hide (per-staff) | `src/components/ui/table-column-config/TableColumnConfig.tsx`, `src/lib/tables/table-columns.ts`, `ColumnConfigButton.tsx` | SoT for which columns exist + are hidden. **Extend here for widths + column-type.** |
| Row density (short/med/tall home) | `src/components/ui/table-density/TableDensityProvider.tsx`, `src/lib/tables/table-density.ts` | URL `?density=` + per-table localStorage. **Row-height preset lives here.** |
| Pending lane host | `src/components/unshipped/UnshippedShelfBoard.tsx` | Renders `OrdersQueueTable` per swimlane + the flat search view. |
| Shared consumers of the SAME row/grid | `PackedOrdersTable.tsx` (staged), `StagedQueueTable.tsx`, `LabelsQueueTable.tsx` | Changing the shared grid changes these — intended promotion, must not break them. |
| Row-chrome tokens + guards | `src/components/ui/queue-row-chrome.ts`; guards `queue-row-chrome.guard.test.ts`, `row-stage-time-meta.guard.test.ts` | Guards require `QUEUE_ROW.px`, `ordersQueueGridTemplate`, `metaIndentFor(` (mobile), `data-col="age"`. |
| Verified E2E | `tests/e2e/to-ship-pending-grid.spec.ts` | Passing; asserts locked columns + no per-row grip. **Extend, don't replace.** |

**No existing resizable-column / gridline data-grid primitive exists** (searched: no ag-grid / react-data-grid /
TanStack Table UI). This is net-new capability — which is exactly why Phase 3 **promotes a reusable primitive**
rather than bolting resize onto one page.

---

## 4. Architecture decision (read before coding)

**Compose → grow the SoT → promote → compose** (`AGENTS.md`). This capability is cross-cutting (Packed, Labels,
Shipped, Tech, Receiving, Operations all want gridlines/resize/frozen panes), so the endgame is a **reusable
house grid primitive** — but you reach it in stages so each stage ships and de-risks the next:

- **Stage A — grow the orders-queue grid in place (Phases 1–2, low blast radius, To-Ship-only).**
  Add gridlines, cell chrome, typed headers, and row-height *on the existing* `ordersQueueGridTemplate` path.
  This delivers the reference **look** and validates the token/border/density choices on one surface. **Allowed**
  without an ask (single region, composes the existing SoT).

- **Stage B — promote `LedgerGrid` (Phases 3–5, ask-first).**
  Extract the proven pattern into `@/design-system/components/grid/` (`LedgerGrid`, `LedgerGridHeader`,
  `LedgerGridRow`, `useColumnWidths`, `useGridKeyboardNav`, a `columnType` registry). Resize + frozen-pane + full
  `role="grid"` keyboard nav live **here**, driven by a **column model** (not a hand-written template string). Then
  refactor `OrdersQueueTable` to compose it, and (promote-next) Packed/Labels/Shipped. **Ask-first** because it is a
  new shared primitive with many downstream call sites (`AGENTS.md` → *Ask first: public API changes to a shared
  primitive used by many call sites; introducing a second visual/domain language*). Surface the recommendation, get
  the go-ahead, then build.

> **Why not build `LedgerGrid` first?** Resize + frozen panes want a **column-model-driven** grid (widths as CSS
> vars keyed by column id), which is a different data shape than today's single template string. Proving the visual
> grid on the existing path first (Stage A) means the primitive is extracted from *working* code, not designed in
> the abstract — the "promote, then compose" discipline. If you and the reviewer prefer to jump straight to the
> primitive, that's fine — but say so explicitly; don't silently fork a second table engine beside `OrdersQueueTable`.

**Hard fork ban:** exactly **one** grid engine for this table family. Do not stand up a parallel `<PendingGrid>`
beside `OrdersQueueTable`; either grow it (Stage A) or refactor it onto `LedgerGrid` (Stage B).

---

## 5. Feature breakdown (phased)

Each phase is independently shippable and independently verifiable. Ship Phase 1 before starting Phase 3.

### Phase 1 — Gridlines + cell chrome (the visual grid) · *Stage A*

**Goal:** every cell bounded; the table reads as a spreadsheet.

- Add **vertical column rules**: a right hairline on every grid cell (`border-r border-border-hairline`),
  suppressed on the last column, applied identically to **header cells, body cells, and group-summary cells** so the
  rules are continuous top-to-bottom. Prefer a single shared cell-chrome helper (e.g. a `gridCellClass(colIndex)` in
  `dashboard-order-row-layout.ts`) over per-cell literals, so header/row/group can't drift.
- Keep **horizontal row rules** (already `border-b border-border-hairline`), but ensure the header has a slightly
  **stronger bottom border** (`border-border-soft`) so it reads as the column header.
- **Cell insets:** each cell gets a consistent horizontal inset via a spacing **intent** (`inset-cozy` / `inset-field`
  — never a raw `px-2`), so text doesn't kiss the vertical rule. Vertical inset comes from the row-height preset (Phase 5),
  defaulting to today's `py-1.5`.
- **Zebra vs gridlines:** with full gridlines, drop or soften the zebra stripe (Airtable has no zebra). Decide with the
  reviewer; default = remove zebra, keep hover + selection ring.
- **Day bands** become **full-width band rows** (span all tracks, `grid-column: 1 / -1`, no interior vertical rules) so
  grouping still reads. Keep the sticky offset token.

**Guard/tokens:** borders only from `border-border-*`; insets only via spacing intents (guard:
`spacing-tokens.guard.test.ts`); no page-local hex. Update `queue-row-chrome.guard` expectations only if a required
token moves — never weaken a guard.

### Phase 2 — Typed column headers + header menu · *Stage A*

- Add a **column-type registry**: extend `TableColumnSpec` in `src/lib/tables/table-columns.ts` with
  `type: 'text' | 'number' | 'id' | 'tag' | 'longtext' | 'date'` and (optional) `align`. Map a **type → glyph** in one
  place (reuse `@/components/Icons`; e.g. text=`Type`/`T`, number=`Hash`, date=`Clock`, tag=`Tags`, id=`Hash`,
  longtext=`AlignLeft`). Header cells render **glyph + label** from the registry — no inline per-column icon choices.
- **Header menu** per column (`HoverTooltip`/popover): *Sort ascending · Sort descending · Hide field · Resize to fit*.
  Sort wires to the existing `?sort=`/`ORDERS_QUEUE_SORTS`; hide wires to `TableColumnConfig.toggle`.
- Replace the standalone `ColumnConfigButton` placement with a **Fields** entry in the header's trailing affordance
  (keep the component; just relocate/trigger it). Do **not** implement arbitrary user-defined columns — the registry
  is the closed set.

**Nav-chrome law:** column headers are *field labels*, so a small type glyph is allowed here (it denotes data type,
not a nav mode). Keep it subtle (`text-text-faint`, `h-3 w-3`).

### Phase 3 — Resizable columns (persisted) · *Stage B (promote)*

- **Width model:** drive each column's width from a **CSS custom property** on the grid container
  (`--cf-col-<key>`), and build the `grid-template-columns` from `var(--cf-col-title, 14rem) …`. A drag on a column
  boundary updates only that var → **all rows reflow with zero per-row React state** (no layout animation; direct style).
- **Resize hook** `useColumnWidths(tableId)`: holds the width map, exposes `onResizeStart/onResize`, clamps to
  `[min, max]` per column, and **persists** to the per-staff SoT. Persist by **extending the column config**
  (`staff_preferences.tableColumns[tableId].widths`) — same optimistic-cache pattern as `TableColumnConfig` — so
  widths are durable + cross-device, exactly like hidden-columns are. (localStorage is acceptable for a first cut;
  prefer staff_preferences for parity.)
- **Resize handle:** an absolutely-positioned 6px grab strip on each header cell's right edge
  (`cursor-col-resize`), keyboard-accessible (focus + arrow keys nudge width); **double-click = resize-to-fit**
  (measure widest cell text, clamp). Frozen columns resize too.
- **Motion:** resizing is **not** animated (it tracks the pointer). Do not put `layout` transitions on cells during
  resize — they'd fight the drag. Honor `prefers-reduced-motion` elsewhere as today.

### Phase 4 — Frozen primary column + 2-axis sticky · *Stage B (promote)*

- Make the body **horizontally scrollable** (`overflow-x-auto`) once total column width exceeds the viewport.
- **Freeze** the `select` + `status` + `title` tracks: each of those cells gets `position: sticky; left: <offset>`
  with an **opaque** background (`bg-surface-card`/`bg-surface-canvas` matching the row state) and a z above scrolling
  cells (`z-raised`, from the z-index SoT — never a raw `z-[N]`). The **header** freezes on both axes (top **and**
  left) at the intersection.
- Add a **scroll shadow** on the frozen edge (appears only when `scrollLeft > 0`) — a soft `shadow` token, not hex.
- **Sticky stacking rule** (`workbench.md` → *one sticky layer per scroll port*): the column header is pinned chrome
  **above** the scroll body where possible; day bands remain the single in-body sticky layer. Verify no seam/overlap
  after freezing — remeasure the header height token if it changes.

### Phase 5 — Row-height presets + toolbar polish · *Stage B*

- **Row height** (short / medium / tall) → drive vertical cell inset from the **density** SoT
  (`TableDensityProvider` / `table-density.ts`). Add a toolbar control (segmented) that writes `?density=`; map
  density → row padding in `useTableDensity` (already returns `rowPadding`). Font size **never** changes (guard:
  type scale). Reconcile the existing `floor/ops/rollup/studio` names with short/med/tall (either alias or add a
  presentation-only mapping — decide with reviewer; don't fork a second density axis).
- Fold sort/hide-fields/row-height/search into the **existing** header/toolbar; keep PRIORITY + All dates.

### Phase 6 — (Stretch, ask-first) inline cell editing + cell-type kit

- Editable cells for the already-editable fields (**notes**, **tracking**, **out-of-stock**) via the existing
  `RowInlineEditBubble` / `AddTrackingPopover` — click a cell → edit in place, commit through the house CRUD route
  (`useOrderAssignment` / `assignOrder`), optimistic + `clientEventId`. Do **not** invent a new mutation path.
- Promote a small **cell-type render kit** (text / number / id-chip / tag / date) into `LedgerGrid` so other tables
  reuse it. This is the deepest part of the "database" feel — treat as a separate follow-up, not a blocker.

---

## 6. SoT / token requirements (non-negotiable)

- **Borders:** `border-border-hairline` (interior rules) / `border-border-soft` (header edge) only. No hex, no
  arbitrary shades. Frozen-edge shadow from a shadow token.
- **Z-index:** frozen cells / sticky header from `src/design-system/tokens/z-index.ts` (`z-header`, `z-sticky`,
  `z-raised`). Never `z-[N]` or inline numeric zIndex.
- **Spacing:** cell insets via Tier-2 **intents** (`inset-cozy`/`inset-field`) or `Inset` primitive — never raw
  `p-[Npx]`/`px-N` stacked on an intent (guard: `spacing-tokens.guard.test.ts`).
- **Focus:** resize handles + header buttons use `focusRing('control', …)` — no hand-rolled `focus:ring-*`
  (guard: `focus-ring-tokens.guard.test.ts`).
- **Icon buttons** (header menu triggers) own their box via `IconButton size` — no hand-set `h-N w-N`
  (guard: `control-size-tokens.guard.test.ts`).
- **Type scale:** row-height changes padding only; text stays on `text-role-*` (guard bans `text-[Npx]`).
- **Surface shells:** don't hand-roll a card shell around the grid; the table already lives in the monitor scroll
  shell. Compose `Panel`/existing shells if you need a frame.
- **Color/tone:** condition tone, platform label/tone, lifecycle status dot — all still from their SoTs; the grid
  view stays dumb.
- **DS-ratchet:** never raise a baseline or `--no-verify`. A genuine one-off carries the documented `ds-allow-*`
  same-line comment; a resize handle / frozen shadow that needs bespoke geometry uses the right escape, not a new hex.

---

## 7. Accessibility & keyboard

- Roles: `role="grid"` on the body, `role="row"`, `role="columnheader"`, `role="gridcell"` (+ `aria-colindex`,
  `aria-rowindex`, `aria-sort` on sorted headers). Keep row activation (open detail) and select semantics working.
- **Keyboard grid nav:** arrow keys move the active cell; `Enter`/`Space` = open/select the row (don't collide with the
  **F2 scan hotkey** — `src/lib/scan-hotkey/store.ts`; do not grab F-keys the Station archetype owns).
- **Keyboard resize:** focus a resize handle → `←/→` nudge width, `Enter` resize-to-fit.
- **Reduced motion:** no reveal/resize animation under `prefers-reduced-motion`; keep the crossfade rules from
  `motion-crossfade.md` for the detail pane (unchanged).

---

## 8. Anti-goals (do NOT)

- **Do not import a foreign grid kit** (ag-grid, react-data-grid, TanStack Table *UI*, MUI DataGrid, Handsontable).
  House CSS grid + tokens only. (TanStack Table *headless* logic is debatable — **ask first**; default is no.)
- **Do not fork a second table engine** beside `OrdersQueueTable`. Grow it (Stage A) or refactor onto `LedgerGrid`
  (Stage B).
- **Do not break Packed / Labels / Staged / Shipped** — they share the row/grid. Verify each after every phase.
- **Do not drop day-band grouping**, virtualization, or the To-Ship always-select behavior.
- **Do not turn every ops table into a heavy DB grid unasked** — `LedgerGrid` adoption beyond Pending is
  *promote-next / recommend*, not this PR.
- **Do not animate layout during resize**, and do not crossfade the collection map (only the detail pane crossfades).
- **Do not raise DS-ratchet baselines or `--no-verify`.**
- **Do not import a foreign aesthetic** (Airtable blue/round/shadow). Borders/tones/spacing from Kinetic Ledger tokens.

---

## 9. Visual QA checklist

- [ ] Vertical + horizontal rules bound every cell; rules are continuous header ↔ body ↔ group summary.
- [ ] Header cells lock to body cells at 1280 / 1440 / 1680 and **after** resizing any column.
- [ ] Drag-resize is smooth (no per-row jank), clamps to min/max, persists across reload, and syncs across devices
      (if staff_preferences path) or at least across reloads (localStorage path).
- [ ] Double-click a divider = resize-to-fit; keyboard resize works.
- [ ] Product + select frozen; qty→tracking scroll horizontally under a frozen header; scroll shadow on the frozen edge.
- [ ] Day-band group rows span full width, dock under the frozen header, no interior vertical rules.
- [ ] Row-height presets change height only (font scale constant); wired to density SoT.
- [ ] Column header type glyphs correct; header menu sort/hide/resize-to-fit work; Fields menu toggles columns.
- [ ] Packed / Labels / Staged / Shipped tables unchanged in behavior (and, post-Stage-B, inherit the grid intentionally).
- [ ] `role="grid"` semantics present; arrow-key nav + reduced-motion honored; F2 scan hotkey uncollided.
- [ ] `npm run verify` green (lint, typecheck, unit + **all DS-ratchet guards**, knip, route drift, schema). Green ⇒ CI green.

---

## 10. Test plan (Playwright — extend `tests/e2e/to-ship-pending-grid.spec.ts`)

Drive the **real** dogfood board (`/dashboard?unshipped`) — seeding fresh orders does **not** surface in this env's
search view (known limitation; the reference multi-product spec also can't seed-and-see). Scope to one table via
`[data-testid="column-table-body"]`. Add assertions:

1. **Gridlines:** a body cell has a right border (computed style `border-right-width > 0`), and the last column does not.
2. **Resize:** read `[data-col="notes"]` width; drag its header handle +80px; assert the width increased and the
   Product/Platform cells still lock header↔cell; reload; assert width persisted.
3. **Frozen column:** scroll the body `scrollLeft` right; assert the Product cell's `boundingBox().x` is unchanged
   (still pinned) while a right-side cell (tracking) shifted left.
4. **Row-height:** switch preset; assert row height changed but a title cell's `font-size` did not.
5. **Header type glyph + menu:** open a header menu, click *Sort descending*, assert `?sort=` / order changed.
6. Keep the existing locked-column + no-per-row-grip assertions. Screenshot each milestone to `test-results/`.

Also smoke-check **Packed** (`queueMode="staged"`, folds serial into tracking) after each phase — a 2-line
navigate-and-screenshot spec is enough to catch shared-grid regressions.

---

## 11. Acceptance criteria

1. Pending renders as a **gridlined spreadsheet** (vertical + horizontal cell borders), not a hairline list.
2. Columns are **drag-resizable** with **persisted** widths; resize-to-fit works.
3. **Product** (+ select) is **frozen**; the rest scroll horizontally under a **frozen header**; scroll shadow present.
4. Column headers show **type glyphs** and a working **header menu** (sort / hide / resize-to-fit); Fields menu manages columns.
5. **Row-height presets** wired to the density SoT (padding only).
6. Grouping (day bands), virtualization, always-select, and shared consumers (Packed/Labels/Staged/Shipped) still work.
7. Pattern evolution honored: Stage A grew the orders-queue grid; Stage B (if taken) **promoted** a `LedgerGrid`
   primitive with an explicit ask-first sign-off — **no** parallel table engine, **no** foreign kit.
8. Kinetic Ledger intact: borders/tones/spacing/z/focus all from SoT tokens; `npm run verify` green; DS baselines untouched.

---

## 12. Compound opportunities (recommend, don't over-reach)

| Tier | Item |
|------|------|
| **Do now (in scope)** | Gridlines + typed headers + row-height on the Pending grid (Stage A). |
| **Ask-first (this initiative)** | Promote `LedgerGrid` primitive (resize + frozen pane + `role="grid"` + cell-type kit); refactor `OrdersQueueTable` onto it. |
| **Promote-next (2+ call sites)** | Adopt `LedgerGrid` for **Packed / Labels / Shipped / Tech** queues; extend the column-type registry per table. |
| **Deferred** | Inline cell editing kit (Phase 6); user-defined column order drag-reorder; column groups / frozen right edge; Operations/Monitor rollup tables on `LedgerGrid`. |

---

## 13. Suggested agent kickoff prompt

```text
Implement the full-grid Pending refactor in docs/todo/to-ship-pending-full-grid-handoff.md.
Register a worktree lane first (topic/pending-grid) — this is a lane-sized initiative.

Read the predecessor (to-ship-pending-sheets-grid-handoff.md, DONE) and the current
orders-queue grid (§3 file map) before editing. Compose/grow the existing grid — never
import a foreign grid kit or fork a second table engine beside OrdersQueueTable.

Stage A (no ask; To-Ship-only, low blast radius):
  Phase 1 — vertical + horizontal cell gridlines + cell chrome via a shared gridCell helper
            (header + row + group summary share it); day bands become full-width band rows;
            borders from border-border-* tokens, insets via spacing intents, no hex.
  Phase 2 — column-type registry (extend TableColumnSpec with `type`) → header type glyph +
            a header menu (sort / hide field / resize-to-fit); relocate ColumnConfigButton to a
            Fields affordance.
Then STOP and get sign-off before Stage B.

Stage B (ask-first — new shared primitive, many call sites):
  Phase 3 — resizable columns via CSS width vars + useColumnWidths(tableId), widths persisted
            in staff_preferences (same optimistic pattern as TableColumnConfig).
  Phase 4 — freeze select+status+title, 2-axis sticky header, horizontal scroll + frozen-edge
            shadow; z from the z-index SoT.
  Phase 5 — row-height presets wired to the density SoT (padding only).
  Promote the proven pattern into @/design-system/components/grid/ (LedgerGrid) and compose
  OrdersQueueTable onto it.

After every phase: verify Pending AND smoke-check Packed/Labels/Staged/Shipped (shared grid),
extend tests/e2e/to-ship-pending-grid.spec.ts (gridlines, resize+persist, frozen column,
row-height, header menu), and run `npm run verify` (must be green; never raise a DS baseline).
Respect Kinetic Ledger tokens throughout; honor the F2 scan hotkey; add role="grid" a11y.
```

---

## 14. References

- Predecessor: [`to-ship-pending-sheets-grid-handoff.md`](to-ship-pending-sheets-grid-handoff.md) (DONE — locked columns + quiet chips).
- House identity: `AGENTS.md` → Kinetic Ledger + Pattern evolution (compose → grow → promote → compose).
- Workbench recipes + sticky-docking law: `.claude/rules/display/workbench.md`.
- Motion / reduced-motion: `.claude/rules/display/motion-crossfade.md`.
- DS SoTs: `.claude/rules/source-of-truth.md` (borders via tokens, z-index, spacing intents, focusRing, IconButton size).
- Improve-UI skill: `.claude/skills/improve-ui/SKILL.md` (critique → audit → normalize; no foreign kit, no bolder-for-its-own-sake).
```
