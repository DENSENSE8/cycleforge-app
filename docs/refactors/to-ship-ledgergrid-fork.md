# To Ship desk — LedgerGrid fork (scaffold)

Scaffold PR for decoupling `/shipping/orders` from the shared `entityFamily: 'orders'`
table-engine mount while **keeping** stations on `OrdersGridHost`.

## What was forked (desk only)

| Layer | Desk (`/shipping/orders`) | Stations (Pack · Shipping · Labels · …) |
|-------|---------------------------|-------------------------------------------|
| Shell | `ToShipWmsShell` — Recents · Process · Details | Unchanged workbench embeds |
| Table mount | `ToShipDeskTable` → `ToShipDeskShelfBoard` → `ToShipDeskGridHost` | `UnshippedTable` → `UnshippedShelfBoard` → `OrdersGridHost` |
| Definition ids | `to-ship.default` / `to-ship.tested` | `fulfillment.default` / `fulfillment.tested` |
| `entityFamily` | `to-ship` | `orders` (unchanged in `TABLE_ENTITY_FAMILIES`) |
| Staff prefs `tableId` | `to-ship-desk` | `orders` |
| Cell renderers | Reuses `OrdersQueueTableRow` via `cellMapKey: 'orders'` | Same |

Data layer is **not** forked: `unshippedOrdersQuery`, `/api/orders?fulfillmentScope=true&listShape=queue`, `deriveFulfillmentState`, RSC seed, Ably patches, and bulk hooks (`useOrderAssignment`, `useDashboardBulkSelection`, `useOrderFieldSave`, `useDeleteOrderRow`) stay shared.

CSV import (`?import=csv`, `orders-import` family, `CsvImportStagingHost`) is unchanged on the desk middle column.

## Why a new `entityFamily` instead of only `tableId`

The engine requires a registered `entityFamily` on every `TableDefinition`. A desk-local prefs bucket (`to-ship-desk`) alone would still parse as `orders` and share the global family union semantics. Adding `to-ship` makes the fork explicit in the registry and guards without removing `orders` from `TABLE_ENTITY_FAMILIES` or changing `orders-table-definition.ts` for station mounts.

## Safe removal order (when cutting debt later)

1. **Confirm no desk mount reads `orders` prefs** — grep for `tableId="orders"` under `src/components/outbound/orders/` and `DashboardOrdersView`.
2. **Migrate saved staff column prefs** (if product wants continuity) from `staff_preferences.tableColumns.orders` → `to-ship-desk` for desk-only keys; stations keep `orders`.
3. **Diverge desk columns** in `ToShipDeskColumns.ts` / `to-ship-desk-table-definition.ts` — drop station-only tracks without touching `ORDERS_QUEUE_*`.
4. **Optional: dedicated cell map** — if desk cells diverge, add `to-ship` cell map and stop aliasing `cellMapKey: 'orders'`.
5. **Collapse duplicate hosts** — if `ToShipDeskGridHost` stays a one-liner forever, inline or merge into a parameterized `OrdersGridHost` mount enum.
6. **WMS shell** — decide whether Recents stays in-desk (`ToShipWmsShell`) or moves to a shared outbound desk shell; update `outbound-rail-dedup.guard.test.ts` if frame-level Pattern E changes.
7. **Last:** remove transitional `variant` on `UnshippedTable` once no desk caller remains.

## What stations still own

- `OrdersGridHost` + `ordersTableBindingFor()` + `entityFamily: 'orders'`
- `orders-table-definition.ts` (both fulfillment bindings)
- `UnshippedTable` default `variant="station"` for `ShippingWorkspaceView`, `PackWorkspaceView`, and other embeds
- Shared row plane: `useOrdersQueuePlane`, `OrdersQueueTableRow`, assignment / bulk / field-save hooks

Do **not** delete `orders` from `TABLE_ENTITY_FAMILIES` or narrow `orders-table-definition.ts` until every non-desk consumer has been migrated or explicitly retired.

## Next debt-cut steps

- [ ] Dogfood desk Fields prefs under `to-ship-desk` — verify Pending vs Tested column modes persist independently of Packing queue prefs.
- [ ] Flesh out Recents rail (staff-scoped recent ship-outs API vs detail-stack-only scaffold).
- [ ] Add guard: desk path must not import `ordersTableBindingFor` directly (registry drift).
- [ ] E2E: assert `data-testid="to-ship-desk-grid-body"` on desk; station specs still hit `pending-grid-body` / `orders-grid-body`.
- [ ] Custom fields: when ORDER goes live on History-first allowlist, wire `to-ship-desk` deliberately — not via the shared `orders` bucket.

## Manual smoke plan

1. **To Ship desk** — `/shipping/orders`: 3-column shell, Pending/Tested grid, open details, assign/flag from row or bulk rail, CSV Import from Band 1.
2. **Ready-to-Pack** — `/shipping` pack queue tab: still `OrdersGridHost` / shared columns prefs.
3. **Packing** — pack workspace queue: row open → pack overlay, not broken by desk fork.
4. **CSV import** — `?import=csv` replaces middle body; confirm leaves staging without touching live queue prefs.
