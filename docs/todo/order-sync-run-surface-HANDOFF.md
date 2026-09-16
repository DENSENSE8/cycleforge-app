# Order import — the measured run surface (HANDOFF)

**Landed 2026-09-15.** Pressing Sync used to be a spinner that stopped. It is now
a measured, step-by-step run with a per-row result, on the desk and on `/m`.

Read this file plus the four source files in **§2** and you have the whole
picture. Do not re-derive the placement rulings in **§4** — they were each
tried and rejected by the operator.

---

## 1. What an operator sees

**Desk** (`/shipping/orders`) — `Sync Google Sheet` CTA. The table steps aside
and the run takes the stage. Face reads `Syncing 3/8 · 128 rows`, not `Syncing…`.

**Phone** (`/m/work`) — `Sync orders`, a plain row at the top of the list, which
scrolls away. It navigates to `/m/orders/sync` (own screen, X top-left).

**The run, both surfaces** — `StepProgressHeader` (X · segments · `n/N`) over a
step ledger, one row per step with its own measured number:

```
✓ Read Google Sheet              214 rows
✓ Read Ecwid orders               18 orders
◌ Resolve tracking numbers        57 tracking numbers
· Match against existing orders
· Update changed orders           12 orders
· Insert new orders               39 orders
· Publish to the desk
· Resolve open exceptions          4 exceptions
```

**Settled** — check marks, the roll-up sentence, `Rows to fix` → a `BottomSheet`
grouping fixable rows first (sheet row numbers + `Open the fix queue`), then
bookkeeping, then what landed. **Nothing auto-dismisses.** `Back to orders`
returns the stage.

**`Demo sync (sample data)`** — desk CTA menu, and the phone sync screen. Same
surface, scripted rows, no network and no writes. This is the safe way to show
or test the display without touching the production Google Sheet.

---

## 2. The four files that matter

| File | Job |
|---|---|
| `src/lib/orders-sync/run-steps.ts` | The ledger. Pure fold of stream events → steps + counts. **Start here.** |
| `src/lib/orders-sync/run-detail.ts` | Per-row groups for the detail sheet. Pure. |
| `src/features/orders/sync/OrderSyncRunView.tsx` | The run surface. Serves desk + `/m`. |
| `src/hooks/useOrdersSync.ts` | Orchestration: streams both providers, folds, exposes `run` / `runDetail`. |

Supporting cast: `skip-reasons.ts` (what a skip MEANS — one table, two
consumers), `demo-run.ts` + `useOrdersSyncDemo.ts` (the scripted run),
`OrderSyncRunDetailSheet.tsx`, `orders-sync-run-context.tsx` (desk seam),
`MobileOrderSyncScreen.tsx` (`/m/orders/sync`).

Homes are deliberate: `src/features/**` is the only place both surfaces may
import from — `.dependency-cruiser.cjs` forbids `/m` → desk components **and**
desk → `/m` components. Putting the run view under `components/outbound` broke
the boundary guard; do not move it back.

---

## 3. How progress actually arrives

The counts are real, streamed from the job:

```
POST /api/integrations/[provider]/sync   Accept: application/x-ndjson
  → syncConnection(orgId, provider, { onProgress })
  → connector.sync                       (orders-transfer.ts)
  → runGoogleSheetsTransferOrders(…, progress, …)
  → ingest-canonical-orders emits phase + count + per-row detail
  → NDJSON lines → streamNdjson → applySyncRunEvent → ledger
```

- `SyncOpts.onProgress` is the seam that was missing. `orders-transfer.ts` used
  to pass `undefined`, so every phase the job emitted was discarded.
- **No `Accept` header → unchanged single JSON object.** Settings › Integrations
  "Sync now" and the cron are byte-identical. Do not make streaming the default.
- Exceptions already streamed (`/api/orders-exceptions/sync`); that is why it
  had live phase text when the sheet did not.

### Three fold hazards, each with a regression test

1. **`updating` fires twice per lane** (deletes, then backfills) — counts
   ACCUMULATE, never assign, or the number jumps down.
2. **Lanes interleave** (sheets + Ecwid in `Promise.all`) — a step is done only
   when every lane owning it has passed it; a late lane must not un-finish it.
3. **Failure pins to ONE step** (`failedAt`) — cancelling mid-insert must not
   relabel a finished 214-row read as `Cancelled`.

Also: an unmeasured step (`match`, `publish`) shows **no** count — a fabricated
`0 orders` reads as "matched nothing". A measured step that did nothing shows
`0` out loud.

---

## 4. Rulings. Do not re-derive.

- **One white floor.** `bg-surface-card` on the run section, hairlines on bands,
  no second wash. Same ruling as `KIOSK_POS_CANVAS`. It shipped once on
  `bg-surface-canvas` and the grey plane was rejected.
- **The phone CTA is content, not chrome.** Rejected, in order: a 28px icon in
  the tab row (*"a terrible display"*), the shell's `MobileActionSlot` seat
  (*"should not display in the top header"*), a bordered strip under the header
  (*"should not display in another bar … just display not sticky but at the
  top"*). A non-scrolling band under the host header is the `KioskPaneForm`
  double-band bug.
- **Orders is just orders.** `All · Assigned · Unassigned` belongs to `/m/pick`.
  The **feed** decides the effective tab, not `?tab=` — a stale bookmark must
  not filter a list whose pills are gone.
- **Progress is a COUNT of finished steps** (`ProgressBar` PG6), never the index
  of the step in view.
- **Not a table.** The ledger is a status list. A new `*GridRow.tsx` fails
  `slot-table-cohort.test.ts`, and sheet sync must never set `?import=csv`.
- **Toast is outcome-only.** The run surface IS the progress affordance.
- **Import COMMITS on arrival; "staging" means the rejected rows only**
  (operator 2026-09-15, closing what was §6.1). A sheet's good rows land in
  `orders` as the run reads them — there is no review-then-confirm gate in front
  of a sheet import, and `?import=sync` was rejected rather than built. The rows
  that could NOT be built into an order (blank Item Number, no tracking, no
  order id) are the only thing held back, and they already have a durable home:
  Review › Missing item number, which the run's `Rows to fix` sheet links
  straight into.

  So the staging fork stays CSV-only, and that is now permanent law rather than
  a pending amendment: `slot-table-cohort.test.ts:148-153` asserts
  `useOrdersSync.ts` never calls `setStagingActive(true)`. Do not add a server
  dry-run ingest path for review-before-commit; the alternative was costed
  (dry-run path + `?import=sync` + amending that assertion) and declined.

---

## 5. Gates

```bash
npx tsx --test src/lib/orders-sync/*.test.ts     # 30 — ledger, detail, stream
npx tsx --test src/lib/tables/slot-table-cohort.test.ts
npx tsc --noEmit -p tsconfig.json
npx eslint src/lib/orders-sync src/features/orders
npx tsx scripts/boundary-guard.ts                # must stay ratchet-clean
node tools/design-mcp/ds.mjs critique <file>     # before calling UI done
pnpm run verify:fast                             # the REPO fast gate — run it
```

`verify:fast` is Lint · Typecheck · Boundary · Nav names · Mobile-first. It is
the local stand-in for AGENTS.md's `cursor-eval.mjs --fast`, which cannot run
here: `$GARISEK_OS_ROOT` is unset in this shell (the code-graph CLI lives at
`/home/michaelgarisek/Projects/Garisek-OS/tools/`, and its index is stale —
`find_symbol` over MCP answers `relation "graphify_projects" does not exist`).

**Gate state 2026-09-15: `verify:fast` PASSED, all five gates.** Read that on a
shared dirty tree with suspicion, not relief — an hour earlier the same command
failed Typecheck on exactly one error that was never this program's
(`slot-table-cohort.ts(397)`: another session added a
`case 'parentSelectRestingStatus'` without declaring the id in the law union),
and that session fixed it mid-flight. `slot-table-cohort.test.ts` was red in the
same window on its `SlotTableGroupParentRow` doc text. So: attribute before you
absorb. `git status --porcelain` the file the error names, and check no failure
names a file you touched.

### Driving these surfaces in Playwright

**`page.fill()` does not drive `TextField`.** It writes the DOM node and
dispatches one input event this controlled field does not commit, so the hook's
state stays empty while `toHaveValue` passes — a green probe proving nothing
(measured both ways 2026-09-15: `fill` → `handleTransfer` read `""`;
`keyboard.type` → `"Sheet_01_14_2026"`). Type. And wait for the commit, not the
paint: the label drops `text-text-faint` only when the controlled value is
non-empty, and that class has no `peer-*` variant, so it is the one honest read
of React state. `top-1.5` is NOT — `peer-focus:top-1.5` is always in the string.

Repeated `global-setup` runs rotate the stored session and then hit
`429 RATE_LIMITED`, after which specs land on `/signin` and every locator
"is not found". That is auth, not your UI. Space the runs out.

Browser: drive **Demo sync** — never the real button — on `/m/work`,
`/m/orders/sync`, `/m/pick`, and the desk. Check: white floor, sync row scrolls
away, pills only on Picks, `?tab=assigned` on `/m/work` still lists everything,
ack returns the stage.

`run-stream.test.ts` asserts the demo and the real NDJSON path fold to an
**identical** ledger. If you add script beats, keep that property.

---

## 6. Open

1. **`MobileToShipQueue` is ~357 lines** — `ds_critique` flags it. Extracting
   the sync row is the obvious cut, but it must stay a plain content row.
2. **The legacy NDJSON routes have no frontend caller.**
   `/api/google-sheets/transfer-orders` and `/api/ecwid/transfer-orders` were
   kept for live per-phase progress, which `SyncOpts.onProgress` +
   `Accept: application/x-ndjson` on the connector route now carries. Their last
   consumer died with `useOrdersImport`. Both still only call the job (the cron
   calls the job directly, not the route), so deleting them is its own
   increment — a route is an external surface, not a component.
3. **The desk has no tab override.** `/m/orders/sync` owns the field (below);
   the desk's run start is a CTA press with no form in front of it, and
   inventing one there was not asked for. When it is: the value is already on
   the hook (`manualSheetName`), so the desk change is a field, not a seam.

### Landed 2026-09-15 — specific-tab import (was §6.2)

`/m/orders/sync` idle state carries **Sheet tab (optional)** — `TextField`
(`ds_contract`: default rounded is the house field; flush belongs to scan
stations), `mono` because the value is a tab id copied character-for-character.
Blank is the everyday answer, so it sits beside the verb, never in front of it.
The phone got it first on purpose (SURFACE_LAW: a verb is completable on `/m`
before a desk consumes it) and it is the first UI for `manualSheetName` since
the rail leaf died.

It is THREADED, not decorative: a probe intercepting every sync route (no real
sheet read, no writes) typed `Sheet_01_14_2026` and asserted the
`/api/integrations/google_sheets/sync` POST body carried
`{"manualSheetName":"Sheet_01_14_2026"}` while the ledger painted the scripted
214 rows; with the field blank the body is `{}` — the key is ABSENT, not `""`,
which matters because the route's `BodySchema` is `.strict()` with `.min(1)` and
an empty string would 400 the whole import. Demo never reads it.

## 7. Already deleted — do not resurrect

**Second doors onto the same import.** The ingest rail's `sync` leaf,
`SyncImportSection`, and `useOrdersSync.isSyncDialogOpen`. The leaf was a second
door with its **own** `useOrdersSync()` instance, so an operator could start a
concurrent import and watch it report different numbers in a rail-shaped panel.

**The whole legacy import stack (2026-09-15).** `OrderSyncDialog.tsx` (850
lines), `DashboardManagementPanel.tsx`, and `dashboard-management/`
(`useOrdersImport.ts`, `OrdersImportCard.tsx`, `SyncStatusBanner.tsx`,
`dashboard-management-shared.ts`). It was a SECOND implementation — its own
stream fold, its own summary math, its own elapsed timer, on the legacy NDJSON
routes — and it was **unreachable**: its only mount was the else-arm of
`isOutbound` in `DashboardOrdersContextPanel`, and
`getDashboardOrderViewFromSearch` returns the literal `'unshipped'`
(`dashboard-search-state.ts:98`), so the arm never ran. Pulling `skip-reasons.ts`
out first is what made this a deletion instead of an extraction.

`client.test.ts` lost its source-grep case (`readFileSync` +
`assert.match(src, /onBatch:/)`) with it: the surviving assertion drives the
shipped client and proves coalescing behaviourally, which is the property that
test was reaching for. Do not re-add a test that greps a hook's source.
