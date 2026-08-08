# HANDOFF — finish burning the `*GridView` forest (Receiving + Orders)

**Self-contained prompt.** A fresh session can execute this with no other context.
Finishes the `*GridView.tsx` wrapper deletion started under
[`nonlinear-table-burn-forest-and-ratchet-HANDOFF.md`](nonlinear-table-burn-forest-and-ratchet-HANDOFF.md)
/ auto-memory `nonlinear-table-registry-waist.md`.

**Lane:** `topic/tables` · worktree `../cycleforge-tables` (WS-TABLES · `:3150`).
**Branch tip when written:** `db3fd90c6`.

---

## Verified state (2026-08-08)

- **12 of 14 `*GridView.tsx` wrappers burned + committed** on `topic/tables`. Each page/table now
  mounts `NonlinearTableHost` directly; the freeze allowlist (`GRID_VIEW_FOREST` in
  `src/lib/tables/grid-surface-capabilities.guard.test.ts`) is down **14 → 2**.
  Commits: Catalog `98fec9cff` · Warranty `b756fa97e` · Ready `d1fbc838b` · Unfound `dd0a19ad8` ·
  Pickup `a2e30d60b` · TechAll `742292547` · TrackingExceptions `17fa12b8e` · MyDay `4c1dcd633` ·
  Bins `8e82448ed` · Repair `a074b6dff` · ReviewCatalogLink `c1fd4f153` · Incoming `db3fd90c6`.
- **2 wrappers remain in `GRID_VIEW_FOREST`:**
  `src/components/dashboard/orders-queue/OrdersGridView.tsx` and
  `src/components/station/receiving-grid/ReceivingGridView.tsx`.
- **Anti-regrowth ratchet** (`3e522a690`, the `GRID_VIEW_FOREST` freeze) is on `topic/tables`,
  NOT `main`. It lands with these last two once the push unblocks.

**Directive that shapes this handoff (user, 2026-08-08):** *keep the tabs, delete the table imports.*
Both remaining wrappers are **shared** across many consumers. **Do NOT delete any product surface**
(no removing Unbox Queue/Recent/All/History tabs, no removing Drill/Compare/Testing displays). The
job is ONLY to delete the two wrapper FILES and have each consumer mount the host directly, keeping
every consumer/tab/layout working exactly as today. It is still dogfood, so a brief break while
iterating is fine — but the END state preserves all displays.

---

## The clean approach (no N× duplication)

These two are NOT single-importer clones like the 12 already burned — they are **shared adapters
with many mounts**. Copy-pasting the ~120–380-line adapter into every consumer is a fork, not a
simplification. The clean burn:

1. **Extract the wrapper body into a shared HOOK** in a NON-`*GridView` file (so it leaves the frozen
   forest), e.g. `receiving-grid/use-receiving-grid-host.tsx` / `orders-queue/use-orders-grid-host.tsx`.
   The hook takes the same args the wrapper's props took and returns the object of props +
   render callbacks that go to `<NonlinearTableHost>` (`orderGroupsByDate`, `rows`, `sort`, `dir`,
   `onSortChange`, `renderColumnHeader`, `renderGroup`, `renderRow`, `columnTriggerPortalTarget`, …).
   Type the return against `NonlinearTableHostProps<Row, K, C>` (the interface in
   `src/components/tables/NonlinearTableHost.tsx`) so consumers can spread it.
2. **Delete the `*GridView.tsx` file.**
3. **Each consumer** replaces `<XGridView {...props} />` with
   `<NonlinearTableHost<Row, K, C> binding={X_TABLE_BINDING} {...useXGridHost(props)} />`.
   (`binding` is stable; everything else comes from the hook.)
4. **Shrink `GRID_VIEW_FOREST`** by that one file, and re-point every guard (checklist below).

The heavy domain logic already lives OUTSIDE the wrappers — keep it there, never copy it:
- Receiving comparator: `src/lib/receiving/receiving-grid-compare.ts` (`compareReceivingGridRows`).
- Orders plane hook: `src/components/dashboard/orders-queue/useOrdersQueuePlane.ts` — **encodes ≥4
  documented race bug-fixes; it MUST stay one shared hook, never duplicated.**

---

## Wrapper 13 — ReceivingGridView (4 consumers)

`src/components/station/receiving-grid/ReceivingGridView.tsx` (~120-line body; 30+ props incl.
controlled-sort for compare panes, `useGridColumnDisplay` / `useGridRowFills` /
`useCapabilityProviderLabel`, the PO-fold / day-band memo, and the header + group-row renderers).

**4 JSX mounts — all must keep working:**
| Consumer | Line | Notes |
|---|---|---|
| `src/components/station/ReceivingLinesTable.tsx` | ~616 | serves Unbox Queue/Recent/All/History via mode. **Already hosts the Incoming grid inline** — adding Receiving's `useUrlColumnSort` here makes a 2nd always-live sort hook over `?colsort=`; benign (disjoint `isReceivingGridSortable` guard, mode clears the param), same pattern as ReviewCatalogLink. |
| `src/components/station/receiving-grid/ReceivingDrillHost.tsx` | ~301 | History Drill dual-pane — passes controlled sort. |
| `src/components/receiving/unbox/compare/ReceivingPaneTable.tsx` | ~214 | Unbox Compare panes — controlled sort + crosshair. |
| `src/components/tech/TestingHistoryList.tsx` | ~314 | Testing History — `daySections` feed, `tableId="testing"`, `showDayHeaders`. |

**Guards to re-point (grep ALL tests for the path first — see checklist):**
`grid-surface-capabilities.guard.test.ts` (MOUNTS key + `GRID_VIEW_FOREST` entry) ·
`workbench-trailing-cluster.guard.test.ts` (`COLUMN_DISPLAY_SURFACES` pair:
`ReceivingGridColumnHeader` / the file that now mounts the host) ·
`src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts` (reads the wrapper —
re-point its `read(...)` at the mount file; it asserts the host mount + no `<LedgerGridSurface`).
Watch for surviving `{@link ReceivingGridView}` comments in `receiving-grid-descriptor.ts` etc.

---

## Wrapper 14 — OrdersGridView (9 consumers) — do LAST

`src/components/dashboard/orders-queue/OrdersGridView.tsx` (~380 lines; delegates to
`useOrdersQueuePlane`). **Keep the `OrdersQueueColumnHeader` fork allowlisted** — it is a permanent
sanctioned exception (resize + viewport force-hide), NOT part of the forest.

**9 JSX mounts:** `ReviewPackingTable` · `ReviewPairingTable` · `UnshippedShelfBoard` ·
`PackedOrdersTable` · `DashboardShippedTable` · `StagedQueueTable` · `LabelsQueueTable` ·
`OrdersDrillHost` · `OrdersPaneTable` (all import from `@/components/dashboard/orders-queue/OrdersGridView`).

Extract `useOrdersGridHost` composing `useOrdersQueuePlane` + the group memo + renderers; each of the
9 consumers mounts `<NonlinearTableHost … {...useOrdersGridHost(props)} />`. Preserve every consumer's
prop surface (the memory notes 9 consumers with a stable props API + documented bug-fixes — do not
regress them). Guards: `grid-surface-capabilities.guard.test.ts` (MOUNTS + forest) ·
`workbench-trailing-cluster.guard.test.ts` (Orders pair) · `dashboard-orders-sheet.guard.test.ts`
(clickSelect / sheet assertions) · `grid-view-plumbing.guard.test.ts`.

---

## Per-wrapper checklist (proven on the 12)

1. Read the wrapper + every JSX consumer; confirm the prop each passes.
2. Extract the shared hook; delete the `*GridView.tsx`.
3. Migrate every consumer to `<NonlinearTableHost … {...hook(...)} />` (grid hooks stay unconditional —
   above any early `return`; watch React rules-of-hooks).
4. **`grep -rn "<path>" src --include='*.test.ts'`** and re-point EVERY guard that names the file —
   the named "table guard set" is a SUBSET and missed `workbench-trailing-cluster` on the 1st burn.
   Also fix surviving `{@link XGridView}` comments in descriptors / headers.
5. Verify (this branch has NO green `npm run verify` — main is FBA-red, see below — so use):
   - **tsc-no-new-erroring-files:** `npx tsc --noEmit -p tsconfig.json`, and assert the set of
     erroring FILES does not grow beyond the 7-file baseline (all unbox/station-displays, NOT yours):
     `TriagePanel · LineEditPanel · UnboxDisplaysUtilityRailBody · PhotosDisplayHost ·
     useUnboxDisplayView · StationDisplaysPushColumn · TestingPanel`.
   - **guard set green:**
     ```bash
     npx tsx --test \
       src/lib/tables/grid-surface-capabilities.guard.test.ts \
       src/lib/tables/table-definition.test.ts \
       src/components/tables/table-definition-registry.guard.test.ts \
       src/components/dashboard/dashboard-orders-sheet.guard.test.ts \
       src/design-system/components/grid/grid-view-plumbing.guard.test.ts \
       src/components/workbench-cohort-wave7-sheet.guard.test.ts \
       src/features/review/review-workspace-sheet.guard.test.ts \
       src/components/dashboard/workbench-trailing-cluster.guard.test.ts \
       src/components/station/incoming-grid/incoming-grid-sheet.guard.test.ts \
       src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts
     ```
6. **Pathspec-commit only your files** (`git commit -F <msg> -- <explicit paths>`; the `-m` must come
   BEFORE `--`, or use `-F`). NEVER `git add -A` / `git stash` — the shared checkout has concurrent
   dirty files. NEVER `--no-verify`. NEVER raise a guard baseline — `GRID_VIEW_FOREST` only shrinks.

**Runtime blind spot:** tsc + guards catch type/plumbing breaks but NOT behavior (e.g. the dual
always-live `?colsort=` interactions, Drill/Compare selection, per-pane sort). The dev server you can
attach to is `main`'s `:3050`, not this worktree — once the branch is runnable, click-through
Unbox History + Drill + Compare + Testing History and the 9 Orders surfaces.

---

## Exit

`GRID_VIEW_FOREST` is **empty** (0 `*GridView.tsx` on disk); the freeze guard's disk-walk asserts it.
Success metric met: **"a new queue ships without a new `*GridView` file."** Update
`nonlinear-table-registry-waist.md` and `docs/todo/nonlinear-table-burn-forest-and-ratchet-HANDOFF.md`
Phase-B status to DONE.

## Standing blocker (external — not table work)

Committed `main` is RED and cannot be merged into: the FBA lane's `normalizeFnsku` →
`normalizeTrackingCanonical` rename is half-landed (4 importers, no export). Until that lane fixes it
and `main` is green, the ratchet + all 14 burns stay parked on `topic/tables`. When it clears, land
via the plumbing recipe (never in the dirty `main` checkout): `git worktree add --detach /tmp/land
<main-tip>` → `git merge topic/tables` → run the table guard set on the merged tree →
`git update-ref refs/heads/main <M> <old>` (CAS) → push from a clean checkout (pre-push `verify`).

---

## Implementer prompt (≤30 lines)
```
Read docs/todo/nonlinear-table-forest-finish-HANDOFF.md (this file). Work in ../cycleforge-tables
on topic/tables. Finish burning the *GridView forest: only ReceivingGridView (4 consumers) and
OrdersGridView (9 consumers) remain in GRID_VIEW_FOREST.

KEEP every consumer/tab/layout working — do NOT delete any product surface (no removing Unbox
Queue/Recent/All/History tabs, no removing Drill/Compare/Testing displays). Only delete the two
wrapper FILES and have each consumer mount NonlinearTableHost directly.

Clean approach (no N× duplication): extract each wrapper body into a shared HOOK in a non-*GridView
file (useReceivingGridHost / useOrdersGridHost) returning the NonlinearTableHostProps; each consumer
does <NonlinearTableHost binding={X_TABLE_BINDING} {...useXGridHost(props)} />. Keep the heavy domain
logic where it already lives — receiving-grid-compare.ts and useOrdersQueuePlane.ts (bug-fixes;
never copy). OrdersQueueColumnHeader fork stays allowlisted.

Per wrapper: extract hook → delete file → migrate every consumer → grep ALL *.test.ts for the path
and re-point every guard (MOUNTS + GRID_VIEW_FOREST + trailing-cluster COLUMN_DISPLAY_SURFACES +
per-surface *-sheet guards) → fix surviving {@link} comments → verify tsc-no-new-erroring-files
(7-file baseline) + the guard set → pathspec-commit. Do Receiving first, Orders last.

Never --no-verify, never raise a baseline, never git add -A. Nothing merges until main's FBA red
clears; the whole stack lands together via the detached-worktree update-ref recipe.
```
