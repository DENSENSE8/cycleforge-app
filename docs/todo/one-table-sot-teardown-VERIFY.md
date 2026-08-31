# VERIFY — did the one-table teardown actually delete everything?

**Paste everything below the line into a fresh agent session in this repo.**
It is self-contained: it names no prior conversation and assumes nothing.

---

You are verifying a completed refactor. Your job is to **find what survived**, not
to confirm that it worked. Assume the report below is wrong until each claim
fails to break under a command you ran yourself.

## What was supposedly done

`docs/todo/one-table-sot-teardown-HANDOFF.md` instructed a full deletion of the
table DISPLAY layer, followed by a rebuild as one component. The work landed in
commit `14fc42d86` (318 files, +2,863 / −23,789). Read the handoff first — its
§4 is the delete list and its §9 is the definition of done.

The claim is:

- `src/components/sheet/`, the `workbench-shell` bands, every `*WorkspaceHeader` /
  `*ChromeActions` / `*TriageBand`, the grid's interactive layer (in-cell
  editors, drag-resize, column context menu, drill + compare hosts, per-staff
  column visibility, persisted widths, zoom), the column-formats feature, the
  station docks, the density toggle, and all 18 generated column-header forks
  are **gone**.
- One component — `src/components/tables/DataTable.tsx` — now draws every
  binding-backed table's search field, filter control, column header and status
  strip, from **data**, with no `ReactNode` chrome slots and no
  `renderColumnHeader` prop.
- `npm run verify` and `npm run build` are green.

## Rules

1. **Run the commands. Do not reason from the diff or from file names.** A
   symbol can survive in a docblock, a test, a script, an e2e spec, or a doc.
2. **Absence of a file is not absence of the feature.** A deleted component
   whose behaviour was inlined somewhere else is a survival, not a deletion.
3. **Report what you find, including nothing.** "All clear" is a valid verdict
   if you can show the commands that would have caught a miss.
4. Do not fix anything. Do not commit, stage, or `git checkout` any file — other
   sessions have uncommitted work in this checkout. Verify only.
5. This repo runs on `pnpm` (`packageManager: pnpm@11.5.1`). If `node_modules`
   is empty, `npx --yes pnpm@11.5.1 install --frozen-lockfile`. `npm ci` will
   fail — `package-lock.json` is stale and not the real lockfile.

---

## A. The delete list is actually deleted

Every path below must be **absent**. Anything printed is a failure.

```bash
for p in \
  src/components/sheet \
  src/components/dashboard/workbench-shell.tsx \
  src/components/dashboard/WorkbenchSheetView.tsx \
  src/components/dashboard/workbench-filter-popover.tsx \
  src/components/dashboard/workbench-band-control.tsx \
  src/components/dashboard/workbench-inspector-toggle.tsx \
  src/components/dashboard/workbench-chrome-cube.tsx \
  src/components/dashboard/useOutboundSheetChrome.tsx \
  src/components/dashboard/OutboundFilterStrip.tsx \
  src/components/dashboard/OutboundOrderChromeActions.tsx \
  src/components/dashboard/QueueSortSwitch.tsx \
  src/components/dashboard/queue-table \
  src/components/packing/PackBenchRefineFacet.tsx \
  src/components/sidebar/tech/TechRailSearchBar.tsx \
  src/components/ui/table-options src/components/ui/table-density \
  src/components/ui/table-column-config \
  src/lib/tables/table-density.ts src/hooks/useTableDensity.ts \
  src/design-system/components/grid/LedgerCellEditor.tsx \
  src/design-system/components/grid/ColumnResizeHandle.tsx \
  src/design-system/components/grid/LedgerGridColumnContextMenu.tsx \
  src/design-system/components/grid/LedgerDrillHost.tsx \
  src/design-system/components/grid/LedgerDrillParentMap.tsx \
  src/design-system/components/grid/GridColumnDetailsTrigger.tsx \
  src/design-system/components/grid/useGridColumnVisibility.ts \
  src/design-system/components/grid/grid-zoom.ts \
  src/design-system/components/grid/grid-column-resize-edges.ts \
  src/lib/tables/column-formats.ts src/lib/tables/column-formats-queries.ts \
  'src/app/api/tables/[tableId]/column-formats' \
  src/components/station/StationDeck.tsx \
  src/components/station/StationHistoryDock.tsx \
  src/components/station/ShippingHistoryDock.tsx \
  src/components/station/PackHistoryDock.tsx \
  src/components/station/UnboxHistoryDock.tsx \
  src/components/receiving/unbox/compare \
; do [ -e "$p" ] && echo "SURVIVED: $p"; done; echo "— end —"
```

Then the two pattern sweeps:

```bash
find src/components -name '*WorkspaceHeader.tsx' -o -name '*ChromeActions.tsx' -o -name '*TriageBand*'
```

The `find` must print nothing.

Now split the symbol sweep into the two things it actually measures — a live
reference and a stale sentence are different failures.

**A.3a — live code references. This is a hard gate: expect ZERO.**

```bash
grep -rnE "^[^:]+:[0-9]+:[[:space:]]*(import|export).*(WorkbenchChromeHeader|WorkbenchTriageBand|WorkbenchSheetView|TechRailSearchBar|LedgerCellEditor|StationDeck|OrdersDrillHost|UnboxCompareHost|workbench-shell)" src --include=*.ts --include=*.tsx
grep -rnE "<(WorkbenchChromeHeader|WorkbenchTriageBand|WorkbenchSheetView|TechRailSearchBar|LedgerCellEditor|StationDeck|OrdersDrillHost|UnboxCompareHost)\b" src --include=*.tsx
```

Any hit is a survivor — the teardown did not finish. Report it.

**A.3b — the two symbols § 9 names must not appear AT ALL, prose included.**

```bash
grep -rn "WorkbenchChromeHeader\|WorkbenchTriageBand" src
```

Expect zero lines. This is the handoff's own literal criterion.

**A.3c — stale PROSE naming other deleted components. Known outstanding.**

```bash
for sym in WorkbenchSheetView TechRailSearchBar LedgerCellEditor StationDeck \
           OrdersDrillHost UnboxCompareHost workbench-shell; do
  printf '%s: ' "$sym"
  grep -rn "\b$sym\b" src --include=*.ts --include=*.tsx 2>/dev/null | wc -l
done
```

At the time of writing this totalled **47 lines across ~38 files** — every one a
docblock or comment, none a live reference. These are not build failures; they
are documentation that describes an architecture the codebase no longer has,
which is exactly how the deleted doctrine kept fighting the last refactor.

Your job here is to report the **current** number and whether it moved. If it is
higher than 47, someone added a new stale reference and that is a regression.
Do not fix them; list the files.

## B. The keep list survived

§4.5 named things that must NOT have been deleted. Every path must be present:

```bash
for p in \
  src/design-system/primitives/SearchField.tsx \
  src/design-system/components/grid/LedgerGrid.tsx \
  src/design-system/components/grid/VirtualGroupedSections.tsx \
  src/design-system/components/grid/grid-column-geometry.ts \
  src/design-system/components/grid/grid-cell-chrome.ts \
  src/components/tables/compound \
  src/lib/tables/table-definition.ts \
  src/components/tables/table-surface-binding.ts \
  src/components/tables/registered-bindings.ts \
  src/components/tables/NonlinearTableHost.tsx \
  src/lib/selection src/hooks/useTableSelection.ts \
  src/lib/migrations/2026-08-29_table_column_formats.sql \
; do [ -e "$p" ] || echo "WRONGLY DELETED: $p"; done; echo "— end —"
```

The migration is deliberate: §4.3 says leave `table_column_formats` in the
database. Dropping a table is a separate, irreversible decision. If a `DROP
TABLE table_column_formats` migration appeared, that is a failure.

Then confirm `SearchField` lost exactly the three slots §4.5 named, and nothing
else — these are how a second funnel got inside the find field:

```bash
grep -n "trailingPrefix\|trailingSuffix\|inlineContent" src/design-system/primitives/SearchField.tsx
```

Must print nothing.

## C. There is genuinely ONE table display

```bash
grep -rl "<LedgerGridColumnHeader" src --include=*.tsx
```
Expect exactly two: `components/tables/DataTable.tsx` and
`design-system/components/grid/LedgerGridSurface.tsx` (the latter is the type,
not a second mount — read it and confirm).

```bash
grep -n "renderColumnHeader" src/components/tables/DataTable.tsx
```
Must appear only as the *internal* callback DataTable hands down — **never as a
prop on `DataTableProps`**. Read the interface and confirm. If a page can pass a
header, the fork is back.

```bash
grep -rn "ReactNode" src/components/tables/DataTable.tsx
```
The only `ReactNode` props allowed are `emptyState` / `searchEmptyState` (typed
empties) and the `renderRow` / `renderGroup` return types. Any slot named
`leading`, `right`, `trailing`, `views`, `extraControls`, `searchSlot`, or a
controls portal is a failure — that grab-bag is how thirty desks each drew
something different.

```bash
grep -rl "makeLedgerGridColumnHeader" src --include=*.tsx | grep -v design-system/components/grid
```
Must print nothing (zero generated header forks).

## D. Every surface actually moved onto it

```bash
grep -rln "<NonlinearTableHost" src --include=*.tsx
```
Expect only `components/tables/DataTable.tsx`. Any page mounting the host
directly skipped the rebuild and kept its own chrome.

For each file matching `<DataTable`, confirm the props it passes are **data**
(`search={{value,onChange}}`, `filter={{options,...}}`, `tabs={[...]}`) and not
JSX. Spot-check at least five, including
`src/components/unshipped/UnshippedTable.tsx` (the reference desk).

## E. The four §2 corrections landed on To-ship

Read `src/components/unshipped/useToShipChrome.ts` and
`src/components/tables/DataTable.tsx`, then confirm on the running app if you
can (see §H):

1. **One filter control, outside the field.** There must be exactly one funnel,
   and no way to seat one inside a text input:

   ```bash
   grep -rn 'density="field"' src | grep -v 'ui/FilterMenu.tsx'
   ```

   Must print nothing. (`FilterMenu.tsx`'s own docblock explains why that
   density was removed — that reference is the record, not a survivor.)
2. **No "All" tab.** The tab list must not contain an `all` entry; the
   unfiltered view lights no tab. Check `TRIAGE_TABS`.
3. **Copy acts on a selection**, not on every row. `grep -rn "sheet-copy-all" src`
   must print nothing. Confirm the copy control only renders when
   `selected > 0` (read `TableStatusBar.tsx`).
4. **The toolbar is gone.** No import/export/print, no zoom −/100%/+, no column
   picker, no B/I/S, no text or fill colour, no alignment buttons. Grep for any
   of them near a table.

## F. Nothing was left orphaned

The teardown removed consumers; modules with none left are dead weight the next
agent will mistake for live code.

```bash
npx knip --no-exit-code 2>&1 | tail -60
```

Report every unused file/export **under `src/design-system/components/grid/`,
`src/components/tables/`, `src/components/dashboard/`, and
`src/components/station/`**. Ignore the rest — this repo has pre-existing knip
noise and it is not the subject of this verification.

Two are already known dead and should appear; flag anything else:
- `makeLedgerGridColumnHeader` (0 consumers)
- `GridRowPaintTrigger` (0 consumers)

## G. The gates

```bash
npm run verify   # lint · typecheck · unit — must exit 0
npm run build    # must exit 0; catches server-bundle module-init failures
```

`npm run verify --fast` does not work (npm eats the flag). Use `verify:fast`.

Also confirm the net line count moved the right way — §9 requires several
thousand DOWN. If it went up, the teardown became a refactor and the fork
survived:

```bash
git show --shortstat 14fc42d86 | tail -3
```

## H. Optional — see it

Only if you are told to, and only on a lane of your own. **`:3050` and the
`usav-dev` tunnel belong to the operator; never start, restart or kill them, and
never delete `.next/` or `.next/dev/lock`.** Use `next start -p 3100` with
`PW_BASE_URL`, and `pkill -f "next start -p 3100"` — never `pkill -f next-server`.

Load `/shipping/orders` and confirm the To-ship desk shows: a search box, ONE
filter button, a column header with a working select-all, two-row compound rows,
a bottom strip WITHOUT "All", and a row count.

---

## Two gaps the report already admits — confirm the scope, do not assume it

These are known-incomplete. Your job is to establish **how bad**, not to rediscover
that they exist.

1. **e2e specs were never updated or run.** `npm run verify` is lint + typecheck
   + unit only, so no Playwright spec has executed against the rebuild. Seven
   specs reference selectors or components that no longer exist:

   ```bash
   grep -rln "sheet-tab-\|sheet-row-count\|sheet-filter\|sheet-copy-all\|sheet-status-counts\|sheet-selected-count\|WorkbenchChromeHeader\|WorkbenchTriageBand\|TechRailSearchBar" tests
   ```

   The rebuild's testids are now `data-table-toolbar`, `data-table-status`,
   `data-table-row-count`, `data-table-selected-count`, `data-table-tab-<id>`,
   `data-table-filter`, `data-table-filter-menu`, `data-table-copy-selection`,
   `filter-menu-trigger`, `filter-menu`. Produce the **full list** of specs that
   need rewriting and, for each, the selector that died. Do not rewrite them.

2. **`/unbox`'s carton overlay was not touched.** The handoff §7.4 says the
   `visibility: hidden` hidden-pane behaviour in `UnboxLineWorkspace` must be
   understood before it is changed, and it was deliberately left alone. Confirm
   it is unchanged and still works:

   ```bash
   git diff 14fc42d86^ 14fc42d86 -- src/components/receiving/unbox/UnboxLineWorkspace.tsx
   ```

   The only expected change is the removal of the deleted `StationDeck` /
   `UnboxHistoryDock` wrapper. Anything touching `visibility` is a failure.

---

## Verdict

End with exactly this, and nothing softer:

```
VERDICT: <CLEAN | SURVIVORS FOUND>

Survivors (file:line — what it is — why it matters):
  …or "none"

Orphans (module — consumers: 0):
  …or "none"

Gates: verify <PASS|FAIL>  build <PASS|FAIL>  net lines <±N>

e2e specs needing rewrite: <N>  (list)

Confidence: <high|medium|low> — and what you could NOT check, and why.
```

Do not write "looks good", "seems complete", or "LGTM". If you did not run a
command, say you did not run it.
