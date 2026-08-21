# HANDOFF — One table engine: the `OrdersGridHost` collapse

**Session:** 2026-08-20 · **Next pass:** implement [`one-table-engine-orders-host-PLAN.md`](one-table-engine-orders-host-PLAN.md) (APPROVED, code not started)
**State:** engine unification landed; 14 grid families deleted; Home → Daily ported onto the engine.

---

## 0. Read this first

The plan is **already written and approved** — do not re-derive it.
[`one-table-engine-orders-host-PLAN.md`](one-table-engine-orders-host-PLAN.md) (300 lines) carries the
industry research, the file-level cut, and the non-goals. §1–§3 of this handoff is the state that plan
now lands into; §4 restates the cut so you can start without a second read.

---

## 1. Where the tree is

| | |
|---|---|
| Branch | `main` |
| HEAD | `6543979f6` — **local only, 1 ahead of `origin/main`** |
| Typecheck | 0 errors |
| Unit | ~6008 pass / 5 fail — **all 5 are counter/kiosk/auth**, another session's in-flight work |
| Build | `next build` green |

**The commit message is misleading.** `6543979f6` reads *"fix(unbox): the Listings combo rides the same
rail as the rows it names"*, but it also carries the entire engine unification, the 14-family grid
deletion, and the Daily port — another session swept the whole tree into one commit. If you amend or
split before pushing, that is why.

**Another session is live in this tree.** Expect `git status` to show counter/kiosk paths you did not
touch, and expect `tsc` to return *different* errors on consecutive runs while they save. Before
diagnosing a red, check whether the file is one of yours (`git status --porcelain -- <path>`).

**`sot-manifest.json` is stale.** Regenerating it sweeps their in-flight work into a generated file —
run `node scripts/build-sot-manifest.mjs` once their work settles, not before.

---

## 2. What the engine now provides (use it; do not re-invent)

Every one of these is new this session and is the reason the Orders collapse is now cheap.

| SoT | Path | What it owns |
|---|---|---|
| `GRID_FILL_COLUMN` · `GridFillCell` | `design-system/components/grid/GridFillCell.tsx` | The trailing `minmax(0rem,1fr)` slack track + its presentation cell. Every column model ends with it. |
| `gridDataCellClass` | `grid/grid-data-cell-class.ts` | The ONE body-cell composition: inset+rule · align · **per-staff text emphasis** · frozen token. |
| `compareGridValues` | `grid/grid-column-sort.ts` | Type-driven sort + the **blanks-last-in-both-directions** ruling. `dir` is applied INSIDE — never re-sign the result. |
| `rowGroupTotals` / `rowGroupTotalsByKey` | `lib/group-rows.ts` | Group rollups (`count` + caller-named `measures`). Non-finite reads contribute 0 rather than `NaN`. |
| `workStatusDot` | `lib/work-orders/work-status-display.ts` | The dot half of the WorkStatus SoT (label · tone · dot). |

**Header glyphs are text-first BY CONSTRUCTION.** The per-surface `glyphFor` prop was deleted from
`makeLedgerGridColumnHeader`, `LedgerGridColumnHeader` and `GridHeaderLabel`. There is no prop to pass.

**Identity language is ruled:** the leading mark on an identity cell is the **brand dot**, never the type
glyph. It rides `omitCellIcon` on the column, which `OrdersQueueTableRow` reads to pick its chip
`variant`. Flipping a surface is a column declaration, not a component edit.

---

## 3. What was deleted, and what is waiting

**14 grid families deleted** (~100 files). Kept: Receiving (Unbox/History), Incoming (same component),
Orders + To-Ship, and the new Home → Daily.

**28 surfaces render `TableRebuildPlaceholder`** — routes, auth gates, permission entries and data are all
intact; only the display is gone. Each is listed in `OUT_OF_COHORT` (`workbench-sheet-view.test.ts`) and
`NO_DESK_PEEK_SURFACES` (`band3-find-only.test.ts`) with a stated reason marking it **a rebuild TODO, not
a permanent divergence**. Rebuilding one = compose the engine + move its row back out of those lists.

Two survivals are **mechanical, not preference** — deleting either would delete a surface being kept:
- `incoming-grid` — `ReceivingLinesTable` is ONE component serving both Unbox/History and Incoming.
- `orders-queue` — To-Ship is built on it. **This is exactly what the plan below resolves.**

---

## 4. The cut (from the PLAN — restated so you can start)

### Ruling
**URL / lane → `TableDefinition` + typed binding → `NonlinearTableHost` → `LedgerGridSurface`.**
Feeds, selection and cell atoms stay family-local. No second table component.

### Today
```
UnshippedTable (feed) → UnshippedShelfBoard (chrome literals) → OrdersGridHost (adapter) → NonlinearTableHost
```
Three wrappers around one shell. `ReceivingLinesTable`'s Incoming embed already does it with **no**
`IncomingGridHost` — **copy that**.

### `OrdersGridHost` owns 6 things; only #1 survives as a function
1. `ordersTableBindingFor(columnMode)` — a 4-line picker. **Keep.**
2. `useOrdersQueueRows` · 3. `useOrdersQueuePlane` · 4. `useViewportForcedHidden` ·
5. URL `?colsort=` durability · 6. the three renderers — **all already live in hooks/components.**
The host is only glue.

### Order (deletion-safe)
1. Extract `useOrdersSpreadsheet` by moving the host body verbatim; `OrdersGridHost` becomes
   `return <NonlinearTableHost {...useOrdersSpreadsheet(props)} />`. **Verify green.**
2. `UnshippedTable` inlines the shelf-board chrome; delete `UnshippedShelfBoard.tsx`.
3. `OrdersDrillHost` (list mode) + `OrdersPaneTable` (compare pane) call the hook directly.
4. Delete `OrdersGridHost.tsx`.
5. Grep `OrdersGridHost` across `src/`, `tests/`, `docs/` and fix comments that name it as the mount.
   **Verified 2026-08-20:** exactly **3** files actually mount `<OrdersGridHost` (the three in steps 2–3);
   another **26** only *mention* it in prose. Step 5 is therefore mostly a comment sweep — budget for it,
   and do not mistake a mention for a call site when you check your work.
6. **Do not** touch `ReceivingGridHost` in this PR.

### Non-goals
`ReceivingGridHost` · restoring the 28 placeholders · `entity_type` on the host · unmapped CSV headers as
live tracks · growing `NonlinearTableHost` internals · changing the `pending-grid-body` testid (E2E contract).

### The one forbidden move
Do **not** grow `NonlinearTableHost` with `family: 'orders'` or a switch on `entityFamily` that renders
cells. That is the Airtable mega-row the parent plan scored **0.2, KILLED**.

---

## 5. Remaining gaps beyond this plan

Ranked as recommended:

1. **Bulk action plane** — `ContextualSelectionBar` is named in **13 files as prose and exists as no
   component**. Bulk is the primary WMS verb, and all 28 rebuilds will want one. Build it before they
   each invent one.
2. **Type-driven cell editors** — `LedgerCellEditor` has **1** consumer. Falls out of the `type` lever
   nearly free, the same way sort/align/paint did.
3. **Server-side sort + paging** — `NonlinearTableHost` has **no** seam (0 refs). Client-side sort over a
   fetched window silently lies at WMS row counts. Only worth doing once counts justify it.
4. **FBA board** — was stubbed then reverted: `FbaBoardTable` exports types **13** other FBA files need.
   Needs its own pass.
5. **Admin/settings `DataTable` pages** — a deliberate second family (server-rendered, no client JS),
   untouched. Do not port to LedgerGrid without deciding that trade.
6. Small: Orders' `queue-row-compare` still doesn't call `compareGridValues` (it already agrees with the
   ruling — tidiness); `MyDayTaskInspector` renders a dotless status; **211** `retired` prose instances
   repo-wide describe things by what they are not.
