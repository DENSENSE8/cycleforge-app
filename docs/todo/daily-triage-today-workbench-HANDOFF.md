# Handoff — Today workbench (`/`) after the F0 rebuild

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · lane: `main` (WS-DOGFOOD) · surface: `/` (Home → Today).
**Plan of record:** [`daily-triage-FRONTEND-PLAN-VALIDATION.md`](./daily-triage-FRONTEND-PLAN-VALIDATION.md)
**Superseded:** [`daily-triage-frontend-F0-EXECUTION-PROMPT.md`](./daily-triage-frontend-F0-EXECUTION-PROMPT.md) — F0 is done; that prompt describes the rejected first attempt.

---

You are Claude Code in the Cycle Forge monorepo with **fresh context**. Home → Today
(`/`, the `MyDayWorkspace` region) was rebuilt on 2026-08-01 onto the house SoT shells.
This handoff is the state of that surface plus the decisions still open on it.

## What the surface is now (read this before touching anything)

Today is a **Workbench** (`.claude/rules/display/workbench.md`): chrome band with lane
tabs → spreadsheet → non-modal right-rail inspector. There is **no sidebar** and Home has
**no page header**.

| Region | House SoT it composes | File |
|---|---|---|
| Chrome + facets | `WorkbenchChromeHeader` `density="band"` — tabs `All · Do next · Assigned to me · Needs attention` (with counts); queue doors in the `right` slot | `src/features/my-day/MyDayWorkspace.tsx` |
| Collection map | `LedgerGridSurface` + `GridSurfaceDescriptor` | `src/features/my-day/grid/MyDayGridView.tsx` (+ `MyDayGridColumnHeader`, `MyDayGridRow`, `my-day-grid-descriptor`) |
| Record plane | `RightRailHost` via `useRegisterRightPanel`, `modal={false}`, **stable** id `detail:my-day` | `src/features/my-day/MyDayTaskInspector.tsx` |
| Read model | feed → one flat row type (pure; no React, no fetch) | `src/lib/my-day/my-day-tasks.ts` |
| Column model | house column SoT + shared grid geometry | `src/lib/my-day/my-day-grid-layout.ts` |
| URL view state | `?scope=` lane · `?task=` selection (both already owned by the `/` spec) + carried `?colsort=`/`?coldir=` | `src/features/my-day/useMyDayView.ts` |
| Feed | unchanged — the one client of `GET /api/my-day` | `src/features/my-day/useMyDayFeed.ts` |

Home's six L2 modes (Today · Inbox · Tasks · Collab · Plan · Brief) live in
`SIDEBAR_PAGE_NAV` (`src/lib/sidebar-navigation.ts`) and render in the **GlobalHeader**
mode switcher. `useHomeMode` reads only — the header owns the write path.

## Hard rules for this surface (each one is a mistake already made here)

1. **Compose the shell; never lift its markup.** F0's first attempt moved a hand-rolled
   380px `<button>` column and a hand-rolled detail pane into new files and called it an
   extraction. A fork under a new filename is still a fork. If you need a picker, a table,
   a card, or a right panel, it already exists in `@/components/layout/SidebarShell`,
   `@/design-system/components/grid`, `@/design-system/primitives`, `RightRailHost`.
2. **A facet over the table on screen belongs in the table's chrome**, not a resident
   column. That is what killed the lane sidebar; do not bring one back to hold a filter.
3. **Queue counts are chrome, not a rollup.** They are doors to other pages with a number
   on them. They were briefly `KpiStrip` tiles; a KPI hero claims "this is a metric worth
   reading", which overstates them. They live in the chrome `right` slot.
4. **L2 modes live in GlobalHeader.** Never remount a full-width mode rail on the page.
5. **The inspector id stays `detail:my-day`** — stable, not per-record, because row→row is
   the loop (`display/motion-crossfade.md`). It is pure display today, which is what makes
   the stable id safe; if you give it a draft/editor, you must flush the OUTGOING record
   before the swap.
6. **Capabilities are declared, never inferred.** `MY_DAY_GRID_CAPABILITIES` is all
   `false`. Changing any flag means changing the guard entries too (below).
7. **Never raise a ratchet baseline** to land anything (`.claude/rules/verify.md`).

## Registration a grid family owes (already done — mirror it if you add another)

- `src/lib/tables/grid-surface-capabilities.guard.test.ts` → `DECLARED_CAPABILITIES['my-day']`,
  `MOUNTS['src/features/my-day/grid/MyDayGridView.tsx']`, and a descriptor-carries-caps
  assertion. The guard **walks every `<LedgerGrid`/`<LedgerGridSurface` mount off disk**, so
  an unregistered mount fails.
- `src/lib/tables/grid-column-tier.guard.test.ts` → `FAMILIES['my-day']` (frozen pane must
  be a contiguous prefix starting at `select`; frozen columns carry no `hideKey`/`tier`).

**Chrome parity (saved views · search · trailing controls · KPI) has its own prompt:**
[`daily-triage-today-chrome-parity-HANDOFF.md`](./daily-triage-today-chrome-parity-HANDOFF.md).
It supersedes items 2 and 3 below, which it folds in as scoped slices.

## Open — pick up in this order

### 1. E2E coverage (the real gap)

The rebuild was verified with throwaway Playwright scripts that stub `GET /api/my-day`;
**nothing is committed**, so a regression here is currently silent. Plan phase F6 asks for
this. Write `tests/e2e/my-day-today.spec.ts` against the **QA org** (`--project=qa-desktop`,
`pnpm provision:qa-org` first — `.claude/rules/verify.md`), asserting the invariants that
were checked by hand:

- lane tab → `?scope=`, and the row count changes with it
- row click → `?task=`, inspector is `role="region"` (**never** `role="dialog"`)
- column header → `?colsort=`, and a pasted deep-link reproduces lane + selection + `aria-sort`
- selected row carries the selected fill at the **same height** as its siblings
- queue link in the chrome navigates to that queue's page

Use `e2e-spec-writer` if it helps. Seed what the spec needs by extending the QA fixtures —
do not `test.skip` around missing data.

### 2. Fields menu — decide, don't drift

Today ships every column `core` with `fieldsMenu: false` and passes **no `tableId`** to
`useGridColumnVisibility`, because `TableId` is the Fields-menu vocabulary
(`TABLE_COLUMNS` in `src/lib/tables/table-columns.ts`) and registering one would claim a
staff-preference surface that does not exist. To add per-staff columns: add the `TableId`,
add its `TABLE_COLUMNS` entry, give the fact columns `hideKey` + `tier`, flip
`fieldsMenu: true` in the capabilities bag **and its guard entry**, mount `GridFieldsMenu`
via `WorkbenchTrailingCluster` in the chrome `trailing` slot. All of it or none of it.

### 3. Inspector occlusion (needs a call, not a patch)

At 1440px the floating inspector covers the `Due`/`Status` tracks. This is the house
contract (navigators push, inspectors float) and matches the dashboard order inspector,
where push was already **declined on the merits** — so do not "fix" it by pushing the grid
without re-opening that decision. Options if it is raised: narrower inspector, a collapse
strip, or fewer columns.

### 4. OQ1 — Dashboard / Unbox mounts (blocked on an operator answer)

`// TODO(daily-triage F0→F1)` markers sit in
`src/components/sidebar/DashboardOrdersContextPanel.tsx` and
`src/components/receiving/workspace/LineEditPanel.tsx`. **Do not wire either without an
answer.** Unbox has no free slot at all (left column holds the Queue/Viewed/History rail;
the right edge is a mutually-exclusive push stack), so mounting there means evicting an
occupant or adding a region. Dashboard is two distinct candidates — the left
`ContextPanelLayout` or the right `RightRailHost` `detail:order` occupant.

### 5. F1 — the categorized board (blocked on backend)

`grep -rn "TriageRow\|TriageTask" src` returns nothing: there is no `category` / `open` /
`done` to build on until backend B0–B3 land. When they do, **`myDayTasksFromFeed` is the
single place that changes** — it is already the client-side flattening the plan's amended
F1 note describes. Do not invent placeholder categories in the meantime.

## Verification recipe

```bash
npm run verify
```

Must be green before you claim done. Note the tree often holds **other sessions'
in-flight work** — run the failing gate against your own files before assuming a red is
yours, and report pre-existing failures rather than fixing or inheriting them.

For visual checks: the operator's dev server is **already running on `:3050`** — attach to
it (Browser pane, or Playwright with `storageState: 'tests/.auth/admin.json'`). **Never
start, restart, or kill a dev server.** A stubbed feed is the only practical way to see all
four lanes populated; the dogfood admin's real feed usually has queue cards only.

## Non-goals

Backend `TriageRow` / feed changes · pin-tracking or messaging UI (F2/F3) · mobile
`/m/home` · a second Home mode rail · any new page-local card, list, or table shell.
