/**
 * The upload check, server side: recent uploads (`inbound_import_batch`) and
 * one upload read back row by row — every kept file row (`inbound_import_row`)
 * joined to what it landed as (inbound_order, receiving_line,
 * receiving_line_return, receiving_line_listing_serial, the order's tracking,
 * the mirror's item number) and compared cell by cell through the field
 * registry's `target.column` (`import-check.ts`).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { PO_PRESETS, PO_PRESET_IDS, type PoField, type PoPresetId } from './po-columns';
import {
  compareImportCell,
  importCheckColumns,
  importCheckCounts,
  type ImportCheckRow,
  type ImportRowStatus,
  type InboundImportBatchSummary,
  type InboundImportCheck,
} from './import-check';

export interface ImportCheckDeps {
  query: typeof tenantQuery;
}

const defaultDeps: ImportCheckDeps = { query: tenantQuery };

interface BatchRow {
  id: string;
  created_at: string;
  file_name: string | null;
  preset: string | null;
  label: string | null;
  status: string;
  total: number;
  landed: number;
  failed: number;
  row_count: number;
  created_by: number | null;
  created_by_name: string | null;
  headers: string[] | null;
  column_map: Partial<Record<PoField, string>> | null;
}

const BATCH_SELECT = `
  SELECT b.id, b.created_at, b.file_name, b.preset, b.label, b.status, b.total, b.landed, b.failed,
         (SELECT count(*)::int FROM inbound_import_row r WHERE r.organization_id = b.organization_id AND r.batch_id = b.id) AS row_count,
         b.created_by, s.name AS created_by_name, b.headers, b.column_map
    FROM inbound_import_batch b
    LEFT JOIN staff s ON s.id = b.created_by`;

function batchSummary(row: BatchRow): InboundImportBatchSummary {
  const preset = (PO_PRESET_IDS as readonly string[]).includes(row.preset ?? '') ? (row.preset as PoPresetId) : null;
  return {
    id: Number(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    fileName: row.file_name,
    preset,
    presetLabel: preset ? PO_PRESETS[preset].label : (row.preset ?? 'Import'),
    label: row.label,
    status: row.status,
    rows: row.row_count,
    orders: row.total,
    landed: row.landed,
    failed: row.failed,
    createdBy: row.created_by != null ? { id: row.created_by, name: row.created_by_name ?? `Staff ${row.created_by}` } : null,
  };
}

/** File uploads, newest first (sync pages keep no file and are left out). */
export async function listInboundImportBatches(orgId: OrgId, limit = 50, deps: ImportCheckDeps = defaultDeps): Promise<InboundImportBatchSummary[]> {
  const r = await deps.query<BatchRow>(
    orgId,
    `${BATCH_SELECT}
      WHERE b.organization_id = $1 AND b.file_name IS NOT NULL
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return r.rows.map(batchSummary);
}

interface ReadBackRow {
  row_number: number;
  cells: Record<string, string>;
  order_key: string | null;
  status: ImportRowStatus;
  problem: string | null;
  inbound_order_id: string | null;
  receiving_line_id: number | null;
  order_number: string | null;
  receiving_type: string | null;
  source_type: string | null;
  source_platform: string | null;
  vendor_name: string | null;
  order_date: string | null;
  expected_date: string | null;
  priority_tier: number | null;
  notes: string | null;
  item_name: string | null;
  sku: string | null;
  listing_url: string | null;
  quantity_expected: number | null;
  unit_cost_cents: number | null;
  purchase_condition_grade: string | null;
  return_reason: string | null;
  rma_ref: string | null;
  return_requested_on: string | null;
  fnsku: string | null;
  license_plate_number: string | null;
  disposition: string | null;
  customer_comment: string | null;
  listing_serials: string[] | null;
  item_number: string | null;
  tracking: string[] | null;
  carriers: string[] | null;
}

const READ_BACK_SQL = `
  SELECT r.row_number, r.cells, r.order_key, r.status, r.problem, r.inbound_order_id, r.receiving_line_id,
         io.order_number, io.receiving_type, io.source_type, io.source_platform, io.vendor_name,
         io.order_date::text AS order_date, io.expected_date::text AS expected_date, io.priority_tier, io.notes,
         rl.item_name, rl.sku, rl.listing_url, rl.quantity_expected, rl.unit_cost_cents,
         rl.purchase_condition_grade::text AS purchase_condition_grade,
         rr.return_reason, rr.rma_ref, rr.return_requested_on::text AS return_requested_on,
         rr.fnsku, rr.license_plate_number, rr.disposition, rr.customer_comment,
         (SELECT array_agg(ls.serial ORDER BY ls.id) FROM receiving_line_listing_serial ls
           WHERE ls.organization_id = r.organization_id AND ls.receiving_line_id = rl.id) AS listing_serials,
         (SELECT li->>'itemNumber'
            FROM inbound_purchase_order_mirror m
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.line_items, '[]'::jsonb)) li
           WHERE m.organization_id = r.organization_id AND m.source_type = io.source_type
             AND m.source_order_id = io.external_order_id AND li->>'lineKey' = rl.line_key
           LIMIT 1) AS item_number,
         trk.tracking, trk.carriers
    FROM inbound_import_row r
    LEFT JOIN inbound_order io ON io.id = r.inbound_order_id AND io.organization_id = r.organization_id
    LEFT JOIN receiving_line rl ON rl.id = r.receiving_line_id AND rl.organization_id = r.organization_id
    LEFT JOIN receiving_line_return rr ON rr.receiving_line_id = rl.id AND rr.organization_id = r.organization_id
    -- Every box of the order: each carton's primary shipment plus its shipment_links boxes.
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT stn.tracking_number_normalized) AS tracking,
             array_agg(DISTINCT stn.carrier) AS carriers
        FROM receiving_line ol
        JOIN receiving_carton rc ON rc.id = ol.receiving_id AND rc.organization_id = ol.organization_id
        JOIN shipping_tracking_numbers stn
          ON stn.id = rc.shipment_id
          OR stn.id IN (SELECT sl.shipment_id FROM shipment_links sl
                         WHERE sl.owner_type = 'RECEIVING' AND sl.owner_id = rc.id
                           AND sl.organization_id = rc.organization_id)
       WHERE ol.organization_id = r.organization_id AND ol.inbound_order_id = io.id
    ) trk ON io.id IS NOT NULL
   WHERE r.organization_id = $1 AND r.batch_id = $2
   ORDER BY r.row_number`;

/** The saved value of one field for one row, as display text; a set-valued column answers with the member the file names when present. */
function savedValue(field: PoField, row: ReadBackRow, file: string): string | null {
  switch (field) {
    case 'order_number':
      return row.order_number;
    case 'order_type':
      return row.receiving_type;
    case 'platform':
      return row.source_platform && row.source_platform !== 'none' ? row.source_platform : row.source_type;
    case 'vendor':
      return row.vendor_name;
    case 'order_date':
      return row.order_date;
    case 'expected_date':
      return row.expected_date;
    case 'item_title':
      return row.item_name;
    case 'sku':
      return row.sku;
    case 'item_id':
      return row.item_number;
    case 'listing_url':
      return row.listing_url;
    case 'quantity':
      return row.quantity_expected == null ? null : String(row.quantity_expected);
    case 'unit_cost':
      return row.unit_cost_cents == null ? null : (row.unit_cost_cents / 100).toFixed(2);
    case 'line_total':
      return row.unit_cost_cents == null || row.quantity_expected == null ? null : ((row.unit_cost_cents * row.quantity_expected) / 100).toFixed(2);
    case 'shipping':
      return /Shipping \$(\d+(?:\.\d{2})?)/.exec(row.notes ?? '')?.[1] ?? null;
    case 'tracking': {
      const all = row.tracking ?? [];
      const want = extractCanonicalTracking(file.trim());
      return all.includes(want) ? want : all.join(', ') || null;
    }
    case 'carrier': {
      const all = row.carriers ?? [];
      return all.find((c) => c.toUpperCase() === file.trim().toUpperCase()) ?? (all.join(', ') || null);
    }
    case 'condition':
      return row.purchase_condition_grade;
    case 'listing_serials':
      return row.listing_serials?.join(', ') || null;
    case 'return_reason':
      return row.return_reason;
    case 'rma':
      return row.rma_ref;
    case 'return_request_date':
      return row.return_requested_on;
    case 'fnsku':
      return row.fnsku;
    case 'license_plate':
      return row.license_plate_number;
    case 'disposition':
      return row.disposition;
    case 'customer_comment':
      return row.customer_comment;
    case 'notes':
      // The order's notes join every row's note — the file's fragment is saved when the notes carry it.
      return file.trim() && (row.notes ?? '').includes(file.trim()) ? file.trim() : row.notes;
    case 'priority':
      return row.priority_tier == null ? 'auto' : String(row.priority_tier);
  }
}

/** One upload read back; null when the batch is not this org's or has no file. */
export async function readInboundImportCheck(orgId: OrgId, batchId: number, deps: ImportCheckDeps = defaultDeps): Promise<InboundImportCheck | null> {
  const batch = await deps.query<BatchRow>(orgId, `${BATCH_SELECT} WHERE b.organization_id = $1 AND b.id = $2`, [orgId, batchId]);
  const head = batch.rows[0];
  if (!head || head.file_name == null) return null;
  const headers = head.headers ?? [];
  const columnMap = head.column_map ?? {};
  const columns = importCheckColumns(headers, columnMap);

  const read = await deps.query<ReadBackRow>(orgId, READ_BACK_SQL, [orgId, batchId]);
  const rows: ImportCheckRow[] = read.rows.map((row) => {
    const landed = (row.status === 'landed' || row.status === 'unchanged') && row.inbound_order_id != null;
    return {
      rowNumber: row.row_number,
      status: row.status,
      problem: row.problem,
      orderNumber: row.order_number ?? row.order_key,
      inboundOrderId: row.inbound_order_id != null ? Number(row.inbound_order_id) : null,
      receivingLineId: row.receiving_line_id,
      cells: columns.map((col) => {
        const file = row.cells[col.header] ?? '';
        const saved = col.field && landed ? savedValue(col.field, row, file) : null;
        return compareImportCell(col.header, col.field, file, saved, landed);
      }),
    };
  });

  return {
    batch: { ...batchSummary(head), headers, columnMap },
    columns,
    rows,
    counts: importCheckCounts(rows),
  };
}
