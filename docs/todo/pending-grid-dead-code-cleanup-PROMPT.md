# Execution prompt — Pending-grid dead-code cleanup (keep `stock` removed; kill + simplify)

> **Audience:** next coding agent, main lane (WS-DOGFOOD). Written 2026-07-22 after the
> minimal-simplify rounds (see `pending-grid-minimal-simplify-handoff.md`). The kill list
> below is **evidence-based** — mounts/writers were grepped on 2026-07-22 — but re-verify
> each item before deleting (a concurrent lane was active; see Guardrails).

## Mission

1. **Lock in the column simplification** — the `stock` column (and `notes` before it) stays
   removed; do not resurrect either.
2. **Delete the dead code** the grid rewrites stranded, and simplify what's left to its
   single remaining consumer. Green `npm run verify` with a **smaller** knip baseline is
   the finish line.

## Hard guardrails

- **`stock` stays dead.** `OrdersQueueColumnKey` / `ORDERS_QUEUE_COLUMNS` must not regain
  it; `sanitizeOrdersQueueColumnOrder()` silently drops persisted `stock`/`notes` keys;
  `to-ship-pending-grid.spec.ts` asserts `[data-col="stock"]` count 0. Replenishment facts
  surface ONLY via the OOS corner-indicator tooltip (`replenishmentTooltip`).
- **Concurrent-lane check first.** On 2026-07-22 a second agent (Cursor) was mid-flight in
  this same checkout: sort dropdown (`QueueSortSwitch`, `queue-display-sort.ts`,
  `OutboundWorkspaceHeader`, `TestingWorkspaceHeader`) + a labels-rail refactor
  (`ProductsSidebarPanel`, `useLabelPrintFeed`, deleted `RecentlyPrintedList.tsx`). Run
  `git status` before starting; if those files are still uncommitted/in-flight, do not
  edit them, and treat their knip findings as theirs (round-2 snapshot:
  `PRODUCT_LABELS_RAIL_LIMIT`, `PRODUCT_LABELS_RAIL_REFRESH_EVENTS`, `parseLabelsView`,
  `ProductCatalogListProps`). Once landed, sweep whatever is still orphaned.
- **Baselines only shrink.** `npm run knip:baseline` may be run ONLY to record a smaller
  set after true deletions — never to hide a new finding. Same law for every DS ratchet.
- **The user manages commits.** No `git stash`; leave unrelated working-tree changes alone.

## Confirmed kill list (verify, then delete)

1. **`src/components/PendingOrdersTable.tsx` — unmounted component.** Zero
   `<PendingOrdersTable` JSX references in `src/`; remaining mentions are comments only
   (`useUpNextData.ts:258`, `OperationsDashboard.tsx:19`, `dashboard-queries.ts:75`,
   `api/packing-logs/route.ts:657`) — reword those comments (e.g. → "the Pending grid").
   Delete the file, then chase the knip fallout: helpers/hooks/props types that only it
   consumed. (It was the last non-grid Pending renderer; Pending is grid-only —
   `OrdersGridView`/`LedgerGrid`.)
2. **Unreachable sort branches.** `OrdersQueueSort` includes `'price' | 'staff'` but no
   surface can produce them — `parseQueueDisplaySort` clamps to
   `priority|newest|deadline`, and no caller passes a literal `sort="price"|"staff"`
   (grepped all `OrdersQueueTable` consumers). Kill:
   - `'staff'` union member + its comparator branch in `useOrdersQueueRows` +
     `staffSortKey()` in `orders-queue/helpers.ts` (confirm its only callers are the dead
     branch/tests first).
   - `'price'` union member + branch + `saleAmountValue()` **if** its only non-test
     consumers are the dead branch (`src/app/api/orders/add/route.ts` also matches the
     grep — check what it actually imports before touching the helper; kill only the
     display-sort side if the route needs it). Re-adding price sort later is planned
     work (`pending-grid-status-column-plan.md` defers it) — git history keeps the code.
3. **`src/lib/orders/replenishment-display.ts` — shrink to its one job.** The `stock`
   column died; the registry's `short` + `chip` fields and the `CHIP` tone map have no
   consumer (grep: the only `.chip` hit elsewhere is an unrelated meta in
   `TestingSidebarPanel`). Reduce `ReplenishmentStatusMeta` to `label` (+ keep
   `rowReplenishmentFacts` / `replenishmentTooltip`, both live via the OOS indicator).
   Keep the status-enum coverage and note the shrink in the header comment.
4. **Post-refactor orphan suspects — verify with knip/grep, kill what's confirmed:**
   - `ORDERS_QUEUE_DATE_STICKY` (day bands exist only on board/Packed — check consumers).
   - `EMPTY_META_DASH_ALIGN_CLASS`, `conditionTextColor`, `orderRowConditionTone` — the
     condition-alias work rerouted tones; each may have lost its last consumer.
   - `QUEUE_DISPLAY_SORT_OPTIONS[].label` (long labels) — the dropdown renders
     `shortLabel`; the `label` field may now be unread.
   - `OrdersQueueTableRow` props that no longer flow (`testerDisplay`/`packerDisplay`/
     `testerId`/`packerId`/`serialChip`/`trackingAction` — Labels/staged may still pass
     some; verify per prop before touching the interface).
   - `dashboardOrderRowShellClass`/`dashboardOrderRowChipsClass` legacy-anatomy helpers —
     Shipped/Receiving siblings may still consume; verify.
5. **Knip as the work queue.** After the above, run the knip gate; every remaining NEW
   finding either gets deleted/wired or is demonstrably another lane's in-flight work.
   Finish with `npm run knip:baseline` recording a **net-smaller** baseline and commit it
   alongside the deletions (user commits).

## Explicit non-goals (ask-first, separate work)

- ~~**Deleting `OrdersQueueTable.tsx` itself**~~ — **DONE 2026-07-22**: Packed /
  Labels / Staged / Review / Shipped all compose `OrdersGridView` → `LedgerGrid`;
  `OrdersQueueTable` and the Shipped day-band stack are deleted.
- Building the **status column** (`pending-grid-status-column-plan.md` is the plan).
- Sort **direction toggle / price sort** re-introduction.
- Any schema/route change — this is a display-layer cleanup.

## Verify

```bash
npx tsc --noEmit -p tsconfig.json          # after each deletion wave
npx tsx --test src/lib/dashboard-order-row-layout.test.ts
npm run verify                              # MUST be fully green, incl. knip
npx playwright test tests/e2e/to-ship-pending-grid.spec.ts tests/e2e/orders-queue-skin-scoping.spec.ts --project=desktop
```

Dogfood smoke on :3000 (`/dashboard`): grid renders 9 columns (no stock), `+ Label`
button on tracking-less rows jumps to `/shipping?open=`, Packed tab still renders its
board (OrdersQueueTable path intact).

**Done =** kill list resolved, knip baseline smaller, verify green, one
`pnpm worklog` entry appended, and `pending-grid-minimal-simplify-handoff.md` updated
with what was deleted.
