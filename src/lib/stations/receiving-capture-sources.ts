/**
 * Receiving capture sources — the two feeds the Unbox bench procedure reads
 * that the station registry did not wrap until 2026-09-06.
 *
 *   receiving.carton_lines  — the lines of ONE carton (the scanned subject).
 *   receiving.unfound_queue — cartons that matched nothing, awaiting triage.
 *
 * Both wrap an existing GET route verbatim; filters only pick among what the
 * route already understands. Row fields are named so the capture ACTIONS in
 * `receiving-capture-actions.ts` can read them (`condition_grade`,
 * `receiving_id`, `serial_number`) — the v1 "input comes from the row" rule.
 */

import type { DataSourceDefinition, SourceRow } from './contract';

const str = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * One carton's lines — wraps GET /api/receiving/:id. The carton id is a
 * filter (`receiving_id`), which a scan band or a queue selection sets on the
 * block instance; with no id the source resolves to no rows rather than to
 * every line in the org.
 */
const receivingCartonLines: DataSourceDefinition = {
  id: 'receiving.carton_lines',
  label: 'Lines of the scanned carton',
  integration: 'receiving',
  endpoint: '/api/receiving/:id',
  buildUrl: (filters) => {
    const id = typeof filters.receiving_id === 'string' ? filters.receiving_id.trim() : '';
    return /^\d+$/.test(id) ? `/api/receiving/${id}` : '/api/receiving/0';
  },
  parse: (json) => {
    const payload = json as { success?: boolean; lines?: Array<Record<string, unknown>> } | null;
    if (!payload?.success || !Array.isArray(payload.lines)) return [];
    return payload.lines.map((l): SourceRow => {
      const serials = Array.isArray(l.serials) ? (l.serials as Array<Record<string, unknown>>) : [];
      return {
        id: String(l.id),
        receiving_id: str(l.receiving_id),
        sku: str(l.sku),
        item_name: str(l.item_name) ?? str(l.catalog_product_title) ?? str(l.zoho_item_title),
        quantity_expected: Number(l.quantity_expected ?? 0),
        quantity_received: Number(l.quantity_received ?? 0),
        condition_grade: str(l.condition_grade),
        workflow_status: str(l.workflow_status),
        po_number: str(l.zoho_purchaseorder_number) ?? str(l.zoho_purchaseorder_id),
        tracking_number: str(l.tracking_number),
        serial_number: serials.length > 0 ? str(serials[0]?.serial_number) : null,
        image_url: str(l.image_url),
        // An unfound carton's line has no upstream PO line — receive locally.
        receive_intent: l.zoho_line_item_id ? 'zoho_receive' : 'local_receive',
      };
    });
  },
  shape: [
    { key: 'item_name', label: 'Item', kind: 'text' },
    { key: 'sku', label: 'SKU', kind: 'sku_ref' },
    { key: 'po_number', label: 'PO #', kind: 'po_ref' },
    { key: 'tracking_number', label: 'Tracking', kind: 'tracking_ref' },
    { key: 'serial_number', label: 'Serial', kind: 'serial_ref' },
    { key: 'condition_grade', label: 'Condition', kind: 'condition_grade' },
    { key: 'quantity_expected', label: 'Expected', kind: 'text' },
    { key: 'quantity_received', label: 'Received', kind: 'text' },
    { key: 'workflow_status', label: 'Status', kind: 'text' },
  ],
  filters: [{ key: 'receiving_id', label: 'Carton id', kind: 'text' }],
  permission: 'receiving.view',
  reads: [
    { table: 'receiving_carton' },
    { table: 'receiving_line' },
    { table: 'receiving_line_testing' },
    { table: 'receiving_line_zoho' },
    { table: 'sku_catalog' },
    { table: 'shipping_tracking_numbers' },
    { table: 'items' },
    { table: 'serial_units' },
    { table: 'serial_unit_provenance' },
  ],
};

/** Cartons that matched nothing — wraps GET /api/receiving/unfound-queue. */
const receivingUnfoundQueue: DataSourceDefinition = {
  id: 'receiving.unfound_queue',
  label: 'Unfound cartons',
  integration: 'receiving',
  endpoint: '/api/receiving/unfound-queue',
  buildUrl: (filters) => {
    const checked = filters.checked === 'true' || filters.checked === 'all' ? String(filters.checked) : 'false';
    const q = new URLSearchParams({ kind: 'unmatched_receiving', checked, limit: '100' });
    return `/api/receiving/unfound-queue?${q.toString()}`;
  },
  parse: (json) => {
    const payload = json as { items?: Array<Record<string, unknown>>; rows?: Array<Record<string, unknown>> } | null;
    const rows = payload?.items ?? payload?.rows ?? [];
    return rows.map((r): SourceRow => ({
      id: String(r.source_id ?? r.id),
      receiving_id: str(r.source_id ?? r.id),
      title: str(r.product_title) ?? `Carton #${str(r.source_id) ?? '?'}`,
      serial_numbers: str(r.serial_numbers),
      context: str(r.context),
      created_at: str(r.created_at),
      checked: r.checked === true,
    }));
  },
  shape: [
    { key: 'title', label: 'Item', kind: 'text' },
    { key: 'serial_numbers', label: 'Serials', kind: 'serial_ref' },
    { key: 'context', label: 'Context', kind: 'text' },
    { key: 'created_at', label: 'Logged', kind: 'timestamp' },
  ],
  filters: [
    {
      key: 'checked',
      label: 'Show',
      kind: 'select',
      options: [
        { value: 'false', label: 'Open' },
        { value: 'true', label: 'Checked' },
        { value: 'all', label: 'All' },
      ],
      default: 'false',
    },
  ],
  permission: 'receiving.view',
  reads: [{ table: 'v_unfound_queue' }],
};

export const RECEIVING_CAPTURE_SOURCES: readonly DataSourceDefinition[] = [
  receivingCartonLines,
  receivingUnfoundQueue,
];
