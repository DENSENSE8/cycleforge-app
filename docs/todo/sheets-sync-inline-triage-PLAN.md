# PLAN — Google Sheets sync → inline data-table triage board

**Status:** landed, uncommitted on `main` · **Written:** 2026-09-02 · **Predicates measured:** 2026-09-03 · **Lane:** `main` (this worktree)  
**Desk:** To-ship (`/shipping/orders`)  
**Host JSON:** [`docs/eval/goals/sheets-sync-inline-triage.goal.json`](../eval/goals/sheets-sync-inline-triage.goal.json)  
**OMP paste:** [`docs/warehouse-os/GOAL-sheets-sync-inline-triage.md`](../warehouse-os/GOAL-sheets-sync-inline-triage.md)  
**Execution prompt (current display law):** [`sheets-sync-gutter-overlay-IMPLEMENTATION-PROMPT.md`](./sheets-sync-gutter-overlay-IMPLEMENTATION-PROMPT.md) — same `UnshippedTable`, instant paint, ✓/✕ in the stage gutter. Do not paint `CsvImportStagingHost` for sheet sync.

This file is the **plan of record for this ship only.** Sibling plans stay siblings:

| Sibling | Why it is not this ship |
|---|---|
| [`order-intake-acknowledgment-PLAN.md`](./order-intake-acknowledgment-PLAN.md) | Full identify / pair / parcel / buy / G1–G3 / Release. **Do not expand this plan into that form.** Reuse its bulk grid + testids where they already exist. |
| [`../warehouse-os/PLAN-to-ship-paperwork-ui.md`](../warehouse-os/PLAN-to-ship-paperwork-ui.md) | Print-packet walk. Different CTA, different grain. |
| CYC-72 To-ship one-grid | Live **released** queue. Sheet rows stay **caged / staging** until approve. |

Paste this file into OMP (`@docs/todo/sheets-sync-inline-triage-PLAN.md`) and pin `/goal` from the GOAL file. Do not paste the acknowledgment prompt as the task.

---

## 1 · Scope

### In

1. After **Sync Google Sheet**, synced **manual-sheet** orders display **inline** as an industry-standard data-table triage board in the To-ship LedgerGrid body — not only as `OrderSyncDialog` lists.
2. Each imported row is a **data-table row**:
   - **Far left:** checkmark column (`GridRowCheckbox`), square matching the row/gutter.
   - **Far right:** green **approve** check and **reject** X, **same width and height as each other and as the left check**.
3. Operator can **approve** and **unapprove** because this source is a human sheet, not an API connector. Approve accepts the sheet row into intake (still caged until G1–G3). Reject keeps it out of live To-ship.
4. **Row enter:** imported rows **insert into the middle of the table body**. Existing rows make room. Motion is **guided by Motion+ MCP**, implemented through house wrappers (below).
5. Compose existing sync + grid. No second create-order engine, no second grid family, no new floor chrome or keybinds.

### Out

- Full Order Intake & Acknowledgment form (identity inference, parcel, Buy label, assignment, Release).
- CYC-72 column model / facets / Must-ship KPI.
- Paperwork walk / Labels CTA.
- Auto-release the way Ecwid / eBay / Zoho API ingest does.
- New `PRODUCT_TABLES` peer or a forked `OrdersQueueTableRow`.
- Station floor, `StationComposerHost`, new keybinds.
- Feature-file imports of `motion-plus` / `@motionplus/*` / `framer-motion`.
- Chrome tweens (`height` / `width` / `top` / `left` on header, KPI, dialog frame).
- Fly-in overlay, toast-as-row, or dialog-only results as the import motion.

---

## 2 · Operator target (verbatim, mapped)

| Operator said | This plan |
|---|---|
| Sync Google Sheets, display the table of synced orders | Land `useOrdersSync` / `TransferOrderDetails` buckets onto the **LedgerGrid body** |
| Inline data table triage board | `CsvImportStagingHost` + `LedgerGrid` + `CsvImportStagingGridRow` pattern |
| Manual sheet, not API — approve / unapprove | Row actions; stay caged until approve; unapprove while still caged |
| Checkmark far left; green check + X far right; matching squares | Left `GridRowCheckbox`; right two icon buttons, same box as the left check |
| Imported with animation, into the middle of the table | Motion+ MCP list-insert; `DenseList` / `layout` so siblings make room **in the grid** |

---

## 3 · Locked decisions

| Decision | Choice |
|---|---|
| Host | Existing To-ship ingest / staging grid — **not** a new page |
| Sync job | Keep `google-sheets-transfer-orders` + `useOrdersSync`. Do not replace the job. **Surface** `inserted` (and still-caged updated) rows on the grid. |
| Dialog | `OrderSyncDialog` may keep progress / errors. It is **not** the only results surface. |
| Left column | `GridRowCheckbox` (`flush` or `sheets`) |
| Right actions | Two squares: approve (green check) + reject (X). Hit size = left check. |
| Status language | `TableImportTriageStatusCell` stays Ready / action-required. Approve/reject are **actions**, not a third status vocab. |
| Motion guide | **Motion+ MCP first** (`https://mcp.motion.dev/plus`): `search-motion-docs` then `search-motion-source` for React `AnimatePresence`, `layout`, `stagger`, list insert. `open-transition-editor` optional. Public Motion MCP is docs fallback if Plus is unsigned — **do not skip search**. |
| Motion implement | `@/design-system/motion` only: `DenseList` / `DenseListItem`, `LayoutGroup`, `StaggerReveal` / `staggerRevealRiseItem`, `AnimatedCheck`. `springSnappy`. No overshoot. |
| Motion+ package | `@/design-system/motion/plus` is `AnimateNumber` only. Feature files never import `motion-plus`. |
| Reduced motion | Final positions / marks. No draw, no layout travel. |
| Tenancy | `organizationId` from `withAuth` only |
| Design MCP | `ds_contract` + `ds_tokens` before any new `src/**/*.tsx` |

> **Superseded row — Host.** §2 and the Host row above were written when the
> sheet board was going to be `CsvImportStagingHost`. The gutter-overlay
> execution prompt replaced that, and it is what shipped: sheet-origin rows stay
> on `UnshippedTable` and the ✓/✕ ride the stage gutter. `DashboardOrdersView`
> now paints `CsvImportStagingHost` only for a **file** CSV draft
> (`csvDraft.origin !== SHEET_TRIAGE_ORIGIN`) — a hand-rolled second grid for
> the sheet origin is refused. Read the rest of §2/§3 for grammar (equal
> squares, approve/unapprove, caged-until-approve); read the execution prompt
> for the host.

---

## 4 · File leases (this ship)

Read first, write only what this scope needs:

| Path | Role |
|---|---|
| `src/hooks/useOrdersSync.ts` | NDJSON sync; details buckets |
| `src/lib/orders-sync/types.ts` | `TransferOrderDetail` / `TransferOrderDetails` |
| `src/lib/jobs/google-sheets-transfer-orders.ts` | Job — **read**; do not rewrite |
| `src/components/sidebar/OrderSyncDialog.tsx` | Progress only; stop being the sole list |
| `src/components/outbound/orders/OrderIngestRail.tsx` | Where sync panel mounts |
| `src/components/outbound/orders/CsvImportStagingHost.tsx` | Bulk grid host to compose |
| `src/components/outbound/orders/import-staging/CsvImportStagingGridRow.tsx` | Row anatomy |
| `src/components/ui/GridRowCheckbox.tsx` | Left check |
| `src/components/ui/AnimatedCheck.tsx` | Left-mark enter |
| `src/design-system/motion/DenseList.tsx` | List insert / sibling layout |
| `src/design-system/primitives/StaggerReveal.tsx` | Cascade + later individual enter |
| `src/design-system/motion/index.ts` | Legal motion barrel |
| `src/lib/orders-sync/sheets-inline-triage.test.ts` | **New** behavior test (predicate) |

Do not lease CYC-72 `ORDERS_QUEUE_COLUMNS`, `ToShipWmsShell` tabs, `ExceptionEditor`, Buy label, or station workspaces.

---

## 5 · Phases

| Phase | Deliverable | Gate |
|---|---|---|
| **0** | Motion+ MCP: search + read resources for list insert / layout / stagger. Write the chosen APIs + house wrappers into this plan's session notes (do not invent). | MCP called; no feature `motion-plus` import |
| **1** | Map `TransferOrderDetails.inserted` (and still-caged sheet updates) onto the staging LedgerGrid. Dialog is no longer the only list. | Rows visible in grid after sync |
| **2** | Row chrome: left check; right approve + reject, equal squares. Approve / unapprove on caged sheet rows. | Click approve ≠ auto-release; unapprove works |
| **3** | Row enter into **table body**: `DenseList` / `LayoutGroup` / `StaggerReveal` / `AnimatedCheck` per Phase 0. Existing rows make room. Reduced-motion snap. | No chrome tween; no overlay fly-in |
| **4** | `src/lib/orders-sync/sheets-inline-triage.test.ts` + `verify:fast` | Host predicates green |

Stop at Phase 4. Do not open acknowledgment, paperwork, or CYC-72 inside this plan.

---

## 5a · Phase 0 session notes — what the motion search returned, and what shipped

**MCP called:** `search-motion-docs` (react) for `AnimatePresence list insert layout
siblings make room stagger` and for `layout animation LayoutGroup`. The Motion+
server (`search-motion-source`) is **not signed in on this editor**, so example
SOURCE was withheld; the free results named the API set to build on — `layout` /
`layoutDependency`, `LayoutGroup`, `AnimatePresence`, `staggerChildren` — and
matching Motion+ examples were disclosed, not reconstructed.

**The constraint the docs do not cover, and the one design decision it forced.**
`LedgerGrid` bodies are WINDOWED: `VirtualGroupedSections` renders one wrapper
per visible item and gives each `position: absolute; top: <measured>` (never
`translateY` — a transform there breaks the sticky-left frozen pane). So there
is no shared parent element that can own a `staggerChildren` timeline, and no
`<ul>` whose children are the rows — `DenseList` / `DenseListItem` and
`StaggerReveal` / `StaggerRevealItem` both assume a container that drives its
children. Rebuilding the body as one non-virtualized list to satisfy the wrapper
shape would trade a staging draft's windowing for an animation.

**What shipped instead:** `StaggerRevealRow` — added beside the existing wrappers
in `src/design-system/primitives/StaggerReveal.tsx`, the virtualized twin of
`StaggerRevealItem`. It drives `staggerRevealRiseItem`'s own `hidden → show`
itself (no new variant values, so nothing drifts) and carries
`layout="position"` + `springSnappy`, which is what turns the window's `top`
recalculation into a spring. `LayoutGroup` wraps the grid in
`CsvImportStagingHost` so every row's displacement resolves in one batch.
`AnimatedCheck` is the approve mark. Nothing outside
`src/design-system/motion/**` names a motion package; feature files import
`@/design-system/motion`.

**Row identity was the load-bearing prerequisite.** A batch splices into the
middle, which renumbers every row below the seam — so an index-derived React key
remounted exactly the rows that were supposed to visibly make room.
`TableImportDraft.rowIds` (minted on load, spliced on insert, compacted on
discard) is what the grid keys on now.

**Reduced motion:** `layout={false}` + `initial={false}`, verified in-browser
with `prefers-reduced-motion: reduce` — rows are at final `y`, `opacity: 1`,
`transform: none` on first paint, and a mid-board splice lands with zero travel.

**Geometry note (operator "far right").** The decision gutter is the LAST track,
behind `_fill`. A fixed 4rem track in front of the sole `1fr` ends where the
facts end — measured 276px shy of the row's right edge on a 1600px desk — and
`position: sticky` cannot fix it (sticky clamps inside the scrollport; it never
pushes an element past its static position). Measured after the change: row
right edge 1164, reject square right edge 1164, and all three squares 32×28.

---

## 6 · Done — measured 2026-09-03

Both host predicates from
[`sheets-sync-inline-triage.goal.json`](../eval/goals/sheets-sync-inline-triage.goal.json)
are green on the working tree:

| Predicate | Command | Result |
|---|---|---|
| `test` | `node --import tsx --test src/lib/orders-sync/sheets-inline-triage.test.ts` | **23 pass / 0 fail**, 7 suites |
| `eval` | `node scripts/verify.mjs --fast` | **exit 0** — Lint ✓, Typecheck ✓ |

Scope items, as shipped:

- Sync Google Sheet → triage board rows in the **middle of the LedgerGrid**
  (`rows enter the MIDDLE of the body` suite: splices a board rather than
  appending, a second sync splices between rows already there, and selection +
  verdicts survive the seam).
- Left check + right equal-square approve/reject — the decision gutter is the
  LAST track, is exactly two checkmark squares wide, and never offers
  click-to-sort (`SLOT_TABLE_PAINT_LAW` chrome, not a DATA header).
- Motion+ MCP guided the enter; house wrappers implemented it. `StaggerRevealRow`
  (the virtualized twin of `StaggerRevealItem`) + `LayoutGroup` on the grid; no
  feature file names a motion package.
- Manual approve / unapprove; API connectors unchanged. Unapprove returns a row
  to **undecided**, not rejected; only approved *and* Ready rows commit.

**Files this ship owns** (all still uncommitted):

| Path | State |
|---|---|
| `src/lib/orders-sync/sheets-inline-triage.ts` | new — `SHEET_TRIAGE_ORIGIN`, splice + verdict engine |
| `src/lib/orders-sync/sheets-inline-triage.test.ts` | new — the host predicate |
| `src/components/outbound/orders/OrderImportRecordsHost.tsx` | new — `?imports` records body |
| `src/components/outbound/orders/import-staging/ImportDecisionSquare.tsx` | new — the approve / reject square |
| `src/design-system/primitives/StaggerReveal.tsx` | `StaggerRevealRow` added beside the existing wrappers |
| `src/lib/tables/import/staging-store.ts` | `rowIds` minted / spliced / compacted |
| `src/components/outbound/orders/CsvImportStagingHost.tsx` | `LayoutGroup`, row keys, decision board mode |
| `src/components/outbound/orders/import-staging/CsvImportStagingGridRow.tsx` | `csvImportStagingRowKey` |
| `src/components/outbound/orders/import-staging/csv-import-staging-grid-layout.ts` | decision gutter track |
| `src/components/outbound/orders/CsvImportStagingRail.tsx` | rail wiring |
| `src/components/dashboard/DashboardOrdersView.tsx` | body swap — sheet origin stays on `UnshippedTable` |
| `src/lib/tables/field-catalog/orders-import.test.ts` | catalog regression |

**One repair was needed to turn the `eval` predicate green.** The desk body swap
guarded with `Boolean(csvDraft) && csvDraft.origin !== SHEET_TRIAGE_ORIGIN` —
`Boolean(...)` is a call, so it does not narrow `TableImportDraft | null`, and
typecheck failed `TS18047: 'csvDraft' is possibly 'null'` at
[`DashboardOrdersView.tsx:67`](../../src/components/dashboard/DashboardOrdersView.tsx#L67).
Narrowed to `csvDraft !== null && …`; the guard's meaning is unchanged (a null
draft must not paint staging, and `csvDraft?.origin !== …` would have inverted
that). `verify:fast` exit 0 after.

**No cohort eval is owed by this ship.** It touches no slot-table engine file —
not `slot-table-cohort.ts`, `CompoundItem`, `queueSortForColumnKey`, or
`LedgerGridColumnHeader`. (Those show modified in this shared tree from the
concurrent line-qty lane, which is not this plan.)

## 6a · The gutter overlay — shipped and measured in the app 2026-09-03

The execution prompt's display law is now actually wired. Before this, sheet
sync landed a draft that **nothing painted**: `DashboardOrdersView` refuses
`CsvImportStagingHost` for `SHEET_TRIAGE_ORIGIN`, and no gutter surface existed
yet, so the rows went to a board with no reader.

| File | State |
|---|---|
| `src/components/outbound/orders/SheetTriageGutterOverlay.tsx` | new — the ✓/✕ layer (176 lines incl. a 27-line header) |
| `src/components/outbound/orders/import-staging/ImportDecisionSquare.tsx` | `sizeClass` prop — the desk passes `w-12` (48px) so its squares match the LIVE row box, not the staging board's `w-8` |
| `src/components/dashboard/DashboardOrdersView.tsx` | mounts the overlay on the caged facet; desk body carries the ref |
| `src/hooks/useOrdersSync.ts` | desk opens on the SHEET connector alone |

**Paint timing.** `handleTransfer` did `Promise.all(sheets, ecwid)` and then
awaited the exceptions NDJSON stream before opening the desk, so rows that were
already written sat behind a spinner for two unrelated jobs. Sheets and Ecwid
still start together, but the desk now opens the moment the sheet POST settles;
Ecwid and exceptions continue behind the open table and land through the query
invalidation `runConnectorSync` already fired.

**Measured in the running app** (`:3050`, 1600×900, minted session, caged desk
with 19 rows):

| Check | Measured |
|---|---|
| Table width vs a normal To-ship visit | **identical** — card left 224 / right 1376 / width 1152 both times |
| Squares outside the card | first square left edge **1384** = card right 1376 + 8px gap |
| Square box | **48×48**, the compound row box (`COMPOUND_ROW_PX`) |
| Row alignment | **drift 0** on every pair |
| Scroll-sync | scrolled 300px then 800px — **drift 0 at both**, pair count 13 → 15 as rows entered the window |
| Approve / unapprove | `data-decision-state` off → **on** → **off** on repeat presses |
| Overlay off the caged facet | absent on a plain `?unshipped=` visit |

**One real bug was found by running it, not by reading it.** The overlay painted
nothing at first. The rAF throttle keeps its handle in a ref, and the effect
cleanup cancelled the frame without clearing that ref — so after React's
double-invoke the handle stayed non-null and every later `sync()` returned early
as though a measure were already scheduled. The layer never measured again.
Cleanup now clears the handle as well as cancelling it.

**A second defect the screenshot caught.** Clipping to the `[data-cf-grid]`
surface included the column-header band, so a row sliding under the header kept
a 48px square painted beside the header itself. The clip region is now the
scrolling descendant (the box whose top edge is the first data pixel), and a row
only half inside it gets no square at all. Measured after: port top 217 vs the
header at 203, and **0 squares outside the port** at rest and mid-scroll.

**Not measured: the click → first-row time budget.** The prompt's ≤300ms /
≤2.5s beats need a real Google Sheets import fired against the live integration,
which writes orders — not something to trigger unasked. The code path that
gated it is fixed and reviewable above; the stopwatch run is still owed.

**Evals:** `verify:fast` exit 0 · `sheets-inline-triage.test.ts` 23/23 ·
`eval:cohort slot-table` ok (tripwire true — the overlay is not a second table)
· `eval:cohort shortcuts` ok.

## 7 · STOP

Do not expand. If the next job is Release / parcel / buy / paperwork, that is another plan.
