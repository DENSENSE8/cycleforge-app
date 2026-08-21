# Nonlinear data-table engine — SESSION HANDOFF

**Status:** All migration waves (P0–5) DONE. Waves P0–3 committed to `main`
(`e8795764e`); waves 4–5 **uncommitted** on branch `topic/tables` in worktree
`../cycleforge-tables`. Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md`.
Full running detail is in auto-memory `nonlinear-table-registry-waist.md`.

## What this initiative did

Decoupled the `LedgerGrid` engine from page routes: every Workbench spreadsheet
now mounts through a **registry-driven `NonlinearTableHost`** over a validated
**table definition** paired with its typed column model (`TableSurfaceBinding`),
instead of a page-local `*GridView` hand-wiring `LedgerGridSurface`.

**16 definitions registered; every workbench grid surface migrated.** Only ONE
direct `<LedgerGridSurface>` mount remains: `NonlinearTableHost` itself.

## Key files (all in the worktree)

- `src/lib/tables/table-definition.ts` — Zod schema + `superRefine` linter
  (frozen pane = contiguous leading prefix; frozen ≠ hideable; ≤1 flex track;
  `MAX_DEFAULT_VISIBLE_TRACKS = 10`) + `parseTableDefinition`.
- `src/components/tables/table-surface-binding.ts` — `TableSurfaceBinding` (def +
  typed columns + `makeDescriptor` ref).
- `src/components/tables/NonlinearTableHost.tsx` — the host.
- `src/components/tables/table-definition-registry.ts` — the 16-definition registry.
- `*-table-definition.ts` next to each family descriptor (receiving, incoming,
  ready, pickup, unfound, tech-all, tracking-exceptions, warranty, my-day,
  catalog, repair, bins, catalog-link[×2], orders[×2]).
- `src/components/dashboard/orders-queue/useOrdersQueuePlane.ts` — Orders'
  selection/cursor/inspector plane (wave 5).

## Architecture facts you must not re-derive wrong

1. **The host takes a BINDING, not an id.** An id-keyed typed registry can't hold
   multiple `Row` shapes without a cast that guarantees nothing. Ids are the
   enumeration/lookup key only.
2. **The definition OWNS the shell recipe** (`surface`, columns, capabilities,
   descriptor id). `tableId`/`testId`/`ariaLabel` are overridable on the host —
   they are per-mount *instance identity* for shared grids (Testing History reuses
   `receiving.browse`; Orders' 9 lanes each name themselves). `surface` is NOT
   overridable.
3. **`parseTableDefinition` CLONES** (zod) — `definition.columns` is a snapshot,
   not an alias of the family column const. Drift is silent; the registry guard's
   deep-equal tests are what catch it.
4. **Guard-migration pattern:** a guard that greps a view for
   `<LedgerGridSurface … surface="sheet"` or a `tableId` literal gets RE-POINTED
   at `definition.surface` / `definition.tableId` + a `<NonlinearTableHost binding={…}`
   mount assertion. Never delete the intent. The capabilities discovery regex and
   `grid-view-plumbing` TOUCHES already match `<NonlinearTableHost`; `NonlinearTableHost`
   is in `grid-view-plumbing`'s `DS_OWN`.
5. **Orders specifics:** 2 defs (`fulfillment.default`/`.tested`) via
   `ordersTableBindingFor(columnMode)`. `queueMode` (fulfillment/staged/shipped/labels)
   is row-chrome only, not a def axis. `useOrdersQueuePlane` holds ≥4 documented
   race bug-fixes — do NOT rewrite it; it was moved verbatim. Its 9 consumers were
   left UNCHANGED (props API preserved).

## Git / worktree reality (READ before committing)

- `main` HEAD moved during the original session (other sessions commit via GitHub
  Desktop). The shared checkout's INDEX is mutated live by other sessions.
  **Commit only with a pathspec commit** — `git commit -- <explicit paths>` —
  which ignores foreign staged entries. NEVER `git add -A` / `git stash` (533+
  dirty files from other sessions).
- Worktree `node_modules` is a SYMLINK to `../cycleforge-app/node_modules`.
- Shell cwd resets between commands; prefix `cd /Users/icecube/repos/cycleforge-tables &&`.

## Verification reality

- **154 table-initiative guards pass; typecheck of the table/orders slice is clean.**
- Full `npm run verify` in the worktree is RED, but ENTIRELY from **another
  session's** uncommitted unbox / station-displays / testing work committed in a
  half-state into `e8795764e` (`LineEditPanel`, `TestingPanel`,
  `StationDisplaysUtilityRail`, `station/displays/*`, 27 displays unit fails).
  None is table/wave work. Use targeted guards as the signal, not full verify.

Run the table guard set:
```bash
cd /Users/icecube/repos/cycleforge-tables && npx tsx --test \
  src/lib/tables/table-definition.test.ts \
  src/components/tables/table-definition-registry.guard.test.ts \
  src/lib/tables/grid-surface-capabilities.guard.test.ts \
  src/components/dashboard/dashboard-orders-sheet.guard.test.ts \
  src/design-system/components/grid/grid-view-plumbing.guard.test.ts \
  src/components/workbench-cohort-wave7-sheet.guard.test.ts \
  src/features/review/review-workspace-sheet.guard.test.ts
```

## Outstanding follow-ups (none blocking; all user-decision)

1. **Commit `topic/tables`** — pathspec-scoped to the table files only.
2. **SoT one-liner** — add to `AGENTS.md` + `source-of-truth.md`: "Workbench
   spreadsheets mount via the table definition registry + `NonlinearTableHost`;
   pages supply feed + intents, never a page-local `*GridView` twin." Deferred so
   the constitution isn't edited in an uncommitted diverging worktree — land it
   WITH the commit. (Now true for the first time, so it's earned.)
3. **Register the lane** in `docs/portfolio/WORKTREE-LANES.md` + `dev-worktrees.json`.
4. **`StationListTable` / `FbaBoardTable`** — raw mounts with no column model;
   keep as documented exceptions (a fabricated column model = the anti-pattern
   their capability-bag exemption exists for).
