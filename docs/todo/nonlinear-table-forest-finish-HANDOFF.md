# HANDOFF — finish burning the `*GridView` forest (Receiving + Orders)

**Status: DONE (2026-08-08).** `GRID_VIEW_FOREST` is empty; 0 `*GridView.tsx` wrappers on disk.
The anti-regrowth ratchet in `grid-surface-capabilities.guard.test.ts` stays live and shrink-only.

Shared multi-consumer adapters live as non-`*GridView` hosts (not page-local forks):

| Former wrapper | Live adapter | Consumers |
|---|---|---|
| `ReceivingGridView` | `ReceivingGridHost` | ReceivingLinesTable · ReceivingDrillHost · ReceivingPaneTable · TestingHistoryList |
| `OrdersGridView` | `OrdersGridHost` (keeps `useOrdersQueuePlane`) — **next cut:** [`one-table-engine-orders-host-PLAN.md`](one-table-engine-orders-host-PLAN.md) replaces this adapter with `useOrdersSpreadsheet` + `NonlinearTableHost` | 9 outbound lanes · Drill · Pane |
| `UnitsGridView` | inlined in `UnitsWorkspaceView` | 1 |

**Keep:** `OrdersQueueColumnHeader` allowlisted fork (resize + viewport force-hide).
**Do not migrate:** `StationListTable` / `FbaBoardTable` / PO accordion / admin `DataTable`.

Companions: [`nonlinear-table-burn-forest-and-ratchet-HANDOFF.md`](nonlinear-table-burn-forest-and-ratchet-HANDOFF.md) ·
[`nonlinear-data-table-engine-PLAN.md`](nonlinear-data-table-engine-PLAN.md).

Exit criteria met: pages do not import `*GridView`; new queue = registry entry + binding (+ cell map only if new `entityFamily`); `GRID_VIEW_FOREST.length === 0`.
