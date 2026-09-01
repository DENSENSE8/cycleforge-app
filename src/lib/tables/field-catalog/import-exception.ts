/**
 * Import-exception field catalog — the bindable missing-item-number facts, as
 * DATA. Wave 1.3's sixth and last family
 * (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `import-exception` row:
 * "second store, second hand model, one page. Two catalogs, two layouts — not
 * two engines.").
 *
 * That row is the whole design in one sentence, and this port makes it literal:
 * Review's two queues live on one page, mount the same compound cells, and now
 * carry two catalogs and two layout documents — the same shape as
 * incoming/receiving and daily/tasks.
 *
 * Every entry names a fact `ImportExceptionRow` already carries off
 * `/api/review/import-exceptions`. Resolution is
 * `./import-exception-resolve.ts`, kept separate so this module stays a LEAF.
 *
 * `import-exception.order` is the identity fact — the marketplace order id the
 * sheet row carried, which the shared `fulfillment` chrome track already
 * paints.
 *
 * **`status` is deliberately absent**, for the same reason as
 * `catalog-link.status`: this queue is the OPEN exceptions, so the state pill
 * reads "No item #" for every row by construction. A column painting one
 * identical value on 100% of rows is ink that teaches operators to stop reading
 * chips.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const IMPORT_EXCEPTION_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'import-exception.order',
    family: 'import-exception',
    label: 'Order',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'accountOrderId' },
  },
  {
    id: 'import-exception.source',
    family: 'import-exception',
    label: 'Source',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'accountSource' },
  },
  {
    id: 'import-exception.tracking',
    family: 'import-exception',
    label: 'Tracking',
    displayType: 'tracking',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'tracking' },
  },
  // WHERE in the supplier file this row came from — the number an operator
  // needs to go back and fix the source.
  {
    id: 'import-exception.sheet',
    family: 'import-exception',
    label: 'Sheet row',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sheetRow' },
  },
  // How many imports have hit the same unresolved row — a recurring exception
  // is a broken listing, not a one-off typo.
  {
    id: 'import-exception.seen',
    family: 'import-exception',
    label: 'Seen',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'seenCount' },
  },
  {
    id: 'import-exception.first',
    family: 'import-exception',
    label: 'First seen',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'firstSeenAt' },
  },
  {
    id: 'import-exception.last',
    family: 'import-exception',
    label: 'Last seen',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'lastSeenAt' },
  },
];

/**
 * The PRODUCT default import-exception layout — COMPOUND morph, nothing bound,
 * which is byte-for-byte what the queue paints today. Reproduce, then improve.
 * Guard: `import-exception.test.ts` parses this against the catalog.
 */
export const IMPORT_EXCEPTION_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'import-exception.order',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — Review · Missing item number. */
export const IMPORT_EXCEPTION_TABLE_LAYOUT_ID = 'import-exception';
