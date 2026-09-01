/**
 * Products-catalog field catalog — the bindable SKU-catalog facts, as DATA.
 * Wave 1.4's fourth family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `catalog` row: "product
 * browse. SKU/inventory/channels are catalog fields, not a second grid
 * product.").
 *
 * Every entry names a fact `CatalogListRow` already carries. Resolution is
 * `./catalog-resolve.ts`, kept separate so this module stays a LEAF.
 *
 * Catalog is a SHEET morph. `catalog.sku` is the IDENTITY fact — how a product
 * is keyed everywhere else in the system — and the structural Product track
 * paints the title beside it.
 *
 * The four ROLL-UP counts (channels · manuals · qc · orders) are drill-down
 * analytics, not scan facts. They shipped `tier: 'optional'` so a first-load
 * catalog reads as a product list rather than a numbers table; here that is
 * simply four unbound facts, and a staffer who wants them binds them.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const CATALOG_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'catalog.sku',
    family: 'catalog',
    label: 'SKU',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'sku' },
  },
  // Whether the product is wired to the inventory master — the catalog's whole
  // job, and the axis the Filter popover slices on.
  {
    id: 'catalog.inventory',
    family: 'catalog',
    label: 'Inventory',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: {
      linked: 'is_inventory_linked',
      title: 'inventory_title',
      providerId: 'provider_item_id',
    },
  },
  {
    id: 'catalog.channels',
    family: 'catalog',
    label: 'Channels',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'platform_count' },
  },
  {
    id: 'catalog.manuals',
    family: 'catalog',
    label: 'Manuals',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'manual_count' },
  },
  {
    id: 'catalog.qc',
    family: 'catalog',
    label: 'QC',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'qc_step_count' },
  },
  {
    id: 'catalog.orders',
    family: 'catalog',
    label: 'Orders',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'order_count' },
  },
  {
    id: 'catalog.status',
    family: 'catalog',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: {
      lifecycle: 'lifecycle_status',
      active: 'is_active',
      pending: 'has_pending_action',
    },
  },
  // The plan's §08 names cost as the missing seller fact, and observes that the
  // nearest one in the schema "lives on the SKU catalog and is never selected".
  // It IS selected here — the list row carries it — so on THIS family it is a
  // binding, not an ingestion project. Unbound by default: the retired hand
  // model never printed it, and the port reproduces before it improves.
  {
    id: 'catalog.cost',
    family: 'catalog',
    label: 'Last cost',
    displayType: 'money',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_known_cost_cents' },
  },
  {
    id: 'catalog.category',
    family: 'catalog',
    label: 'Category',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'category' },
  },
];

/**
 * The PRODUCT default catalog layout — visual parity with the retired hand
 * model's CORE view (`select · title · sku · inventory · status`): what the
 * product is, how it is keyed, whether it is wired to the inventory master, and
 * whether it needs attention. The four roll-up counts, the cost and the
 * category stay in the catalog unbound.
 * Guard: `catalog.test.ts` parses this against the catalog.
 */
export const CATALOG_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'catalog.sku',
  statusBindings: [{ fieldId: 'catalog.inventory' }, { fieldId: 'catalog.status' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Products catalog entry. */
export const CATALOG_TABLE_LAYOUT_ID = 'catalog';
