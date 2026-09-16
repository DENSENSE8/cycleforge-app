# HANDOFF — consolidate the Wave D work into the prod lane (overwrite-wins)

**You are finishing another agent's work.** Read this whole file before touching
anything. Every number and path below was measured, not remembered; re-measure
anything you intend to rely on.

---

## 0. The three trees, and which one wins

| Tree | HEAD | State | Role |
|---|---|---|---|
| `~/Projects/cycleforge-lanes/prod` | `739b65be2` (detached) | **430 untracked, 140 modified** — the whole Wave A–D slot-table port, uncommitted, PLUS other sessions' in-flight work | **the production worktree — the destination** |
| `~/Projects/cycleforge-lanes/wave-d-port` | `7b5c07f4d` (detached) | clean tree, 2 commits on top of main | **the source of the two things prod lacks** |
| `~/Projects/cycleforge-app` | `7a9a83db3` = `main` | **854 dirty paths** — another session mid-edit | main. Do NOT commit or reset here. |

`prod` and `main` are **forks**, not branches: merge-base `8a85d82ac`, with
**1429** commits only on prod and **1586** only on main. `pnpm lane land prod`
is fast-forward-only and will refuse (`main has moved past this lane`). Do not
try to rebase 1429 commits.

**Direction for this handoff: `wave-d-port` → `prod`, overwrite-wins.**

### What prod already has (do NOT re-copy, do NOT overwrite with older copies)

Prod is the ORIGIN of Wave D. It already contains all 12 Wave D families
(`admin-holds`, `admin-bulk-allocate`, `cycle-count-lines`,
`admin-drift-alerts`, `admin-sku-drift`, `staff-directory`,
`report-bin-utilization`, `report-velocity`, `report-dead-stock`, `sku-bins`,
`sku-ledger`, `sku-allocations`), `unit-allocations`, `unit-tsn-links`, and
`CompoundDelay.faceLabel` (4 occurrences — verified present). Prod's
`ADMIN_TABLE_DEBT` is empty and `eval:cohort slot-table` was `ok: true` at
**44 peers / 44 enginePeers / discoverDelete 0`.

### What prod does NOT have — the only thing to move

**The universal row-ID column** (commit `7b5c07f4d` in `wave-d-port`). Verified
absent from prod: `src/lib/tables/slot-table-row-id.ts` does not exist there and
prod's `COMPOUND_COLUMN_KEYS` is still
`select · fulfillment · thumb · item · dates · state · _fill`.

`fe8f02625` (the ByUnitView port) is **already in prod** in equivalent form —
do not re-apply it to prod. It exists as a commit only because it was built to
fast-forward onto `main`.

---

## 1. Task A — move the ID column into prod

### What the feature is

The shared compound skeleton gains a frozen, leftmost DATA track `id`, 4.5rem,
resizable, painting `CompoundRowView.id` via `CompoundRowId` (a copy chip; the
copied value is the bare id, the `#` is chrome). It reaches all 32 registered
tables at once because it is the engine's column. The family HANDLE (order #,
PO, serial, TSN) is unchanged beside it — the id LEADS, the handle follows.

It sorts and searches on every mount with no per-family resolver work:
`slot-table-row-id.ts` reserves the fact `@row.id` (namespaced so no catalog
field can spell it); the track carries it as `fieldId`, so each family's
existing `col.fieldId` fall-through answers `sortFactFor`;
`useCompoundSpreadsheet` intercepts the fact BEFORE the family resolver and
answers from `getRowId` — the same function the grid keys rows by. It compares
as a number.

### The files, exactly

```bash
cd ~/Projects/cycleforge-lanes/wave-d-port
git show --stat 7b5c07f4d      # 20 files
```

Engine (copy verbatim — prod's copies are byte-identical apart from this change
in every case the porting agent checked, but VERIFY each with `diff` first):

- `src/lib/tables/slot-table-row-id.ts` *(new)*
- `src/lib/tables/slot-table-row-id.test.ts` *(new)*
- `src/components/tables/compound/compound-columns.ts` — `'id'` in
  `COMPOUND_COLUMN_KEYS` (a **literal**, see §1.3), the track in
  `COMPOUND_TRACKS`, `fieldId?: string` on `CompoundTrack`
- `src/components/tables/compound/CompoundCells.tsx` — `CompoundRowId`
- `src/components/tables/compound/CompoundGridCell.tsx` — the `id` case +
  `isCompoundCellKey`
- `src/components/tables/useCompoundSpreadsheet.tsx` — `factText` takes
  `getRowId` and intercepts `@row.id`; the sort types it `'number'`

Per-family sort declarations (nine families declare a hand track→fact map
instead of deriving it, so each must name the fact or its header is dead):

- `src/utils/queue-display-sort.ts` — orders: `'id'` in
  `QueueDisplaySortColumn`, `QUEUE_COLUMN_SORTS`, `COMPOUND_TRACK_SORT_KEYS`,
  `QUEUE_COLUMN_SORT_FACES`, `QUEUE_COLUMN_SORT_MENU_ORDER`
- `src/components/dashboard/orders-queue/queue-row-compare.ts` — `case 'id'`
- `src/lib/receiving/receiving-grid-layout.ts` — receiving AND incoming (both
  key unions + both track maps)
- `src/lib/staff-todos/tasks-grid-layout.ts`,
  `src/lib/daily-checks/daily-grid-layout.ts`,
  `src/lib/sessions/sessions-grid-layout.ts`,
  `src/lib/reports/sku-velocity-grid-layout.ts`,
  `src/lib/reports/dead-stock-grid-layout.ts` — each needs THREE edits: the
  `*SortFact` union, the `*_SORT_FACTS` runtime list, the `*_TRACK_SORT_FACTS`
  map, and the `Record<*SortFact, ColumnType>` map (`id: 'number'`)
- `src/features/review/catalog-link/grid/catalog-link-grid-layout.ts` and
  `.../import-exception-grid-layout.ts` — key union + `*_GRID_SORTABLE_KEYS`

Law and test updates:

- `src/lib/tables/field-catalog/inventory-events.ts` — see §1.2
- `src/lib/tables/slot-table-session-laws.ts` — see §1.3
- test files that pin the exact track list: `compound-row-model.test.ts`
  (`ORDERS_KEYS`, the skeleton pin, the `resizable` pin),
  `receiving-grid-layout.test.ts`, `incoming-grid-layout.test.ts`,
  `inventory-events.test.ts`, and the seven `field-catalog/*.test.ts` files
  whose "the bare skeleton binds no fact" assertion now needs
  `.filter((c) => c.key !== ROW_ID_TRACK_KEY)`

### 1.1 The two traps that cost the last agent real time

**`**` does not glob recursively in bash without `shopt -s globstar`.** Running
`node --import tsx --test src/lib/tables/**/*.test.ts` silently SKIPS every
top-level `src/lib/tables/*.test.ts` file — including `table-engine-law.test.ts`,
`slot-table-cohort.test.ts` and `slot-table-session-laws.test.ts`, i.e. all the
tripwires. A green run that omits the tripwires is not green. Always:

```bash
shopt -s globstar
files=$(ls src/lib/tables/*.test.ts src/lib/tables/**/*.test.ts \
           src/components/tables/*.test.ts src/components/tables/**/*.test.ts \
           src/utils/queue-display-sort*.test.ts \
           src/lib/receiving/receiving-grid-layout.test.ts \
           src/lib/receiving/incoming-grid-layout.test.ts \
           src/features/review/catalog-link/grid/*.test.ts 2>/dev/null | sort -u)
node --import tsx --test $files
```

**Relative paths in edit-tool section headers resolve against the process CWD,
not the tree you think you are in.** An earlier agent's edit was rejected
showing a preview of a DIFFERENT, superseded file in `~/Projects/cycleforge-app`.
**Use absolute paths** (`/home/michaelgarisek/Projects/cycleforge-lanes/prod/src/...`)
in every edit, and `cd` explicitly in every bash call.

### 1.2 `inventory-events` must give up one binding

Adding a shared track spends one slot on all 32 families.
`inventory-events` is the ONLY family sitting exactly on
`MAX_DEFAULT_VISIBLE_TRACKS` (10) — it has five status slots because its
materialization cuts `select` and `dates`. Without this change
`parseTableDefinition` **throws at module load**, which takes down
`registered-bindings` and therefore everything.

`inventory-events.bin` ships UNBOUND: it is null on every event that is not a
move, so it is the track that most often prints a dash, and it stays a catalog
fact — sortable, searchable, one click away in the Fields menu. Confirm prod's
`INVENTORY_EVENTS_PRODUCT_LAYOUT` has the same five bindings before assuming
the same fix applies; if prod's differs, re-derive which fact leaves and say so.

### 1.3 The session law pins the skeleton literally

`line-money.no-amount-track` in `slot-table-session-laws.ts` greps
`compound-columns.ts` for the exact key sequence. Two consequences:

1. `'id'` must be a **string literal** in `COMPOUND_COLUMN_KEYS`, not the
   `ROW_ID_TRACK_KEY` identifier — an identifier reads as a missing track to the
   tripwire.
2. The law's `mustMatch` pattern must be extended to include `'id',`. The ruling
   ("no amount track") is preserved; only its detection pattern changes.
   **Do not delete the law to go green.**

### 1.4 Acceptance for Task A

```bash
cd ~/Projects/cycleforge-lanes/prod
npx tsc -p tsconfig.json --noEmit                 # 0 errors
# the globstar-safe test command from §1.1          # 0 failures
pnpm run eval:cohort slot-table                   # ok: true, peers 44, discoverDelete 0
```

Plus, by inspection:

- `COMPOUND_COLUMN_KEYS[1] === 'id'`
- every registered binding's default-visible track count is `<= 10`
- `isSlotTableChromeTrack('id') === false` **and** every family's `isSortable('id')` is `true`

Prod carries more families than `wave-d-port` (44 peers vs 32), so **expect
more per-family sort declarations than the nine listed.** Let the cohort
tripwire enumerate them for you: it fails one family at a time with
`<family> data track id must click-sort`. Fix, re-run, repeat until green.

---

## 2. Task B — land `fe8f02625` on main (independent of Task A)

`fe8f02625` closes main's still-open `HAND_HTML_TABLE_DEBT` entry for
`ByUnitView` (two hand `<table>`s → the registered `unit-allocations` and
`unit-tsn-links` families) and adds `CompoundDelay.faceLabel` to main's engine.
Its parent **is** main's HEAD, so:

```bash
cd ~/Projects/cycleforge-app
git status --short | wc -l     # 854 — must be 0 first, and that is NOT yours to clear
git merge --ff-only fe8f02625
```

**Blocked until the main checkout is clean.** Another session owns those 854
paths. Do not stash, reset or commit them. Ask the operator.

---

## 3. Hard rules

1. **Never start a dev server**, never touch `:3050` or `:3077`. Verification is
   `tsc` + `node --test` + `eval:cohort`. Visual checks are the operator's
   (`pnpm lane up prod`).
2. **Never create a git branch.** These worktrees are detached by design.
3. **Do not commit other sessions' work.** Prod's tree holds ~130 modified files
   belonging to the search-display-SoT, station-chrome and mobile sessions. Stage
   by explicit pathspec only. `git add -A` in prod is PROHIBITED.
4. `docs/eval/**/LEDGER.md`, `docs/eval/goals/**`, `docs/eval/sessions/**` are
   never agent-writable. The cohort run rewrites `LEDGER.md` — leave it unstaged.
5. Do not `.filter` chrome off `compoundColumnsFor`; `COMPOUND_SKELETON_FILTER_DEBT`
   is shrink-only.
6. Consult the design system before UI edits (`ds_contract`, `ds_tokens`,
   `ds_critique`). Note `ds_*` is rooted at `~/Projects/cycleforge-app` and
   **refuses absolute lane paths** — it cannot see either lane worktree. Say so
   rather than claiming it passed.
7. A test that pins removed behaviour gets **corrected or deleted**, never
   re-pinned to make a number go green — and say which you did and why.

---

## 4. Known-red things that are NOT yours to fix

- `tests/e2e/csv-import-staging.spec.ts:101-110` asserts an accessible name
  (`edit order number for staging row 3`) that **no source file renders**. The
  orders staging grid lost its in-cell corrector in the Wave-1.4 port and the
  spec was never updated. Needs an operator ruling (re-add or retire), not a fix.
- `src/lib/tables/table-engine-law.test.ts` is modified in prod's working tree
  and that change is **not** Wave D's.
- The eight homeless Wave D families (holds, bulk-allocate, cycle-count-lines,
  the two drift desks, sku-bins/ledger/allocations) have no surface on main
  because main deleted those routes. That is a separate, operator-gated decision.

---

## 5. Report format

End with:

```
## What moved
<file → file, one line each>

## Verification
<exact commands and their output; name anything you could NOT run and why>

## Deviations from this handoff
<anything prod's reality made different, with evidence>

## Still open
<what you did not do, and what it is blocked on>
```

Reference commits: `7b5c07f4d` (the ID column), `fe8f02625` (ByUnitView).
Prior records: `docs/todo/prod-slot-table-WAVE-D-HANDOFF.md`,
`docs/todo/prod-slot-table-SOT-HANDOFF.md`,
`docs/todo/csv-import-staging-generalisation-PLAN.md`.
