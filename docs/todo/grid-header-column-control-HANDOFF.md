# Grid table plumbing collapse, then the column-display control — HANDOFF

**Created 2026-08-02** from a bench look at `/unbox?view=history`. The operator hovered the `DATE`
header and asked:

> hovering on the header like this should display a column icon editing and displaying a right
> rail for editing all the columns in detail

**Phase A (the plumbing collapse) LANDED 2026-08-03** — §1. **Phase B (the ask) is not started** —
§2. Phase B was deliberately second: answering it before Phase A meant editing fourteen files, and
now it means editing one.

---

## Paste this into a new session

> Read `docs/todo/grid-header-column-control-HANDOFF.md`.
>
> **§0 first — there is a live blocker and it is not yours.** The column-display control is painted
> underneath the grid's own sticky header band on every grid, so it cannot be seen or clicked;
> `tests/e2e/grid-column-display-hover.spec.ts` is 6/11 red because of it. It arrived with another
> session's uncommitted hover-reveal placement, not with Phase A. Phase B **moves** that control, so
> decide up front whether you are fixing it (one token, §0.2) or subsuming it — but do not start
> Phase B believing the surface works today.
>
> **Phase A is done and is the ground you build on.** §1 states the API `LedgerGridSurface` and
> `GridColumnGutter` now have, and what the two guards assert. Read it before touching either; do
> not re-derive it from the call sites.
>
> **§2 is Phase B, and it carries a live collision:** the column-display control was moved OFF the
> grid header on 2026-08-02 and a guard bans it there **by symbol name**. Do not delete guard lines
> until you can state what is different this time. §2.4's option A is now a bigger move than it was
> when written — `GridColumnGutter` owns the open state and the rail mount, so "delete the gutter"
> means rehoming those too, not just moving a button.
>
> **§3 is what to invert, §4 is seven verified stale comments, §6 is three pre-existing bugs found
> in passing** — none of §6 is Phase B; record them or fix them deliberately, don't absorb them.
>
> Attach to `:3050` (never start, restart, or kill one). `npm run verify` before done; §5 says which
> reds are pre-existing.

---

# §0 — BLOCKER: the column-display control is unreachable

**Not caused by Phase A.** The absolute hover-reveal placement was already in the working tree,
uncommitted, before Phase A's first edit; at `HEAD` the gutter is still a flex row (`flex …
items-stretch gap-2`) with the trigger in a `shrink-0 pt-1.5` sibling column, where nothing
overlaps. Another session moved it to a card-corner overlay and shipped the guard and the spec
docblock with it — but the app did not build that day (§5), so the placement was never once
exercised.

## §0.1 The measurement (real app, `:3050`, `/receiving/history`, authenticated)

```
trigger host : z-index 10 (z-raised)   rect y 115  h 32
header band  : z-index 30 (z-sticky)   rect y 110  h 44   background rgb(255,255,255)
document.elementFromPoint(host centre) → div.group/hcell ...   triggerIsHit: false
```

Total geometric overlap, opaque band, and nothing between them establishes a stacking context. The
control that is now the **sole** entry to `GridColumnDetailsPanel` cannot be seen or clicked on any
of the fourteen grids.

**Why every gate stayed green.** `workbench-trailing-cluster.guard.test.ts` asserts the class
string; `grid-column-display-hover.spec.ts` asserts `toHaveCSS('opacity', '1')`. Neither can observe
paint order — opacity is unaffected by it, and only the `.click()` fails. **A guard cannot see a
z-index defect; a hit test can.** If Phase B keeps a hover-revealed control, add
`document.elementFromPoint` at the trigger's centre to the spec.

## §0.2 The fix, if you are fixing rather than subsuming

`z-raised` (10) → **`z-header`** (40) — the next named token above `sticky` (30) in
`src/design-system/tokens/z-index.ts`. Never a raw `z-[N]`.

- [`GridColumnDetailsTrigger.tsx:106`](../../src/design-system/components/grid/GridColumnDetailsTrigger.tsx) — the class string.
- Same file, **line 90** — the docblock claims "`z-raised` clears the sticky header it floats over",
  which is false against the scale. Correct it in the same edit.
- No guard pins `z-raised` (only `absolute right-1.5 top-1.5`), so nothing else moves.

---

# §1 — Phase A: LANDED

## §1.1 What collapsed

Every descriptor-driven grid view repeated one six-part ritual — a `useState(columnDetailsOpen)`, a
`useGridColumnVisibility`, a `useMemo(() => makeXDescriptor(visible))`, a `columnDetails={{…}}`
prop, a sibling `<GridColumnDetailsPanel>`, and its `tableId` re-typed four times. Fourteen call
sites across thirteen files. The lifted boolean was never read outside the subtree that could own
it: both of its consumers sit inside the surface.

| | before | after |
|---|---|---|
| `columnDetailsOpen` lifted to a view | 14 | **0** |
| `<GridColumnDetailsPanel>` mounts | 14 | **0** — one, inside `GridColumnGutter` |
| `columnDetails={{…}}` | 13 | **0** — the prop is gone |
| `useGridColumnVisibility` in a view | 14 | **1** — Orders, allowlisted with its reason |

107 removed lines match the plumbing patterns literally (a floor — it excludes deleted comments and
fragment unwraps). No column model, cell registry, row component, sort comparator or empty copy was
merged; that is the fork `pattern-evolution.md` bans and it did not happen.

## §1.2 The API you are building on

```ts
LedgerGridSurface<Row, K extends string, C extends LedgerGridColumnModel>({
  columns,          // the FULL canonical column model — never pre-narrowed
  makeDescriptor,   // (visible: readonly C[]) => GridSurfaceDescriptor<Row, C>
  tableId,          // REQUIRED, typed TableId (was `tableId?: string`)
  renderColumnHeader: (api: { toggleColumnSort; onResizeColumn; columns: readonly C[] }) => ReactNode,
  renderGroup: (group, baseStripeIndex, api: { columns: readonly C[] }) => ReactNode,
  renderRow:   (row,   stripeIndex,     api: { columns: readonly C[] }) => ReactNode,
})

GridColumnGutter<C extends LedgerGridColumnModel>({ tableId, columns, children })
```

Three facts worth not re-deriving:

- **The inversion is the whole move.** The caller used to narrow *then* build, so the surface
  received an already-narrowed descriptor and could not resolve visibility. It now takes the full
  model plus the family's factory. Same shape `makeLedgerGridColumnHeader` already uses.
- **`visible` is `descriptor.columns`**, not the hook's return — the same array, but sourced from
  the thing that computed `contentMinWidthRem` and the TanStack defs, so header / rows / template
  cannot disagree about which tracks exist.
- **`makeDescriptor` must be a module-level reference.** The descriptor is memoized on
  `[makeDescriptor, resolved]` and carries the TanStack `columnDefs`; an inline arrow rebuilds the
  state engine's column list every render. Guarded.

**`GridColumnGutter` owns the open state, the trigger and the panel mount.** That was one step
beyond the original §1.3 sketch (which put them in the surface) and it is why Orders' exemption is
one symbol rather than a whole file. It also means `GridColumnDetailsPanel` must import the grid
modules **by path** — the barrel re-exports the gutter, which mounts the panel, so a barrel import
closes a cycle. It imports `@/design-system/primitives/*` by path for a second reason: through the
barrel it dragged all 52 primitives into every grid module's graph (measured: barrel value graph
68 → 132 modules on that one edge; by-path brings it to 79).

## §1.3 The deviations that were preserved

- `ReceivingGridView` (`receiving`, Testing History passes `testing`), `IncomingGridView`
  (`incoming`) and `OrdersGridView` (`orders`) take `tableId` as a **prop with a default** and
  forward it. Never a frozen module constant.
- `ReviewCatalogLinkGridView` mounts two grids on two separate `TableId`s — one bucket would mean
  hiding `source` on one tab silently hid it on the other.
- `ReceivingGridView` keeps `useGridColumnDisplay(tableId)`; that is a different hook and it stays.
- `OrdersGridView` is the deliberate outlier — bespoke header, drag column reorder, viewport
  force-hide, no `makeXGridDescriptor`. It composes `LedgerGrid` directly and only picked up the new
  gutter API. Its exemption is **in the guard's allowlist**, not implicit.

## §1.4 The guards, and what they now assert

- **NEW: `src/design-system/components/grid/grid-view-plumbing.guard.test.ts`** — shrink-only,
  keyed per file **and per symbol**, scope discovered by **content** (a `*GridView.tsx` walk would
  miss the fourteenth the moment someone names it `FooTable.tsx`). An allowlist entry that is no
  longer needed **fails**, so a finished migration cannot leave the door propped open.
  - The load-bearing ban is on the **module path** of `GridColumnDetailsPanel`, not on a JSX tag or
    a variable name: `import { GridColumnDetailsPanel as ColumnRail }` defeats a tag ban and
    `railOpen` defeats a name ban, and between them a complete un-collapse was invisible. Proven by
    probe: an aliased mount with renamed state under a non-`GridView` filename fails.
- **`workbench-trailing-cluster.guard.test.ts` — INVERTED, not deleted.** The per-view assertion
  "must mount the column-display rail" is now "must **not** mount the rail — `GridColumnGutter` owns
  it". Reachability is unchanged: a view reaches column display by mounting `LedgerGridSurface`
  (which mounts the gutter by construction) or, if bespoke, by composing the gutter. `LIP_SURFACES`
  was renamed `COLUMN_DISPLAY_SURFACES` — "lip" named the retired resident placement.
  **The header ban in §2.2 was not touched.**

---

# §2 — Phase B: the column-display control on the header cell

## §2.1 The ask

Hovering a **column header cell** reveals a small column icon **in that cell**; clicking it opens
the right-rail `GridColumnDetailsPanel`. Two things are deliberately unresolved and §2.4 resolves
them: does it open on **all** columns or **that** column, and does it **join** the card-corner
control or **replace** it?

## §2.2 The collision — what was banned, and why

**The control used to live in the header, was moved out on 2026-08-02, and a guard nails the door
shut:** `src/components/dashboard/workbench-trailing-cluster.guard.test.ts` → *"neither grid header
reserves space for, or mounts, the column-display control"*. It fails on `pr-9`, on
`GridColumnDetailsTrigger`, on `data-grid-column-details-lip`, and on the string
`onOpenColumnDetails` appearing in `LedgerGridColumnHeader.tsx` or `OrdersQueueColumnHeader.tsx`. A
companion assertion fails any grid VIEW passing `onOpenColumnDetails=` to its header.

**But read what the ruling was about.** Three placements were tried in one day; two were rejected
for the same reason:

| Placement | Why rejected |
|---|---|
| Resident `w-9` header track + `pr-9` | Charged **every row of every grid** standing rent for an action used a few times a shift |
| Same position, padding dropped | The control then **covered the trailing column's label** (`TRACKING`) at rest |
| Resident page gutter beside the card | Same rent, different budget — dead canvas in every queue screenshot |

**Every rejection is about RESIDENCY, not about the header.** The winning argument for the current
control is that a hover-revealed affordance costs nothing in either budget — the Notion / Airtable
grammar, table chrome materialising on the table you are pointing at. **That argument does not stop
at the card; it applies harder to the header cell**, which is a more specific thing to be pointing
at. The ask is the same principle one level down, not a re-litigation.

**Do NOT quietly delete guard lines.** The guard is the only thing that made the ruling a fact
rather than prose. If this lands the guard **inverts**: it must then assert the header control is
hover-revealed and reserves nothing (no `pr-9`, no reserved track, `pointer-events` following
opacity), which is the invariant every rejected version would have failed. Rewrite the assertions;
do not remove them. **And add the hit test from §0.1** — none of the current assertions can see the
one defect the current placement actually has.

## §2.3 Three mechanical problems no previous round faced

The retired versions sat *beside* the header cells. This one sits *inside* one, and the cell is busy.

1. **The whole cell is the sort button.** `LedgerHeaderCell` puts `onClick={onSort}` on the cell
   root. Without `e.stopPropagation()`, opening column display **also re-sorts the grid** — and sort
   is URL-durable (`?colsort=`/`?coldir=`), so the operator's order changes under them and survives
   a reload. Belt and braces: a real `<button>`, stops propagation, and the E2E asserts the sort
   params are unchanged after opening the rail.
2. **The cell's tooltip already speaks for the whole cell** (`Date · click to sort`), mounted
   `asChild` on the cell root. A second control inside makes that tooltip false over part of its own
   hit area. The trigger needs its own `HoverTooltip` ("Column display"), and nested tooltips must be
   checked at the bench — two bubbles racing on one hover is the visible failure.
3. **The trailing edge is taken** by `ColumnResizeHandle` (drag + ←/→ + Enter-to-fit); the leading
   edge is taken by the type glyph. The trigger has no free edge, so it must overlay the label
   transiently — and must not sit under the resize grip's hit area.

Also: a narrow track is where an operator most wants to change display and where the icon has least
room. `qty` is `3.5rem` with a glyph-only header. Decide what happens there before shipping — a
control that appears on wide columns only is a control operators will not learn.

## §2.4 The decision: second door, or better door?

The rule that keeps biting is **one door per rail**. Chrome `GridFieldsMenu` and the header lip both
opened `detail:grid-column-details` on seven surfaces at once; retiring one was the fix, and `knip`
could not see the fork because both doors were imported. A per-cell trigger opening the same
all-columns rail as the corner trigger is **the fork again, once per header cell**.

**A — Replace (recommended).** The header-cell trigger becomes the sole door; `GridColumnGutter` is
deleted. One door, still hover-revealed, still reserving nothing, and strictly more discoverable —
it appears on the object the operator is already pointing at. The placement then earns itself:
opening from a column's own header **seeds the rail on that column** via the `initialHideKey` prop
the panel already takes. That is something the corner control structurally cannot do, and it is the
whole argument for moving.

**Phase A changed the size of option A, and this is the one thing to re-plan.** "Delete
`GridColumnGutter`" no longer means moving a button: the gutter owns the **open state** and the
**panel mount** for all fourteen grids, plus its `tableId` + full-`columns` contract. Whatever
replaces it inherits all three. Two shapes are open, and neither is obviously right:

- **The header owns them.** `LedgerGridColumnHeader` grows `tableId` + `columns` and mounts the
  rail. But that is `onOpenColumnDetails` wearing a different name — re-read §2.2 before choosing
  it, and note the header is generated by `makeLedgerGridColumnHeader` for 12 of 13 families while
  Orders hand-rolls its own, so "the header owns it" means threading it through the factory *and*
  through Orders' bespoke header.
- **The surface keeps them and passes an opener down.** `LedgerGridSurface` re-absorbs the
  `useState` + panel mount (where the original §1.3 sketch put them) and hands an `onOpen` through
  the `renderColumnHeader` api it already has. Costs nothing at the call sites — the api object is
  already there — and Orders, which composes `LedgerGrid` directly, keeps its own.

Other costs, both real: **keyboard** — the corner is one tab stop per card, a per-cell button is one
per column (~11 on receiving); mitigate with `group-focus-within/hcell`, and note (do not fix here)
that the header cell is a `div` with a click handler today, so **sorting is not keyboard reachable at
all**. **Discovery** — nothing visible at rest, same as today, already accepted.

**B — Keep both.** Only defensible if they answer different questions: the corner says *"manage this
grid's columns"*, the cell says *"configure THIS column"*. Then the cell trigger MUST open scoped,
or it is the fork with extra steps. Write the distinction into `source-of-truth.md`; if it cannot be
written in one sentence, it is not real, and the answer is A.

## §2.5 What already exists — verify by call site, do not rebuild

| Thing | Where | Note |
|---|---|---|
| Per-cell hover group | `LedgerGridColumnHeader.tsx` → `LedgerHeaderCell` | **`group/hcell relative` is already on the cell and unused.** The seam is there. |
| The trigger button | `GridColumnDetailsTrigger.tsx` | Standalone export taking `{ onOpen, open }`; carries `data-grid-column-details-trigger`, which two specs select on. Reuse it. |
| The reveal wrapper **+ the open state + the rail mount** | same file → `GridColumnGutter` | Under A all three are rehomed, not just the wrapper (§2.4). Its `opacity`/`pointer-events`-on-**one**-box comment records a real bug — carry that lesson into the new wrapper, and see §0 for the one it does not record. |
| The rail | `GridColumnDetailsPanel.tsx` | **Already takes `initialHideKey`** — the scoped-open seam, no new prop. Seeds once per open, deliberately. Imports by PATH; keep it that way (cycle + altitude, §1.2). |
| Prefs waist | `useGridColumnVisibility` · `useGridFields` · `useGridColumnDisplay` · `useGridColumnWidths` | Untouched by both phases. |

`OrdersQueueColumnHeader.tsx` is the deliberate outlier and is held to the same ban — move it in the
same change or declare it out of scope **in the guard**.

## §2.6 Phase B — done when

- [ ] The header cell reveals on hover **and** `focus-within`, `opacity: 0` + `pointer-events: none`
      at rest — measured, not eyeballed
- [ ] **The trigger actually receives the click** — `elementFromPoint` at its centre, not just a CSS
      assertion (§0.1)
- [ ] Opening does not sort (§2.3.1), asserted on `?colsort=`/`?coldir=`
- [ ] No `pr-9`, no reserved track, no column narrower than before
- [ ] One door, or two with the distinction written in one sentence in `source-of-truth.md`
- [ ] The open state + rail mount have exactly one owner, named in the guard (§2.4)
- [ ] The narrow-track case (`qty`, `3.5rem`, glyph-only) has a decided answer
- [ ] Guards **inverted rather than deleted**; `grid-column-display-hover.spec.ts` assertion (0)
      survives in spirit

---

## §3. Guards and specs that change (Phase B)

- `src/components/dashboard/workbench-trailing-cluster.guard.test.ts` — the two assertions in §2.2.
  **Invert, don't delete.** New shape: the header mounts the control AND reserves nothing (no `pr-9`,
  no reserved track, opacity + `pointer-events` on one box, no framer `whileHover` on a header cell —
  that binds a re-render to mousemove across every column). Its per-view loop was already inverted by
  Phase A (§1.4) — read that before editing so you invert once, not twice.
- `src/design-system/components/grid/grid-view-plumbing.guard.test.ts` (Phase A) — if the open state
  or the rail mount moves, `PLUMBING.railImport` and the `GridColumnGutter` ownership assertions
  move with it. The allowlist is shrink-only and a stale entry FAILS.
- `tests/e2e/grid-column-display-hover.spec.ts` — `openRail()` hovers the grid body and clicks the
  corner trigger; re-point at a header cell. **Keep assertion (0)** (invisible + inert at rest) — it
  is the one assertion every rejected version would have passed and the reason the file exists.
  **Add**: the hit test (§0.1), that opening does not change the sort params, and under A that the
  rail opens seeded.
- `tests/e2e/my-day-today.spec.ts:239` also selects `[data-grid-column-details-trigger]` — preserve
  that marker attribute and it follows.
- `src/design-system/components/grid/ledger-grid-column-header.guard.test.ts` — asserts adapters do
  not hand-forward `onOpenColumnDetails`. If the prop returns through
  `makeLedgerGridColumnHeader`, reword so it still bans hand-forwarding without banning the factory.

## §4. Stale comments to correct — seven, verified 2026-08-03

These describe the **retired resident lip** as if it were live — the prose-drift
`pattern-evolution.md` → Always #6 is about. Wrong *today*, whichever way Phase B goes:

- `src/features/my-day/MyDayWorkspace.tsx:183`
- `src/components/dashboard/workbench-shell.tsx:150` and `:260`
- `src/components/dashboard/OutboundWorkspaceHeader.tsx:104`
- `src/components/station/ReceivingLinesTable.tsx:126` and `:389`
- `src/components/dashboard/workbench-trailing-cluster.guard.test.ts:312` — an assertion **message**,
  so it is live prose inside a guard

Two of the original nine were fixed by Phase A (`GridColumnDetailsPanel.tsx`'s header, and
`LedgerGridSurface`'s `columnDetails` docblock, which went with the deleted prop). Two remaining
"header lip" hits are **correct** and must not be swept: `GridColumnDetailsPanel.tsx:16` and
`grid-view-plumbing.guard.test.ts:73` both refer to it in the past tense, as history.

Then the SoT rows: `source-of-truth.md` → *Grid column visibility + sort* and
`display/workbench-ops-queue.md` → *Column display is NOT chrome*. Both narrate the three-placement
history in prose. **Extend, do not overwrite** — that history is what stops the resident version
coming back. But prefer moving the *enforcement* into the guard's assertion names, so the prose
shrinks to a pointer instead of a fourth retelling.

## §5. Tree state — which reds are NOT yours (as of 2026-08-03)

**Another session is editing this worktree LIVE, so the aggregate `npm run verify` is not a stable
signal — scope every gate to your own files before believing a red.** Observed inside twenty
minutes: knip went 0 → 1 (`POUnboxingSection.tsx`, orphaned by their Pairing→Displays move) → 0 →
12 (`design-system/components/procedure/**`, their Procedure Deck); lint went 0 errors → 1 → 0; and
`main-nav-groups.guard.test.ts` failed twice and then passed 40/40 standalone. Every one of those
was theirs — the receiving workspace, the procedure deck and the MasterNav spine. **Do not
`knip:baseline` any of it.**

How to scope a gate to yours:

```bash
npx eslint <your files>
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS"      # whole-project, then attribute by path
npx tsx --test src/design-system/components/grid/*.guard.test.ts
```

Phase A's own state at handoff, scoped: **eslint clean · `tsc` 0 errors · 75/75 grid guard
assertions pass.** The persistent reds not attributable to it:

| Gate | Status | Whose |
|---|---|---|
| Tenancy isolation (static) | ! advisory, unchanged | pre-existing |
| **`grid-column-display-hover.spec.ts`** | ✗ **6/11** | **§0** — the z-index occlusion. Not Phase A. |

The §5 reds from the previous handoff have cleared: the app builds and `/receiving/history` renders
(238 cells, header and body track lists identical), and the `reason-codes.guard` unit failure is
gone.

**Doc catalog drifts every few minutes** because other sessions keep adding docs; `node
scripts/portfolio-sot-sync.mjs` is the prescribed fix and is idempotent.

## §6. Found in passing — pre-existing, NOT Phase B

Verified against the live tree. None was caused by Phase A and none is fixed. Record or fix
deliberately; do not absorb them into Phase B.

1. **`useGridColumnVisibility` memoizes on column KEYS only.** `columnsKey = columns.map(c => c.key)`,
   so a column list that differs only by `tier` returns the previously-resolved array.
   `incomingGridColumnsFor({ trackingFiltered: true })` promotes `zoho` to `core` without changing
   the key set — that lane gets a stale visible list. (The `removedLane` branch *adds* a column, so
   its key set changes and it is unaffected.) Identical at HEAD; the inversion did not widen it —
   the views fed the same stale array to `makeXDescriptor` before.
2. **Seven `OrdersGridView` call sites omit `tableId`**, so every outbound lane writes to the
   `orders` bucket despite the prop existing to prevent exactly that: `ReviewPackingTable`,
   `ReviewPairingTable`, `UnshippedShelfBoard`, `PackedOrdersTable`, `DashboardShippedTable`,
   `StagedQueueTable`, `LabelsQueueTable`.
3. **`TestingHistoryList.tsx:311` passes no `tableId` to `ReceivingGridView`**, so Testing History
   resolves to `'receiving'` and shares Unbox/History's prefs bucket — while sitting inside
   `TableColumnConfigProvider tableId="testing"` at `:372`. Two identities, one surface.

## §7. Non-goals

Collapsing column models, cells, or row components · making header sort keyboard-reachable (real
gap, separate change) · rebuilding `GridColumnDetailsPanel` or the prefs waist · moving Fields back
to page chrome · migrating `OrdersGridView`/`OrdersQueueColumnHeader` to the factories · anything in
§6 · the other session's `POUnboxingSection.tsx` knip finding.
