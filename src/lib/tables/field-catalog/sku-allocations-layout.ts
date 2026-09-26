/**
 * The per-SKU allocations LAYOUT DOCUMENT — a second set of defaults over the
 * registered `unit-allocations` catalog. **Not a catalog.**
 *
 * There is exactly one allocations vocabulary in this repo
 * (`./unit-allocations.ts`) and this module adds no field to it: it imports the
 * catalog to validate against, and exports a {@link SlotLayout} plus a layout
 * id. `sku-allocations.test.ts` fails if a field id is ever minted here.
 *
 * ## Why a SIBLING document rather than the unit desk's
 *
 * The family's own docblock called this: *"if the operator wants a different
 * default density there, registers a SIBLING layout document
 * (`sku-allocations`) rather than a second vocabulary for the same facts"*, and
 * `unit-allocations.allocated_by` says outright that it *"ships UNBOUND: the
 * unit-detail table never painted it, and the per-SKU mount binds it when it
 * lands"*. The reason is not the PAGE — a registry keyed by page is the fork
 * law §2 names — it is the FEED:
 *
 * | fact         | `/inventory?unit=`            | `/inventory/health/sku/[sku]`   |
 * |--------------|-------------------------------|--------------------------------|
 * | `released`   | selected; the second half of  | structurally NULL — that feed  |
 * |              | a hold's story                | filters `state <> 'RELEASED'`  |
 * | `reason`     | selected                      | structurally NULL, same reason |
 * | `allocated_by`| never selected               | selected, and the retired cell |
 * |              |                               | painted it ("By")              |
 *
 * So the two desks cannot resolve the same fact set, and one document would
 * either print a column of dashes here (`Released`, on a feed that by
 * definition holds no released rows) or drop a fact the retired table painted.
 * Two documents, one catalog, one cell map — the same shape `incoming` and
 * `receiving` already have in `SLOT_LAYOUT_TABLES`.
 *
 * Everything else is shared BY REFERENCE: the catalog, the resolver
 * (`unit-allocations-resolve.ts`), the adapter (`unit-allocations-row-view.ts`)
 * and the materializer (`unitAllocationsCompoundColumnsFor`, which reads the
 * layout it is handed precisely so this desk needs no edit to that file).
 *
 * This module deliberately exports NO `*_FIELD_CATALOG`. Aliasing the shared
 * catalog under a second name looked like convenience for the org-layout
 * registry and is a second NAME for one source of truth (integration ruling
 * 2026-09-12). Consumers import `UNIT_ALLOCATIONS_FIELD_CATALOG` from
 * the catalog module itself; the only new symbols here are the layout document
 * and its id.
 */

import type { SlotLayout } from '@/lib/tables/slot-layout-core';

/**
 * The PRODUCT default — the five facts the retired per-SKU cells painted:
 * Order · Unit · State · Allocated · By.
 *
 * ONE status track, because four of the five are painted by chrome the shared
 * skeleton already mounts:
 *
 * - `order` — the identity chip (`identityFieldId`).
 * - `unit` — the item cell's TITLE (`Unit #7741`, from the shared adapter). The
 *   fact that distinguishes two allocations of the same SKU, and the reason the
 *   catalog was written to be shared rather than forked.
 * - `state` — the state pill (adapter chrome).
 * - `allocated` — the DATES chrome, Hash line.
 *
 * `released` and `reason` are DELIBERATELY unbound: this feed filters
 * `a.state <> 'RELEASED'`, and every writer sets `released_at` /
 * `released_reason` in the same statement as `state = 'RELEASED'`
 * (`api/orders/[id]/release`, `picking/sessions`, `fulfillment/substitution`,
 * `automations/pass-allocate-to-pending`), so both columns are structurally
 * NULL here. Binding them would paint two permanently dashed tracks; selecting
 * them would ship two always-NULL columns across the RSC boundary to fill them.
 * They stay catalog FACTS — an org that widens the feed binds them from the
 * Fields menu with three slots free.
 *
 * Guard: `sku-allocations.test.ts` parses this against the shared catalog.
 */
export const SKU_ALLOCATIONS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'unit-allocations.order',
  statusBindings: [{ fieldId: 'unit-allocations.allocated_by' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The tableId this document serves — `PRODUCT_TABLES`' per-SKU allocations entry. */
export const SKU_ALLOCATIONS_TABLE_LAYOUT_ID = 'sku-allocations';
