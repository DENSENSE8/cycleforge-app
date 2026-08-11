# To-ship display alignment — handoff (finish this display)

Aligning the To-ship desk (`/shipping/orders`, `DashboardOrdersView`) to the
table SoT, **Unbox History**. Four commits landed on `main`; the remaining work
is listed under *Next*, and one of them is a product decision you should get
answered before writing code.

Do **not** edit any `.cursor/plans/*` file. The user manages commits — commit
only when asked, stage only your own files, never `git stash`.

---

## Read this first: the tree is contested

**Several agents are working this repo at once, and it bit this session twice.**

- A parallel session committed half of my working tree into **`ff83ff0f1`**
  ("fix(build): stop Vercel OOM…") — a commit whose message has nothing to do
  with the swept files. Check `git log -S '<your symbol>' -- <file>` before
  concluding your own edit is missing.
- The **shared git index** repeatedly held other sessions' staged files. Always
  `git diff --cached --stat` before committing and `git restore --staged` what
  is not yours (that leaves their working tree untouched).
- **`.claude/rules/source-of-truth.md` is contested.** It carries my prose (Pack
  placement, queue-counts two-writer rule, the retired header fork) *and*
  another session's Unbox-dock edits in the same file. I left it **unstaged**
  rather than sweep their work. **Someone needs to land the SoT prose** — it is
  currently uncommitted (`git diff .claude/rules/source-of-truth.md`).

### Playwright is broken in this tree (blocking)

A concurrent session is **mid-upgrade**: `package.json` + `pnpm-lock.yaml` are
modified, `node_modules` holds `@playwright/test@1.60.0` and `playwright@1.60.0`
against a `^1.58.2` pin, and the CLI shim still reports 1.58.2. The mismatch
makes `test.skip()` throw at file scope, so **every** spec fails to load —
including ones nobody touched:

```
Error: test.skip() can only be called inside test, describe block or fixture
  at tests/e2e/unit-pack-placement.spec.ts:18
Error: No tests found.
```

**Do not "fix" this by editing package.json or the lockfile** — that sweeps
their upgrade. Wait for it to land, then `pnpm install` and re-run. Everything
below marked NOT RUN is blocked on exactly this.

---

## What landed

| Commit | What |
|---|---|
| `ada5e1cb6` | **queue-counts seed fix.** The RSC seed wrote the shared cache key with a hand-narrowed payload that dropped `packPlacement`, so To-ship's "At stations" tile read zero benches for the first 60s of every load — settled, wrong, silent. Both writers now share `normalizeQueueCountsPayload`. Also: `provision:qa-org` clears both placement ledgers (specs passed once, then 409'd forever). |
| `aa4f3771f` | **Header fork retired.** `OrdersQueueColumnHeader` was a 358-line fork; it is now `makeLedgerGridColumnHeader` config like every sibling. Orders gained the Sheets column context menu. |
| `9769e0b10` | **Bench as an opt-in row chip.** `packStation` on To-ship as `tier:'optional'` + `hideKey`, rendered via `GridStatusCellValue` + `packBenchShortLabel`. Three pack fields declared on `ShippedOrder`. |
| `43d7da462` | **Bench facet moved into the find field.** `BenchRefineFacet` in `trailingSuffix`; the KPI-band chip row is deleted; `togglePackStation` / `togglePackPlaced` / `clearPackPlacement` joined `useToShipFilterActions`. |

### The finding that made this cheap

**To-ship and Unbox History already share the table engine.** Both mount
`NonlinearTableHost` with a binding (`OrdersGridHost.tsx`, `ReceivingGridHost.tsx`),
and Orders already had `orders-table-definition.ts`. There was never a separate
"trash engine" to replace — only presentation config. Anyone told to "rebuild
the To-ship table" should re-verify that before deleting anything.

Two more facts worth not re-deriving:

- **`_fill` stays.** Unbox History has it too (`receiving-grid-layout.ts`).
  Dropping it makes Orders *less* like the SoT, and it is load-bearing for the
  hard-width Product resize.
- The fork was retired safely because `ORDERS_QUEUE_RESIZABLE_KEYS` **is**
  `filter(isGridColumnResizable)` and `ordersQueueHeaderShowsLabel` **is**
  `gridHeaderShowsLabel` — it was re-implementing the factory. Half of it
  (`gridSkin={false}`) was unreachable.

---

## Verification state

| Gate | State |
|---|---|
| `npx tsc --noEmit` | **green** |
| `node scripts/knip-gate.mjs` | **green** (20 under baseline) |
| Unit + guards (338 across grid / packing / Band-3 / saved-views) | **green** |
| Browser (pre-breakage) | Header renders all 6 columns in order, frozen pane intact, **zero console errors**; `packStation` absent by default and appears when the staff delta is set |
| **E2E** | **NOT RUN — blocked** (Playwright upgrade above) |

**Two `npm run verify` failures are foreign** — `po-line-flat-chrome.guard`
(subject `InlinePillPicker.tsx` is another session's WIP) and a rotating cast of
Band-1 chrome cube / csv-import-staging / view-monitors. They reference **zero**
files touched here. Report them; never re-baseline.

---

## Next

### 1. Run the E2E once Playwright settles (do this first)

```bash
pnpm install
pnpm provision:qa-org
npx playwright test pack-placement.spec.ts unit-pack-placement.spec.ts --project=qa-desktop
```

Two specs in `pack-placement.spec.ts` have **never executed** and were written
blind against the new UI — expect to fix selectors, not logic:

- `the bench facet lives IN the find field and filters the board (P3d)` — the
  bench rows are matched with `getByRole('menuitem')`; confirm
  `WorkbenchFilterMenuRow` actually renders `menuitem` (it may be a plain
  `button`), and confirm the refine trigger's accessible name matches
  `/packing bench/i`.
- `the Station column is opt-in, and paints a bench chip once enabled` — opts in
  by PUT-ing `{ tableColumns: { orders: { shown: ['packStation'] } } }` to
  `/api/staff-preferences` (that exact shape returned 200 when probed).

**Note the QA fixture trap:** order `6154` (`QA-TEST-UNSHIP-PENDING`) is
staged-able via the API but is **filtered off the pre-pack board** (no
tracking), so `?packStation=<its bench>` renders an empty grid. Stage a *tracked*
order when you need a visible staged row — the test already does this.

### 2. Land the SoT prose

`.claude/rules/source-of-truth.md` is uncommitted and shared. My hunks:
Pack placement (bench binding, chip anatomy, ledger clear on provision), the new
**"queue-counts has TWO cache writers"** section, and the retired header-fork
row. Coordinate with whoever owns the Unbox-dock hunks in the same file.

### 3. ASK THE USER — Cond column tier (do not decide this alone)

Unbox History marks `condition` **`tier: 'optional'`**; To-ship keeps it core
(visible). Fully aligning would **hide Cond by default on the main outbound
queue**. That is a UX decision, not a config detail. Same question applies to
`qty` / `tracking`. I deliberately did not touch them — only *added*
`packStation` as optional.

### 4. Views trigger label (approved, not started)

The user asked for the Views control to "display an all display or the current
name display". `WorkbenchViewsMenu` already computes the active view name but
renders **icon-only** — the name reaches only the tooltip/`aria-label`, and the
blue "lit" state looks identical whether the menu is open or a view is applied.

Give `ViewsMenuShell` a visible label with **three** honest states:

| state | label | source |
|---|---|---|
| no filters | **All** | `!hasActiveFilters` |
| filters match a saved view | **the view's name** | `activeView.name` |
| filters applied, no match | **Custom** | `hasActiveFilters && !activeView` |

The third is load-bearing: `activeView` is an exact-string match on the
canonicalized query, so a filtered board with no matching view would otherwise
claim "All". Keep flush-square on the `h-7` band, `text-role-caption`,
`truncate max-w-[10rem]`.

- `MediaViewsMenu` passes a fixed **"Views"** — it hardcodes `active={false}` by
  ruling and genuinely cannot name a view.
- **Amend, don't weaken, `band3-views.guard.test.ts`** — it currently asserts
  `IconButton size="xs"` and bans label chrome. Rewrite it to pin the new
  contract, and update the SoT rows that describe the icon-only face
  (`source-of-truth.md` → Left-edge occupant; `workbench-ops-queue.md`).
- Blast radius: To-ship, Unbox History, Incoming, standalone History.

Per-lane scoping is **already correct** — `OutboundViewsMenu` resolves a
separate `storageKey` + `paramKeys` per lane. Confirm it; don't rebuild it.

### 5. Out of scope (ask-first)

- Folding To-ship's other facets (`OutboundExactFilters` urgent/OOS,
  `StaffFilterButton`) out of `OrdersViewTopicsCluster` into the same Refine
  funnel. That is the 2026-08-08 "ONE filter icon per field" migration.
- P3e (unified orders+units bench board) and P3f (QC prepack matrix) from
  `pack-placement-phase-3-HANDOFF.md`.

---

## Key files

| Concern | File |
|---|---|
| Band 3 + bench facet | `src/components/dashboard/OutboundWorkspaceHeader.tsx` (`OutboundTriageBand`, `BenchRefineFacet`) |
| To-ship URL writes (one path) | `src/components/dashboard/OutboundFilterStrip.tsx` (`useToShipFilterActions`) |
| Column model | `src/lib/dashboard-order-row-layout.ts` |
| Row cells | `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` |
| Header (now config) | `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` |
| Bench label + tone SoT | `src/lib/packing/pack-bench-display.ts` |
| Cache waist | `src/lib/orders/queue-counts-normalize.ts` |
| The golden | `src/components/station/receiving-grid/ReceivingGridHost.tsx`, `src/lib/receiving/receiving-grid-layout.ts` |
