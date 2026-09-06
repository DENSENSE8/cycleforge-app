/**
 * Receiving capture actions — the Unbox bench procedure, promoted from
 * hand-coded steps to registered `ActionDefinition`s (Operations Studio layer 2).
 *
 * Until 2026-09-06 every act in `procedure.ts` was `composed: false`: the
 * step named its route, its reads and its writes, but nothing in the station
 * registry could OFFER it, so a composed station (or a generated one) had no
 * receiving verb to bind. This module is that promotion. Each action wraps
 * the EXACT route its procedure step already declared — the descriptor owns
 * nothing the route does not already own (validation, auth, idempotency,
 * audit) — and carries the same read/write lineage, so the Studio Procedure
 * lens inherits it unchanged (`station-procedure-map.ts`).
 *
 * Permissions mirror the wrapped route's gate. Routes that are `withAuth` with
 * no extra permission (condition, serial-absent, label-printed,
 * add-unmatched-line, classify) are declared on `dashboard.view` — the floor
 * every signed-in staffer holds — because a station action must name a
 * registry permission and "any staff" IS that permission.
 *
 * Actions that need operator input beyond the row (a grade, a bin barcode, a
 * SKU) read it FROM THE ROW: the bound source is expected to carry the field
 * (`condition_grade`, `location_barcode`, `sku`). That is the v1 contract;
 * the v2 flow grammar adds a declared `input` so a Card can ask for it.
 */

import type { ActionDefinition, TableRef } from './contract';

/** One photo route, five steps — declared once so the lineage cannot drift. */
const RECEIVING_PHOTO_READS: TableRef[] = [
  { table: 'receiving_carton' },
  { table: 'receiving_scans' },
  { table: 'receiving_triage' },
  { table: 'photos', via: '@/lib/photos/service' },
  { table: 'photo_storage', via: '@/lib/photos/service' },
];

const RECEIVING_PHOTO_WRITES: TableRef[] = [
  { table: 'photos', via: '@/lib/photos/service' },
  { table: 'photo_storage', via: '@/lib/photos/service' },
  { table: 'photo_entity_links', via: '@/lib/photos/claim-link' },
];

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** Name what this carton is (PO / return / trade-in / pickup) — wraps PATCH /api/receiving/:id. */
const classifyCarton: ActionDefinition = {
  id: 'receiving.classify_carton',
  label: 'Classify',
  icon: 'Tag',
  endpoint: { method: 'PATCH', path: '/api/receiving/:id' },
  body: (row) => ({ intake_classification: row.intake_classification ?? null }),
  permission: 'receiving.mark_received',
  appliesTo: ['tracking_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [
    { table: 'items' },
    { table: 'local_pickup_orders' },
    { table: 'locations' },
    { table: 'receiving_carton' },
    { table: 'receiving_line' },
    { table: 'receiving_line_testing' },
    { table: 'receiving_line_zoho' },
    { table: 'receiving_scans' },
    { table: 'receiving_triage' },
    { table: 'receiving_unbox' },
    { table: 'serial_unit_provenance' },
    { table: 'serial_units' },
    { table: 'shipping_tracking_numbers' },
    { table: 'sku_catalog' },
    { table: 'staff' },
  ],
  writes: [{ table: 'receiving_carton' }],
};

/**
 * Capture a receiving photo (arrival label / box / dunnage / item) — wraps
 * POST /api/receiving-photos. Descriptor-only: the upload is multipart from a
 * camera or a file, so the renderer opens the photo capture for the row's
 * stage + aspect (`display.photo_stage` / `display.photo_aspect` on the block
 * instance) instead of POSTing JSON. Body omitted on purpose.
 */
const capturePhoto: ActionDefinition = {
  id: 'receiving.capture_photo',
  label: 'Photo',
  icon: 'Camera',
  endpoint: { method: 'POST', path: '/api/receiving-photos' },
  permission: 'receiving.upload_photo',
  appliesTo: ['tracking_ref', 'sku_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: RECEIVING_PHOTO_READS,
  writes: RECEIVING_PHOTO_WRITES,
};

/** Confirm the carton contents against the line list — wraps POST /api/receiving/:id/contents-confirm. */
const confirmContents: ActionDefinition = {
  id: 'receiving.confirm_contents',
  label: 'Contents confirmed',
  icon: 'ListChecks',
  endpoint: { method: 'POST', path: '/api/receiving/:id/contents-confirm' },
  body: () => ({ confirmed: true }),
  permission: 'receiving.mark_received',
  appliesTo: ['tracking_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [{ table: 'receiving_unbox', via: '@/lib/receiving/streets/carton-street-write' }],
  writes: [{ table: 'receiving_unbox', via: '@/lib/receiving/streets/carton-street-write' }],
};

/**
 * Attach a serial to a line — wraps POST /api/receiving/scan-serial. The
 * serial comes from the row (`serial_number`), which a scan band writes onto
 * the selected line before this fires; `receiving_line_id` is the row id.
 */
const scanSerial: ActionDefinition = {
  id: 'receiving.scan_serial',
  label: 'Serial',
  icon: 'Barcode',
  endpoint: { method: 'POST', path: '/api/receiving/scan-serial' },
  body: (row) => ({
    receiving_line_id: num(row.id),
    receiving_id: num(row.receiving_id),
    serial_number: row.serial_number ?? '',
    station: 'RECEIVING',
  }),
  permission: 'receiving.mark_received',
  appliesTo: ['serial_ref', 'sku_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [
    { table: 'receiving_line' },
    { table: 'receiving_line_zoho' },
    { table: 'serial_units', via: '@/lib/receiving/serial-attach' },
    { table: 'serial_unit_provenance', via: '@/lib/receiving/serial-attach' },
  ],
  writes: [
    { table: 'serial_units', via: '@/lib/receiving/serial-attach' },
    { table: 'receiving_line_testing', via: '@/lib/receiving/serial-projection' },
  ],
};

/** Waive the serial for a line that has none — wraps POST /api/receiving/lines/:id/serial-absent. */
const serialAbsent: ActionDefinition = {
  id: 'receiving.serial_absent',
  label: 'No serial',
  icon: 'Ban',
  endpoint: { method: 'POST', path: '/api/receiving/lines/:id/serial-absent' },
  body: (row) => ({ absent: true, reason: row.serial_absent_reason ?? 'NOT_SERIALIZED' }),
  permission: 'dashboard.view',
  appliesTo: ['serial_ref', 'sku_ref'],
  integration: 'receiving',
  confirm: 'soft',
  reads: [{ table: 'receiving_line' }],
  writes: [{ table: 'receiving_line_testing' }],
};

/**
 * Grade the unit — wraps PATCH /api/receiving/lines/:id/condition. The grade
 * is read from the row: the bound source carries the stored default
 * (`condition_grade`), so binding this action is "confirm the pre-selected
 * chip", exactly what the bench step describes. Grades are `CONDITION_GRADES`
 * in `@/lib/conditions`; the route is the allow-list.
 */
const setCondition: ActionDefinition = {
  id: 'receiving.set_condition',
  label: 'Grade',
  icon: 'Star',
  endpoint: { method: 'PATCH', path: '/api/receiving/lines/:id/condition' },
  body: (row) => ({ condition_grade: row.condition_grade ?? 'USED_A' }),
  permission: 'dashboard.view',
  appliesTo: ['condition_grade', 'sku_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [{ table: 'receiving_line' }],
  writes: [{ table: 'receiving_line_testing' }],
};

/** Confirm the label face before printing — wraps POST /api/receiving/lines/:id/label-previewed. */
const labelPreviewed: ActionDefinition = {
  id: 'receiving.label_previewed',
  label: 'Label checked',
  icon: 'Eye',
  endpoint: { method: 'POST', path: '/api/receiving/lines/:id/label-previewed' },
  body: () => ({ confirmed: true }),
  permission: 'receiving.mark_received',
  appliesTo: ['sku_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [{ table: 'receiving_line' }],
  writes: [{ table: 'receiving_line_testing' }],
};

/** Stamp the label as printed (first print wins) — wraps POST /api/receiving/lines/:id/label-printed. */
const labelPrinted: ActionDefinition = {
  id: 'receiving.label_printed',
  label: 'Print label',
  icon: 'Printer',
  endpoint: { method: 'POST', path: '/api/receiving/lines/:id/label-printed' },
  body: () => ({}),
  permission: 'dashboard.view',
  appliesTo: ['sku_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [{ table: 'receiving_line' }],
  writes: [{ table: 'receiving_line_testing' }],
};

/**
 * Stage the line at its putaway bin — wraps POST /api/receiving/lines/:id/stage.
 * The bin comes from the row (`location_barcode` or `staged_location_id`).
 */
const stageLine: ActionDefinition = {
  id: 'receiving.stage',
  label: 'Stage',
  icon: 'MapPin',
  endpoint: { method: 'POST', path: '/api/receiving/lines/:id/stage' },
  body: (row) => ({
    barcode: typeof row.location_barcode === 'string' ? row.location_barcode : undefined,
    location_id: num(row.staged_location_id) ?? undefined,
    confirmed: true,
  }),
  permission: 'receiving.mark_received',
  appliesTo: ['sku_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [
    { table: 'receiving_line' },
    { table: 'receiving_line_putaway' },
    { table: 'locations' },
  ],
  writes: [{ table: 'receiving_line_putaway' }],
};

/**
 * Commit the receive — wraps POST /api/receiving/mark-received-po. `soft`
 * confirm because units become inventory and the receipt is pushed upstream.
 * `receive_intent` defaults to the org's provider receive; an unfound carton
 * row carries `receive_intent: 'local_receive'` from its source.
 */
const receiveLine: ActionDefinition = {
  id: 'receiving.receive',
  label: 'Receive',
  icon: 'PackageCheck',
  endpoint: { method: 'POST', path: '/api/receiving/mark-received-po' },
  body: (row) => ({
    receiving_id: num(row.receiving_id),
    receiving_line_id: num(row.id),
    receive_intent: typeof row.receive_intent === 'string' ? row.receive_intent : 'zoho_receive',
    condition_grade: row.condition_grade ?? undefined,
  }),
  permission: 'receiving.mark_received',
  appliesTo: ['sku_ref', 'po_ref'],
  integration: 'receiving',
  confirm: 'soft',
  reads: [
    { table: 'receiving_carton' },
    { table: 'receiving_line' },
    { table: 'receiving_line_zoho' },
    { table: 'serial_units' },
    { table: 'serial_unit_provenance' },
    { table: 'shipping_tracking_numbers' },
    { table: 'staff' },
    { table: 'inventory_events', via: '@/lib/receiving/receive-line' },
    { table: 'items', via: '@/lib/receiving/receive-line' },
  ],
  writes: [
    { table: 'receiving_line', via: '@/lib/receiving/receive-line' },
    { table: 'serial_units', via: '@/lib/receiving/receive-line' },
    { table: 'sku_stock_ledger', via: '@/lib/receiving/receive-line' },
  ],
};

/**
 * Record an extra / unexpected item on a carton — wraps
 * POST /api/receiving/add-unmatched-line. `receiving_id` and `sku` come from
 * the row (a carton row, or a line row carrying the carton id).
 */
const addUnmatchedLine: ActionDefinition = {
  id: 'receiving.add_unmatched_line',
  label: 'Add extra item',
  icon: 'Plus',
  endpoint: { method: 'POST', path: '/api/receiving/add-unmatched-line' },
  body: (row) => ({
    receiving_id: num(row.receiving_id) ?? num(row.id),
    sku: typeof row.sku === 'string' ? row.sku : undefined,
    item_name: typeof row.item_name === 'string' ? row.item_name : undefined,
    allow_off_po: true,
  }),
  permission: 'dashboard.view',
  appliesTo: ['tracking_ref', 'sku_ref'],
  integration: 'receiving',
  confirm: 'soft',
  reads: [{ table: 'receiving_carton' }, { table: 'receiving_line' }, { table: 'sku_catalog' }],
  writes: [{ table: 'receiving_line' }],
};

/**
 * Write a line off as a loss (short / damaged / wrong item) — wraps
 * POST /api/receiving/lines/:id/loss. The loss code comes from the row
 * (`loss_code`); the route echoes the allowed vocabulary on a bad one.
 */
const lossWriteoff: ActionDefinition = {
  id: 'receiving.loss',
  label: 'Write off',
  icon: 'AlertTriangle',
  endpoint: { method: 'POST', path: '/api/receiving/lines/:id/loss' },
  body: (row) => ({ code: row.loss_code ?? 'SHORT', note: row.loss_note ?? undefined }),
  permission: 'receiving.mark_received',
  appliesTo: ['sku_ref'],
  integration: 'receiving',
  confirm: 'soft',
  reads: [{ table: 'receiving_line' }],
  writes: [{ table: 'receiving_exceptions' }],
};

/**
 * Defer the carton to triage — wraps POST /api/receiving/triage/complete.
 * The route requires a staging location and a priority lane on the carton;
 * a carton without them 4xx's and the renderer says why.
 */
const triageComplete: ActionDefinition = {
  id: 'receiving.triage_complete',
  label: 'Triage later',
  icon: 'Clock',
  endpoint: { method: 'POST', path: '/api/receiving/triage/complete' },
  body: (row) => ({ receiving_id: num(row.receiving_id) ?? num(row.id) }),
  permission: 'receiving.scan_po',
  appliesTo: ['tracking_ref'],
  integration: 'receiving',
  confirm: 'none',
  reads: [{ table: 'receiving_carton' }, { table: 'receiving_triage' }],
  writes: [{ table: 'receiving_triage' }],
};

/** Registration order is the bench order; the registry itself is a map. */
export const RECEIVING_CAPTURE_ACTIONS: readonly ActionDefinition[] = [
  classifyCarton,
  capturePhoto,
  confirmContents,
  scanSerial,
  serialAbsent,
  setCondition,
  labelPreviewed,
  labelPrinted,
  stageLine,
  receiveLine,
  addUnmatchedLine,
  lossWriteoff,
  triageComplete,
];
