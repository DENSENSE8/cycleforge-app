# To-ship "Ship by" column — stale / misplaced ship-by date — HANDOFF

**Date:** 2026-08-05. **Lane:** main (dogfood). **Scope:** THIS ONE ISSUE ONLY.

## Symptom (user report + screenshot)

On the To-ship **Pending** grid (`/dashboard` / `/shipping/orders` → `UnshippedShelfBoard` →
`OrdersGridView` → `LedgerGridSurface` sheet), the **"Ship by" column (2nd data column, after
Order) renders BLANK**, and the **ship-by date** (e.g. `Jun 3`, `Jul 2`, `Mar 29`) appears to bleed
into/after the **Product** cell instead. User: *"the ship by date is not displaying correctly in
the column, it's still stale in the old column reference, it must be in the 2nd column display."*

Column order the user expects (and the current model already declares):
`select · order · Ship by(sla) · Product(title) · Qty · Tracking · _fill`.

## ⚠️ ALREADY VERIFIED — do NOT redo this (prior session, 2026-08-05)

The **working-tree code is already correct**. Verified three ways:

1. **Column model is right.** `ORDERS_QUEUE_COLUMNS` in
   [`src/lib/dashboard-order-row-layout.ts`](../../src/lib/dashboard-order-row-layout.ts) =
   `select · order · sla · title · qty · tracking · _fill`; frozen pane = `select · order · sla ·
   title`. Ran the layout functions live — `ordersQueueFrozenLeft('sla')` = `ROW_PX + select +
   order` (⇒ sla sits **before** title, the 2nd data column); `frozenLeft('title')` includes sla.
   Even a **stale saved column order** sanitizes back to the correct pane
   (`sanitizeOrdersQueueColumnOrder(['title','sla','condition','qty','tracking'])` →
   `select · order · sla · title · qty · tracking · _fill`).
2. **Row rendering is right.** `OrdersQueueTableRow.renderDesktopCell` `case 'sla':` (~L904)
   renders the date via `GridSlaCellValue`. There is **no `case 'date':`** left. The standalone
   `dateNode`/`ageNode` (defined ~L471/479) are **mobile-only** (rendered only inside the
   `isMobile` branch, ~L1178) — they cannot leak into the desktop grid.
3. **Tests green.** All 52 orders-queue tests + `dashboard-order-row-layout.test.ts` +
   `orders-queue-fixed-columns.guard.test.ts` pass; full `npm run verify` is green.

Repro the layout proof (fast, no browser):
```bash
npx tsx -e "import {ORDERS_QUEUE_COLUMNS, ordersQueueGridTemplate, ordersQueueFrozenLeft} from '@/lib/dashboard-order-row-layout'; console.log(ORDERS_QUEUE_COLUMNS.map(c=>c.key).join(' · ')); console.log(ordersQueueFrozenLeft('sla')); console.log(ordersQueueGridTemplate());"
```

**Conclusion:** the symptom **cannot be produced by the code on disk** → it is a STALE RENDER, not
a code defect in the layout.

## The two live hypotheses (confirm before fixing)

1. **Stale dev bundle (most likely).** A large **uncommitted** orders-queue refactor is in the tree
   (383 ins / 636 del; `OrderGroupSummary.tsx` was deleted). The `:3050` dev bundle can serve a
   pre-refactor chunk. **Confirm:** hard-reload the `:3050` tab (Cmd+Shift+R). If the Ship-by column
   snaps into place, done — no code change needed.
2. **Stale per-staff column layout pref.** `staff_preferences.tableColumns['<orders table id>']`
   may carry `widths` / `order` / `hidden` keyed on the OLD layout (`title` was `minmax(12rem,1fr)`
   flex + frozen edge; `condition`/`notes`/`stock` were real columns). **Confirm:** with the grid
   open, click the column-display **▦ → "Reset to default"** (clears persisted widths + order). If
   that fixes it, the stale pref is the cause.

## The fix — ONLY if it survives BOTH a hard reload AND ▦ Reset to default

That would mean a retired pref key is surviving sanitize. Add a **one-time pref migration** that
drops retired/unknown column keys from `staff_preferences.tableColumns[<orders>]`:
- Retired keys to strip from `widths` / `hidden` / `order`: `condition`, `notes`, `stock`, `age`,
  `platform`, `status`, `orderid`, `date` (any key not in `OrdersQueueColumnKey`).
- Do it in the read path (`useGridColumnWidths` / the tableColumns loader) so it's idempotent and
  needs no backfill — filter unknown keys against the current `OrdersQueueColumnKey` set on load,
  and persist the cleaned map on next write.
- `sanitizeOrdersQueueColumnOrder` already drops unknown ORDER keys; the gap (if any) is `widths`.
  Add a guard test that a stale `widths: { title: 999, condition: 80, date: 80 }` resolves to only
  live keys.

Do **not** hand-write CSS offsets or touch the frozen-left math — it is provably correct.

## TRAPS

- **Concurrent session owns the orders-queue refactor.** These files are mid-flight and uncommitted
  (`OrdersQueueTableRow.tsx`, `dashboard-order-row-layout.ts`, `helpers.ts`, `QueueGroupRow.tsx`,
  `orders-queue-column-defs.ts`, deleted `OrderGroupSummary.tsx`). **Do not stage/commit their work**
  and do not "fix" the already-correct layout. Only the pref-migration path above is fair game, and
  only after both remedies above fail.
- The screenshot is the **Pending** lane (`UnshippedShelfBoard` → `OrdersGridView`). Packed / Shipped
  / Labels / Staged / Review all route through the same `OrdersQueueTableRow`, so a real fix is
  shared — but so is the "already correct" verdict.
- `sla` has **no `hideKey` and is frozen**, so `isGridColumnVisible` always shows it — a stale
  `hidden: ['sla']` can't blank it. Don't chase that.
