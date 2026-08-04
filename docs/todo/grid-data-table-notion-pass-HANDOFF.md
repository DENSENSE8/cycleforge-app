# Grid data table — Notion pass HANDOFF

**Created 2026-08-02, consolidated the same day.** Everything in flight against the
LedgerGrid data-table surfaces, in one document: what already landed (§1), the
row-anatomy rulings that are **not started** (§2), the SoT edits they need (§3), the
traps (§4), and what has never been verified (§5).

**Most of §1 is already implemented in the working tree (uncommitted).** Read it
before touching anything — the risk here is re-doing work, not missing it.

`npm run verify` **PASSED** at consolidation time (lint · typecheck · unit + DS
guards · knip · route-permission drift · route-auth · schema drift · doc catalog).
Tenancy isolation is advisory-red with 22 pre-existing violations, none from this work.

---

## Paste this into a new session

> Read `docs/todo/grid-data-table-notion-pass-HANDOFF.md`.
>
> §1 already landed — verify by call site, do NOT re-implement. Your job is §2: five
> row-anatomy rulings (no dot in the title column · status = chip + dot · date and
> time in one column · order number frozen far-left · Qty header is just `#`), plus
> the SoT edits in §3 that must land WITH them. §4 is the trap list; the guard in
> §4.1 pins exact class substrings, so a "tidy up the classNames" pass will fail it.
>
> Nothing in §1 has been looked at in a browser. Attach to `:3050` (never start,
> restart, or kill one) and actually walk a receiving grid before agreeing it is done.
>
> `npm run verify` before done; never raise a baseline.

---

## 1. Already done — verify, don't redo

All uncommitted working-tree changes.

### 1.1 The column-display control reserves nothing

`src/design-system/components/grid/GridColumnDetailsTrigger.tsx` → `GridColumnGutter`
is a `relative` positioning wrapper inheriting the card's own flex sizing, with the
trigger absolutely positioned over the card's top-right corner: `opacity-0` +
`pointer-events-none` at rest, revealed on `group-hover/grid-card` **or**
`group-focus-within/grid-card`, and pinned while its own rail is open.

Three placements were tried in one day; two charged standing rent:

| Placement | Charged | Verdict |
|---|---|---|
| `w-9` header track + `pr-9` on the header row | every **row** of every grid | retired |
| same position, padding dropped | covered the last column's label (`TRACKING`) | retired |
| in-flow gutter beside the card | every **page** — dead canvas beside every queue | retired |
| **hover-revealed over the card's corner** | nothing | **shipped** |

All three reveal conditions are load-bearing: hover alone is keyboard-unreachable, and
a trigger that left with the pointer would strand the rail it opened with no visible
owner. `pointer-events` follows visibility so the hidden box never eats header clicks.

- Mounted by `LedgerGridSurface` (`columnDetails={{ open, onOpen }}`); Orders
  (`OrdersGridView`) wraps `LedgerGrid` by hand with the same component.
- **Neither header may take `onOpenColumnDetails` any more** — the prop is gone from
  `LedgerGridColumnHeader`, `makeLedgerGridColumnHeader` and `OrdersQueueColumnHeader`,
  and the guard bans it, the retired `data-grid-column-details-lip` marker, and `pr-9`.
- E2E `tests/e2e/grid-column-display-hover.spec.ts` (renamed from
  `grid-column-fields-lip.spec.ts`) hovers the card before every interaction, and its
  load-bearing test asserts **invisible + inert at rest** — the one assertion every
  resident version would have passed.

### 1.2 Drag-resize on every LedgerGrid family

- `ColumnResizeHandle` moved `orders-queue/` → `design-system/components/grid/` and
  de-parochialised (`gridColVar`, not `ordersQueueColVar`). One handle, all families.
- `LedgerGridColumnHeader` renders it per resizable cell; `makeLedgerGridColumnHeader`
  forwards `onResizeColumn`, so all 12 generated headers got it for free.
- **Who gets a grip** — `isGridColumnResizable` (`grid-column-editability.ts`):
  variable-content tracks yes; `select` and the fixed-format types (`number` · `id` ·
  `location`) no, because those cells render a last-8 `CopyChip` or a short numeral run
  and a drag only moves whitespace. Override with `resizable` on the column model.
  `ORDERS_QUEUE_RESIZABLE_KEYS` now composes this rule instead of "everything but
  `select`".
- **Persistence:** `useGridColumnWidths(tableId)` →
  `staff_preferences.tableColumns[t].widths`, applied as `--cf-col-*` through
  `LedgerGrid`'s `columnVars`. The drag mutates the CSS var directly (zero React
  render); the width commits once on drop. Frozen-pane sticky-left offsets are a
  `calc()` over the same vars, so a resized `title` keeps the pane pinned.
- **`GridColumnDetailsPanel`'s Reset clears widths too**, and `dirtyCount` counts them
  — a Reset that left the grid visibly non-default would be lying about what it did.

### 1.3 Column resize no longer leaves a white band

`src/design-system/components/grid/grid-column-geometry.ts` → `gridTemplate`.

The bug: every track was emitted as `var(--cf-col-KEY, <declared width>)`. For the
fill column (`title`, declared `minmax(12rem, 1fr)`) a resize replaced the whole
declaration — including the `1fr` — with a fixed px width. From that moment the tracks
summed to less than the card and the remainder rendered as a band of empty white
**inside** the card, right of the last column. Dragging any *other* column narrower did
it too, because nothing was left to absorb the slack.

The fix: a flex track's var sets its **floor**, not its width —
`minmax(var(--cf-col-KEY, 12rem), 1fr)`. Fixed tracks are untouched and stay
pixel-exact.

**The trade, which is real and should be checked at the bench:** dragging the fill
column *narrower* has no visible effect while the grid still fits its card, because
there is no free space for anyone else to take. It resizes normally once the grid is
wide enough to scroll horizontally. If that reads as broken to an operator, the
alternative is a dedicated trailing filler track — a filler cell in the header, every
row renderer, and every group summary. Judged not worth it; re-open only on a bench
complaint, not on principle.

### 1.4 Status and date are two columns again

- `cells/ReceivingStatusCell.tsx` — dot + stage name only.
- `cells/ReceivingDateCell.tsx` — day **and** time (`Jul 31 4:19 PM`); drops the
  `--:--` empty face rather than rendering it.
- `src/lib/receiving/receiving-grid-layout.ts` — `status` at 6rem, `date` promoted
  back to `core` and widened to 7.5rem to hold both halves, `stage` demoted to
  `tier: 'optional'` (its clock moved into `date`; its runtime header label became the
  `status` track's stage name).
- `ReceivingGridGroupSummary` renders both, matching the leaf rows.
- Core set pinned by `grid-column-tier.guard.test.ts`:
  `select · title · status · date · qty · location · order · tracking`.

For one day `status` carried `dot · stage · day · time` in one track. The half of that
argument worth keeping is kept: the stage NAME belongs in the row, not in a runtime
header label. The half that was wrong: a state and a timestamp are two facts. Merged,
the stamps stop aligning down the axis, the track has to be sized for longest-word +
longest-stamp, and the pair sorts and resizes as one thing. **Do not re-merge them.**

**Scope check before you extend this:** only the *receiving* family
(`RECEIVING_GRID_COLUMNS` — Unbox / History / Testing) was touched. Incoming has its
own `status` column in `INCOMING_GRID_COLUMNS` and was deliberately left alone; decide
per surface rather than sweeping. (§2.3 changes that — read it.)

### 1.5 Order-number alignment

An identifier that is the row's own **transaction identity** aligns **start**; a
reference attribute stays **end**. Shipped as an explicit `align: 'start'` on the
`order` column in `dashboard-order-row-layout.ts` (both models) and
`receiving-grid-layout.ts` — **never** by changing `ALIGN_BY_TYPE.id`, which would drag
SKU / serial / ticket left with it.

**Still unadjudicated, deliberately left red:** `date` and `location` (tracking).
`ledger-grid-column-display.spec.ts` D2 and its fold-row assertion want `flex-start`,
the code says `end`, nobody has ruled. **Do not green the suite by editing those
assertions** — that deletes the open question instead of answering it.

### 1.6 Support tickets ported to LedgerGrid

New family under `src/components/support/zendesk/grid/` — layout · descriptor ·
generated header · row · view. `TableId` `'support-tickets'` added with its
`TABLE_COLUMNS` entry; `SupportTicketsBoard` renders `SupportTicketsGridView` instead
of the `divide-y` list.

- Frozen pane is `select · subject` — an agent recognises a conversation by its
  subject; `#48213` is a reference they quote, not the name they read.
- **Sort is the SERVER's.** The list is helpdesk-paginated, so a client comparator
  would reorder the page in hand and present it as the queue's order. Header clicks and
  the trailing Sort dropdown write **one** `{ sortBy, sortOrder }` pair
  (`SUPPORT_TICKETS_SORT_BY` maps column → the API's vocabulary), so the two controls
  cannot disagree. `subject` is `sortable: false` because the API cannot order by it —
  a dead header is worse than an obviously inert one.
- **No Requester column:** `ZendeskTicket` carries only `requester_id`, so it could
  render nothing but a track of numeric ids under a header promising a person.
- Capabilities all false except `fieldsMenu` (rationale in the descriptor).
  `SupportTicketRow` is **kept** — the recent dock is a rail, not a collection map.

### 1.7 Doc updates already made (do not redo)

`.claude/rules/display/workbench.md`, `.claude/rules/display/workbench-ops-queue.md`,
`.claude/rules/source-of-truth.md`, `.cursor/rules/workbench-sort-chrome.mdc` and
`src/design-system/DESIGN_SYSTEM.md` already describe the hover-revealed control and
the drag-resize waist. `docs/todo/fields-to-notion-header-hover-HANDOFF.md` is
**superseded by this file** — its Stream A puts the overlay inside the two column
headers, which the guard now bans. Retire it.

---

> **§2 and §3 LANDED 2026-08-02.** Three defects came back from the first bench look — tracking /
> order left padding, and a doubled `#` in the Qty header. They are scoped, diagnosed and handed off
> in **[`grid-row-anatomy-bench-fixes-HANDOFF.md`](grid-row-anatomy-bench-fixes-HANDOFF.md)**, whose
> §5 also records what landed (including a frozen-pane bug that meant no grid's identity pane was
> ever actually pinning). Read that file, not this section, for current state.

## 2. LANDED 2026-08-02 — the row-anatomy rulings

Five rulings, one idea: **a fact belongs to its own column, not to a neighbour's cell.**
They apply to every LedgerGrid family, not just receiving.

### 2.1 No status dot in the title column

The dot currently rides inside the identity cell on at least these:

| File | Where |
|---|---|
| `src/components/station/receiving-grid/cells/ReceivingTitleCell.tsx` | line ~24 |
| `src/components/station/receiving-grid/ReceivingGridGroupSummary.tsx` | `case 'title'`, ~205 |
| `src/components/support/zendesk/grid/SupportTicketsGridRow.tsx` | `case 'subject'` |

Audit the remaining families rather than assuming that is all of them.

**Do:** delete the dot from every identity cell. The title column shows the title.
**Why:** a dot in the title cell is a status fact wearing an identity cell's address —
it cannot be sorted, hidden, resized or highlighted with the rest of its own column,
and it spends the title's truncation budget on every row to say something the status
column already says.

The group-summary file paints `statusDot` **twice** (~205 and ~218); after this, one of
those is the status cell and the other should be gone.

### 2.2 The status column is a CHIP plus a dot

Today `ReceivingStatusCell` renders a bare dot + semibold text. Ruling: **chip + dot** —
the house 3-layer chip (`rounded {bg-x-50} {text-x-700} ring-1 ring-inset {ring-x-200}
inset-chip text-role-micro uppercase tracking-widest`) with the status dot leading it.

- Tone from the lifecycle registry — `workflowStage(status).badge` /
  `workflowStageDot(status)` for receiving, `statusBadge` / `statusDot` for support.
  **Never a local map.**
- Support's row already renders a chip in `status`; it needs the dot added (and removed
  from `subject`, per 2.1) so the two families read alike.
- Re-check the track width after the chip lands — receiving's `status` is 6rem, and a
  chip is wider than bare text.

### 2.3 Date and time in one column

**Already true on receiving** (§1.4). What is missing is the *rule*: apply it to every
family that splits a civil day from its stamp, and state it in the SoT so the next
surface does not split them again. Audit Incoming, Pickup, Ready, Warranty, Repair,
Catalog, Orders. This supersedes §1.4's "decide per surface" note.

### 2.4 Order number fixed at the far left

`order` joins the **frozen identity pane**, immediately after `select` — before `title`.

- Orders (`dashboard-order-row-layout.ts`) already freezes `select · order · title`;
  this generalises that answer.
- Receiving (`receiving-grid-layout.ts`) freezes only `select · title` today and puts
  `order` eight tracks right. Moving it means `frozen: true` **and physically
  reordering the array**: `gridFrozenKeys` derives the pane from the model, and the
  pane must be a **contiguous leading prefix** or sticky-left offsets resolve against
  the wrong origin (`grid-column-tier.guard.test.ts` enforces this).
- A frozen column **carries no `hideKey` and no `tier`** — it is structural. Promoting
  `order` therefore *retires* its `orderid` pref key; a stale `hidden: ['orderid']`
  delta goes inert on its own, which is the whole migration.
- Consequence, stated deliberately: a frozen `order` can never be hidden or reordered
  by staff, and is never in-cell editable. That is the trade for being the scan anchor.
- Update the guard's expected pane + core-set lists in the same change.

### 2.5 The Qty header is just `#`

Render the hash glyph alone (no `Qty` word) on every family.

**This reverses a documented decision — read its reason first.**
`receiving-grid-layout.ts` line ~95 says qty was given a `Qty` label precisely because
*"the type registry maps BOTH `number` and `id` to the hash mark, so a label-less qty
column was indistinguishable from the Order column two tracks over."*

§2.4 is what dissolves that collision: once `order` is frozen at the far left it is no
longer "two tracks over" — it is on the other side of the identity pane, start-aligned,
and pinned while qty scrolls. **Land 2.4 before or with 2.5.** Landing 2.5 alone
re-creates the exact ambiguity that comment describes.

Mechanism: prefer `gridLabel: '#'` on the column model (one declaration per surface)
over forcing the glyph fallback via `labelFitRem`, which would flip back to the word the
moment someone widens the track.

---

## 3. SoT documents to update (with §2, not before it)

`pattern-evolution.md` bans encoding a net-new architecture in prose ahead of the build
— land these in the same change as the code.

| File | Edit |
|---|---|
| `.claude/rules/ui-design-system.md` → **One row anatomy** | The left-edge stack reads `QUEUE_ROW.px → select gutter → META_COL dot track → title`. Add: on a **LedgerGrid** surface the status dot belongs to the status column, never to the identity cell. The `META_COL` dot track stays correct for list/accordion rows — say which is which, or the next reader deletes the wrong one. |
| `.claude/rules/ui-design-system.md` → **Eyebrow headers + chips** | Add the status chip's anatomy: dot + house 3-layer chip, tone from the lifecycle registry. |
| `.claude/rules/source-of-truth.md` → **Grid identity pane** | Rewrite the per-surface pane answers: `order` is part of the pane on order-anchored **and** receiving surfaces. Keep the contiguous-prefix rule and the "a frozen column carries no `hideKey`/`tier`" consequence; note that promoting `order` retires `orderid`. |
| `.claude/rules/source-of-truth.md` → **Grid column justification** | The `order` start-align exception is **shipped** (§1.5). Keep `date` / `location` marked unadjudicated and their spec assertions deliberately red. |
| `.claude/rules/source-of-truth.md` → new SoT-table row | *Grid row anatomy (dot · chip · stamp)* → one line pointing at the rules above, so a new family has one place to look. |
| `.claude/rules/display/workbench-ops-queue.md` | Add a short **Row anatomy** section carrying 2.1–2.5 with their reasons. Its column-display and drag-resize sections are already current — do not re-edit them. |
| `src/design-system/DESIGN_SYSTEM.md` (~line 135) | Grid section: add the status-chip anatomy and the no-dot-in-title rule beside the existing column-visibility / width / sort entries. |

State the reason, not just the mechanic, in each: *a fact belongs to its own column,
because that is the only address at which it can be sorted, hidden, resized, and
aligned with its own kind.*

---

## 4. Traps

### 4.1 The guard pins exact class substrings

`src/components/dashboard/workbench-trailing-cluster.guard.test.ts` → *"the
column-display control reserves no layout"* asserts, against
`GridColumnDetailsTrigger.tsx` with comments stripped:

- `absolute right-1.5 top-1.5`
- `pointer-events-none absolute` — **in that order**
- `opacity-0 group-hover/grid-card:opacity-100` — **contiguous**
- `group-focus-within/grid-card:opacity-100`
- `open && 'opacity-100'` — that literal expression
- `pointer-events-auto` present
- no `gap-2` (the retired gutter's shape), no `whileHover`
- `LedgerGridSurface` mounts `<GridColumnGutter …>` within 220 chars of
  `data-table-surface`

The `cn()` argument order in that component is load-bearing. Reformatting it into a
single ternary — which reads better — fails the guard. That is why `open` appears twice
(`open && 'opacity-100'`, then `open && 'pointer-events-auto'`) instead of once.

### 4.2 opacity and pointer-events must be on the SAME box

`grid-column-display-hover.spec.ts` resolves the reveal wrapper as
`[data-grid-column-details-trigger]` → `xpath=ancestor::div[1]` and asserts `opacity`
**and** `pointer-events` on it. An earlier attempt split them across two nested divs
(outer faded, inner clickable) — that passes the unit guard, fails the spec, and is a
genuinely invisible box eating the last column's clicks. One wrapper.

### 4.3 A child can re-enable pointer events

Don't "fix" hover reachability by putting `pointer-events-auto` on the inner trigger
div. `pointer-events` is not inherited-and-locked: a child re-enables it under a `none`
parent, so the control becomes clickable while invisible.

### 4.4 `isFlexTrack` is intentionally not exported

A formatter dropped the `export` after it was written, which is correct — one caller in
the same module, and exporting it would be a new knip finding.

### 4.5 Don't re-derive the resizable set

`isGridColumnResizable` is the one rule for which columns get a grip. `date` is
`type: 'date'` → a fixed-format type → **not** resizable. Since `date` just grew to
carry day + time, check at the bench that 7.5rem holds it at the largest Settings text
size; if it clips, change the declared width in the layout SoT, not the resizable rule.

### 4.6 Untracked files have vanished from this worktree

Twice during this work, minutes after being written: the whole
`src/components/support/zendesk/grid/` directory, then its two `.ts` files. They were
recreated and are present now (`git status` → `?? src/components/support/zendesk/grid/`).
This worktree is managed by GitButler and another session was staging concurrently.
**After creating a new untracked file, `ls` it back**, and get new directories tracked
early.

### 4.7 A syntax error anywhere makes typecheck lie

Twice, another session's file carried backticks inside a template literal (a SQL comment
inside a tagged query). TypeScript skips **all** semantic checking program-wide when any
file fails to parse, so `npx tsc --noEmit` printed four syntax errors and silently
checked nothing else. If typecheck looks impossibly clean after a large change, look for
syntax errors first. Both instances are fixed.

---

## 5. Verify

**Nothing in §1 has been seen in a browser.** `:3050` was down for part of the work and
`/unbox` redirected to `/signin` after that. Every change here is visual. Attach to
`:3050` — never start, restart, or kill one — and walk a receiving grid.

1. **At rest**, no control painted at the card's top-right and no empty lane beside the
   card. Hover the card → it fades in over the header band's right end. Tab into the
   card → same. Open the rail, move the pointer away → it stays painted.
2. **Resize** any column: no white band inside the card right of the last column, in
   either direction, on a grid that fits and one that scrolls. Reload → the width holds.
3. **Status vs Date** — `Done` in one track, `Jul 31 4:19 PM` in the next, stamps
   aligned down the column.
4. **Support** (`/support`) — the queue is a grid, the subject anchors the frozen pane,
   sort dropdown and header clicks agree.

```bash
npx tsx --test src/components/dashboard/workbench-trailing-cluster.guard.test.ts src/design-system/components/grid/ledger-grid-column-header.guard.test.ts src/lib/tables/grid-column-tier.guard.test.ts src/lib/tables/grid-surface-capabilities.guard.test.ts
```

```bash
npx playwright test tests/e2e/grid-column-display-hover.spec.ts --project=qa-desktop
```

```bash
npm run verify
```

**State as handed over:** `npm run verify` passes end to end.
`grid-column-display-hover.spec.ts`, `my-day-today.spec.ts` and
`ledger-grid-column-display.spec.ts` have **never been executed** — expect D2 and the
fold-row assertion red on `date`/`tracking`, which is intended (§1.5).

---

## 6. Also open

- **Two live hand-rolled duplicates of grids that already exist**, both still mounted:
  `ReadyQueueTable.tsx` (vs `ReadyGridView`) and `WarrantyClaimsTable.tsx` (vs
  `WarrantyGridView`). Every fix in §2 lands on one of the two tables each of those
  pages can show. These are **deletions, not migrations** — do them first.
- **Remaining hand-rolled ops `<table>`s:** `ByUnitView.tsx`, `ScannedMode.tsx` →
  LedgerGrid; `admin/inventory/throughput/page.tsx` and the two sync dialogs →
  `DataTable`.
- **`DataTable` stays.** It carries no `'use client'`, so its 18 admin/settings
  consumers render tables as Server Components with zero client JS; folding them onto
  `LedgerGrid` would put TanStack + the virtualizer + framer behind a client boundary to
  draw static rows. The boundary is *ops queue vs admin list*, and it holds.
- **The page-gutter ask** — "a gutter between the vertical top context bar KPI, and data
  table, and between the sidebar" — was deliberately not guessed at. What exists today:

  | Seam | Current | Where |
  |---|---|---|
  | Page ↔ viewport / sidebar | `px-4 sm:px-6 lg:px-8`, `max-w-[1440px]`, centred | `WORKBENCH_GUTTERS` |
  | Chrome band ↔ KPI strip | chrome `py-2` + body `pt-2` = 1rem | `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN` |
  | KPI strip ↔ table card | KPI wrapper `mb-4` | per-view KPI wrapper |

  All in `src/components/dashboard/workbench-shell.tsx`. `WORKBENCH_GUTTERS` is the one
  horizontal-inset SoT that every workbench page reads, so a change there is not a local
  tweak. **Get a specific answer to "which seam reads as too tight, at what viewport"
  before editing**, and check it against the two seams that are already deliberately
  equal. Note removing the gutter (§1.1) gave the card back ~40px, so the balance the
  ask reacted to has already changed.

---

## 7. Key files

| Role | Path |
|---|---|
| Hover trigger + wrapper | `src/design-system/components/grid/GridColumnDetailsTrigger.tsx` |
| Mounts the wrapper | `src/design-system/components/grid/LedgerGridSurface.tsx` |
| Track template / resize math | `src/design-system/components/grid/grid-column-geometry.ts` |
| Resize drag | `src/design-system/components/grid/ColumnResizeHandle.tsx` |
| Width persistence | `src/components/ui/table-column-config/useGridColumnWidths.ts` |
| Resizable / frozen rules | `src/design-system/components/grid/grid-column-editability.ts` |
| Receiving column model | `src/lib/receiving/receiving-grid-layout.ts` |
| Status / date cells | `src/components/station/receiving-grid/cells/Receiving{Status,Date}Cell.tsx` |
| Title cell (§2.1) | `src/components/station/receiving-grid/cells/ReceivingTitleCell.tsx` |
| Support grid family | `src/components/support/zendesk/grid/` |
| Page gutters (§6) | `src/components/dashboard/workbench-shell.tsx` |
| Guard | `src/components/dashboard/workbench-trailing-cluster.guard.test.ts` |
| E2E | `tests/e2e/grid-column-display-hover.spec.ts` |
| Laws | `.claude/rules/display/workbench-ops-queue.md` · `.claude/rules/source-of-truth.md` · `.claude/rules/ui-design-system.md` |

## Done when

- [ ] No status dot in any identity/title cell on any grid family
- [ ] Status column renders dot + chip, tone from the lifecycle registry, receiving **and** support
- [ ] Day + time share one column on every family that has both
- [ ] `order` frozen immediately after `select`, pane contiguous, its `hideKey`/`tier` gone
- [ ] Qty header renders `#` only — landed with or after 2.4
- [ ] Guards updated for the new pane + core sets (never a raised baseline)
- [ ] The seven SoT edits in §3 match shipped behaviour
- [ ] `npm run verify` passes
- [ ] The surfaces have actually been looked at on `:3050`

## Non-goals

Re-doing §1 · re-merging status and stamp into one cell · changing `ALIGN_BY_TYPE.id` ·
greening the `date`/`tracking` D2 assertions · folding `DataTable` into `LedgerGrid` ·
adding a Requester column to Support · client-side sorting of the Support queue ·
tuning page gutters without a specific seam + viewport.
