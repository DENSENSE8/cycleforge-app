/** The **orders** table-import descriptor — the first consumer of the seam. */

import {
  CSV_ORDER_CANONICAL_FIELDS,
  applyCsvOrderCanonicalEdits,
  autoMapCsvOrderHeaders,
  classifyCsvOrderStagingRow,
  postCsvOrderImport,
  projectCsvOrderRow,
  type CsvOrderCanonicalKey,
  type CsvOrderRowStatus,
} from '@/lib/orders/csv-order-import';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import type { TableImportDescriptor } from '@/lib/tables/import/types';

/** One staging row projected through the mapping — the grid's row shape. */
export type OrderImportRowView = {
  index: number;
  status: CsvOrderRowStatus;
  missing: CsvOrderCanonicalKey[];
  orderNumber: string;
  sku: string;
  /** Not on a grid TRACK — carried for `searchValues` only. */
  itemNumber: string;
  itemTitle: string;
  quantity: string;
  customerName: string;
  trackingNumber: string;
  platform: string;
  /** Intake vocabulary (2026-08-30) — find-bar targets, not grid tracks. */
  weightOz: string;
  assigneeTech: string;
  assigneePacker: string;
};

/**
 * Matches the staging table definition's `entityFamily` — one id for the store
 * key, the prefs bucket and the fan-out allowlist.
 */
export const ORDER_IMPORT_SURFACE_ID = 'orders-import';

export const ORDER_IMPORT_DESCRIPTOR: TableImportDescriptor<
  CsvOrderCanonicalKey,
  OrderImportRowView
> = {
  surfaceId: ORDER_IMPORT_SURFACE_ID,
  entityNoun: 'orders',
  deskPath: SHIPPING_ORDERS_PATH,
  fields: CSV_ORDER_CANONICAL_FIELDS,
  autoMap: autoMapCsvOrderHeaders,
  classify: classifyCsvOrderStagingRow,
  project: projectCsvOrderRow,
  applyEdits: applyCsvOrderCanonicalEdits,
  toRowView(row, mapping, index) {
    const { status, missing } = classifyCsvOrderStagingRow(row, mapping);
    const projected = projectCsvOrderRow(row, mapping);
    return {
      index,
      status,
      missing,
      orderNumber: projected.order_number,
      sku: projected.sku,
      itemNumber: projected.item_number,
      itemTitle: projected.item_title,
      quantity: projected.quantity,
      customerName: projected.customer_name,
      trackingNumber: projected.tracking_number,
      platform: projected.platform,
      weightOz: projected.weight_oz,
      assigneeTech: projected.assignee_tech,
      assigneePacker: projected.assignee_packer,
    };
  },
  searchValues(view) {
    return [
      view.orderNumber,
      view.sku,
      view.itemNumber,
      view.itemTitle,
      view.quantity,
      view.customerName,
      view.trackingNumber,
      view.platform,
      view.weightOz,
      view.assigneeTech,
      view.assigneePacker,
    ];
  },
  async commit({ rows, mapping }) {
    const outcome = await postCsvOrderImport({ rows, mapping });
    return outcome.ok
      ? { ok: true, insertedEntityIds: outcome.result.insertedOrderIds }
      : { ok: false, error: outcome.error };
  },
};
