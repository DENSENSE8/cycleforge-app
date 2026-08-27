/**
 * Incoming returns table-import descriptor — Amazon Manage Returns + desk CSV.
 */

import {
  CSV_INBOUND_RETURNS_FIELDS,
  applyCsvInboundReturnsCanonicalEdits,
  autoMapCsvInboundReturnsHeaders,
  classifyCsvInboundReturnsStagingRow,
  postCsvInboundReturnsImport,
  projectCsvInboundReturnsRow,
  type CsvInboundReturnsKey,
  type CsvInboundReturnsRowStatus,
} from '@/lib/inbound/csv-inbound-returns-import';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import type { TableImportDescriptor } from '@/lib/tables/import/types';

export type InboundReturnsImportRowView = {
  index: number;
  status: CsvInboundReturnsRowStatus;
  missing: CsvInboundReturnsKey[];
  orderId: string;
  asin: string;
  sku: string;
  itemName: string;
  quantity: string;
  trackingNumber: string;
  rmaId: string;
  returnReason: string;
  returnStatus: string;
  source: string;
};

export const INBOUND_RETURNS_IMPORT_SURFACE_ID = 'receiving-returns-import';

export const INBOUND_RETURNS_IMPORT_DESCRIPTOR: TableImportDescriptor<
  CsvInboundReturnsKey,
  InboundReturnsImportRowView
> = {
  surfaceId: INBOUND_RETURNS_IMPORT_SURFACE_ID,
  entityNoun: 'returns',
  deskPath: INCOMING_SURFACE_ROUTE,
  fields: CSV_INBOUND_RETURNS_FIELDS,
  autoMap: autoMapCsvInboundReturnsHeaders,
  classify: classifyCsvInboundReturnsStagingRow,
  project: projectCsvInboundReturnsRow,
  applyEdits: applyCsvInboundReturnsCanonicalEdits,
  toRowView(row, mapping, index) {
    const { status, missing } = classifyCsvInboundReturnsStagingRow(row, mapping);
    const projected = projectCsvInboundReturnsRow(row, mapping);
    return {
      index,
      status,
      missing,
      orderId: projected.order_id,
      asin: projected.asin,
      sku: projected.sku,
      itemName: projected.item_name,
      quantity: projected.quantity,
      trackingNumber: projected.tracking_number,
      rmaId: projected.rma_id,
      returnReason: projected.return_reason,
      returnStatus: projected.return_status,
      source: projected.source,
    };
  },
  searchValues(view) {
    return [
      view.orderId,
      view.asin,
      view.sku,
      view.itemName,
      view.trackingNumber,
      view.rmaId,
      view.returnReason,
      view.returnStatus,
      view.source,
    ];
  },
  async commit({ rows, mapping }) {
    const outcome = await postCsvInboundReturnsImport({ rows, mapping });
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
  },
};
