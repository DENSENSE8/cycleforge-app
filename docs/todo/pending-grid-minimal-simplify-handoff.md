# Handoff — Pending **Grid**: Employees-style connected ledger (north star)

> **Status: UPDATED 2026-07-21 — no table-adjust chrome on Pending.**
> Pending is **grid-only** (Board|Grid switcher retired). North star = the
> Employees reference: continuous light cell grid, rounded outer shell, edge
> rules, icon-only tall header, progressive SLA age tones.
>
> **Audience:** next coding agent. Do not re-introduce floating day-band rows,
> table-options / column-config / density / drag-resize on Pending, or a full
> swimlane DnD board. Display order uses the TOP `QueueSortSwitch`
> (Priority | Newest | Deadline) via `?sort=`.

---

## Locked product decision

- **Pending = `OrdersGridView` / `LedgerGrid` only** (`/dashboard?unshipped`).
- No Board|Grid chrome toggle. Stale `?view=` is stripped on normalize.
- TOP chrome: `QueueSortSwitch` reorders the same grid (not lanes).
- Testing Pending/Returns share the same sort switcher.

## Visual contract

- White surface, **light** continuous vertical + horizontal rules (`border-subtle`, thin).
- Rounded shell wrapper clips corners; scroll lives on the inner LedgerGrid.
- Row shell `p-0` under skin; **cells** own `px-2 py-1.5` so borders meet.
- **Icon-only** sticky column header (`min-h-11`) — tooltips + `sr-only` labels.
- No status gutter — pipeline dot folds into Product.
- **Date column** between Product and Qty — compact `Jun 9`; Age stays relative SLA.
- Headers never truncate text (icons only on Pending Grid).

## Column scan order

`select · Product · Date · Qty · Cond · Age · Notes · Platform · Order · Tracking`

## Key files

- `src/components/unshipped/UnshippedShelfBoard.tsx` — staff filter only (no ⋯ / columns / density)
- `src/components/dashboard/orders-queue/OrdersGridView.tsx` — fixed SoT column tracks (no `useColumnWidths`)
- `src/components/dashboard/QueueSortSwitch.tsx` + `src/hooks/useQueueDisplaySort.ts`
- `src/utils/queue-display-sort.ts`
- `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` — icon-only when `gridSkin`
- `src/lib/dashboard-order-row-layout.ts` — column SoT (no status)
- `src/design-system/components/grid/LedgerGrid.tsx` — `showDayHeaders={false}`

## Verify

- `npm run verify`
- E2E: `tests/e2e/orders-queue-skin-scoping.spec.ts`, `tests/e2e/to-ship-pending-grid.spec.ts`
