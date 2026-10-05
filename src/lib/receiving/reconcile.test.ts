import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  filterRowsByRecon,
  parseReconReasonParam,
  parseRefList,
  reconOfCheckRow,
  reconcileCheck,
  RECON_REASON_LABELS,
  RECON_REASON_STATUS,
  type ReconReason,
  type ReconStatus,
} from './reconcile';

function checkRow(overrides: Partial<CheckZohoReceivedRow> = {}): CheckZohoReceivedRow {
  return {
    tracking: '1Z999AA10123456784',
    po_number: 'PO-1',
    reference_number: null,
    vendor_name: null,
    status: 'issued',
    reason: 'matched',
    source: 'mirror',
    synced_at: null,
    local: { known: true, delivered: false, delivered_at: null, scanned: false, unboxed: false, watch: 'in_flight' },
    ...overrides,
  };
}

const local = (patch: Partial<NonNullable<CheckZohoReceivedRow['local']>>) => ({
  known: true,
  delivered: false,
  delivered_at: null,
  scanned: false,
  unboxed: false,
  watch: 'in_flight' as const,
  ...patch,
});

test('a dock scan or an unbox is a receipt, whatever the ERP says', () => {
  assert.equal(reconOfCheckRow(checkRow({ local: local({ scanned: true }) })).status, 'received');
  assert.equal(reconOfCheckRow(checkRow({ local: local({ unboxed: true }) })).status, 'received');
});

test('the ERP saying received with nothing scanned reads its carrier fact — never a Zoho label', () => {
  const delivered = reconOfCheckRow(checkRow({ status: 'received', local: local({ delivered: true }) }));
  assert.deepEqual([delivered.status, delivered.reasonCode, delivered.detail, delivered.exception], [
    'not_received',
    'delivered_not_scanned',
    'Delivered · not scanned',
    null,
  ]);
  const moving = reconOfCheckRow(checkRow({ status: 'received' }));
  assert.deepEqual([moving.reasonCode, moving.detail], ['in_transit', 'In transit']);
  const ordered = reconOfCheckRow(checkRow({ status: 'received', local: local({ known: false }) }));
  assert.deepEqual([ordered.reasonCode, ordered.detail], ['open_po', 'Ordered · no tracking']);
  for (const label of Object.values(RECON_REASON_LABELS)) assert.ok(!label.includes('Zoho'), label);
});

test('a number nothing identifies is owed with an unlinked badge; one the carrier knows is plainly owed', () => {
  const nothing = reconOfCheckRow(checkRow({ reason: 'no_match', local: local({ known: false }) }));
  assert.deepEqual([nothing.status, nothing.exception], ['not_received', { reason: 'No match anywhere', inView: false }]);
  const delivered = reconOfCheckRow(checkRow({ reason: 'no_match', local: local({ delivered: true }) }));
  assert.deepEqual(delivered, {
    status: 'not_received',
    reasonCode: 'delivered_not_scanned',
    detail: 'Delivered · not scanned',
    pending: false,
    exception: null,
  });
  assert.deepEqual(reconOfCheckRow(checkRow({ reason: 'error' })).exception, { reason: 'Lookup failed', inView: false });
});

test('entries keep the paste order and match the Check by canonical key', () => {
  const selection = parseRefList('po-2\n1z999-aa1-0123456784\nNOPE-1');
  const entries = reconcileCheck(selection, [
    checkRow({ tracking: '1Z999AA10123456784', local: local({ scanned: true }) }),
    checkRow({ tracking: 'PO-2', po_number: 'PO-2', status: 'received' }),
    checkRow({ tracking: 'NOPE-1', reason: 'no_match', local: null }),
  ]);
  assert.deepEqual(entries.map((e) => [e.ref, e.status, e.exception?.reason ?? null]), [
    ['po-2', 'not_received', null],
    ['1z999-aa1-0123456784', 'received', null],
    ['NOPE-1', 'not_received', 'No match anywhere'],
  ]);
});

test('a status filter keeps every line of the numbers in that bucket, by PO or tracking', () => {
  const selection = parseRefList('PO-7\n9400111899223344556677');
  const entries = reconcileCheck(selection, [
    checkRow({ tracking: 'PO-7', po_number: 'PO-7' }),
    checkRow({ tracking: '9400111899223344556677', local: local({ scanned: true }) }),
  ]);
  const line = (id: number, patch: Partial<ReceivingLineRow>) => ({ id, ...patch }) as ReceivingLineRow;
  const rows = [
    line(1, { zoho_purchaseorder_number: 'PO-7', tracking_number: null }),
    line(2, { zoho_purchaseorder_number: 'PO-7', tracking_number: null }),
    line(3, { zoho_purchaseorder_number: 'PO-8', tracking_number: '9400 1118 9922 3344 5566 77' }),
    line(4, { zoho_purchaseorder_number: 'PO-9', tracking_number: null }),
  ];
  assert.deepEqual(filterRowsByRecon(rows, entries, 'not_received').map((r) => r.id), [1, 2]);
  assert.deepEqual(filterRowsByRecon(rows, entries, 'received').map((r) => r.id), [3]);
});

test('a number only the warehouse knows reads its status from its lines', () => {
  const line = (patch: Partial<ReceivingLineRow>) =>
    ({ id: 1, tracking_number: null, zoho_purchaseorder_number: null, quantity_received: 0, ...patch }) as ReceivingLineRow;
  const unknownToCheck = checkRow({ reason: 'no_match', po_number: null, local: local({ known: false }) });
  const cases: [string, Partial<ReceivingLineRow> | null, ReconStatus, string][] = [
    ['unboxed manual receipt', { unboxed_at: '2026-09-20T10:00:00Z' }, 'received', 'Unboxed'],
    ['dock-scanned carton', { received_at: '2026-09-20T10:00:00Z' }, 'received', 'Scanned at dock'],
    ['tracking scan only', { scanned_at: '2026-09-20T10:00:00Z' }, 'received', 'Scanned at dock'],
    ['units received, no carton times', { quantity_received: 2 }, 'received', 'Received here'],
    ['line past EXPECTED', { delivery_state: 'RECEIVED' }, 'received', 'Received here'],
    ['carrier delivered, untouched', { delivery_state: 'DELIVERED_UNOPENED' }, 'not_received', 'Delivered · not scanned'],
    ['a line and nothing else', {}, 'not_received', 'Warehouse record · not received'],
    ['no lines at all', null, 'not_received', 'No match anywhere'],
  ];
  for (const [name, patch, status, detail] of cases) {
    const selection = parseRefList('MANUAL-1\nOTHER-2');
    const lines = patch ? [line({ tracking_number: 'manual-1', zoho_purchaseorder_number: 'PO-M', ...patch })] : [];
    const [entry] = reconcileCheck(selection, [{ ...unknownToCheck, tracking: 'MANUAL-1' }], lines);
    assert.deepEqual([entry.status, entry.detail], [status, detail], name);
    if (patch) assert.equal(entry.poNumber, 'PO-M', name);
  }
});

test('warehouse lines never override a number the Check resolved', () => {
  const selection = parseRefList('PO-5\nNOPE-9');
  const scanned = { id: 1, zoho_purchaseorder_number: 'PO-5', tracking_number: null, received_at: '2026-09-20T10:00:00Z' } as ReceivingLineRow;
  const entries = reconcileCheck(
    selection,
    [
      checkRow({ tracking: 'PO-5', po_number: 'PO-5', status: 'received', local: local({ known: true }) }),
      checkRow({ tracking: 'NOPE-9', reason: 'no_match', local: local({ known: false }) }),
    ],
    [scanned],
  );
  // The Check owns PO-5 (its local facts said nothing scanned); NOPE-9 has no lines.
  assert.deepEqual(entries.map((e) => [e.status, e.reasonCode, e.exception?.inView]), [
    ['not_received', 'in_transit', undefined],
    ['not_received', 'no_match', false],
  ]);
});

test('an owed number whose lines sit in an exception state links to the Exceptions view', () => {
  const selection = parseRefList('PO-11\nPO-12\nPO-13');
  const line = (id: number, po: string, delivery_state: ReceivingLineRow['delivery_state']) =>
    ({ id, zoho_purchaseorder_number: po, tracking_number: null, delivery_state }) as ReceivingLineRow;
  const entries = reconcileCheck(
    selection,
    [
      checkRow({ tracking: 'PO-11', po_number: 'PO-11' }),
      checkRow({ tracking: 'PO-12', po_number: 'PO-12' }),
      checkRow({ tracking: 'PO-13', po_number: 'PO-13', local: local({ scanned: true }) }),
    ],
    [line(1, 'PO-11', 'CARRIER_MISMATCH'), line(2, 'PO-12', 'IN_TRANSIT'), line(3, 'PO-13', 'STALLED')],
  );
  assert.deepEqual(entries.map((e) => e.exception), [
    { reason: 'Carrier mismatch', inView: true },
    null,
    // Received outranks a stale carrier state: a scanned box is nobody's exception.
    null,
  ]);
});

test('every Check answer carries the reason its status came from', () => {
  const cases: [string, Partial<CheckZohoReceivedRow>, ReconReason][] = [
    ['unboxed', { local: local({ unboxed: true }) }, 'unboxed'],
    ['dock scan', { local: local({ scanned: true }) }, 'scanned'],
    ['carrier delivered', { local: local({ delivered: true }) }, 'delivered_not_scanned'],
    ['carrier knows it', {}, 'in_transit'],
    ['only Zoho knows it', { local: local({ known: false }) }, 'open_po'],
    ['ERP status received, nothing scanned', { status: 'received' }, 'in_transit'],
    ['nothing knows it', { reason: 'no_match', local: local({ known: false }) }, 'no_match'],
    ['several POs', { reason: 'ambiguous' }, 'ambiguous'],
    ['lookup threw', { reason: 'error' }, 'lookup_failed'],
  ];
  for (const [name, patch, reason] of cases) {
    const recon = reconOfCheckRow(checkRow(patch));
    assert.deepEqual([recon.reasonCode, recon.status, recon.pending], [reason, RECON_REASON_STATUS[reason], false], name);
  }
});

test('a number live Zoho was never asked about is decided by our own tables', () => {
  const selection = parseRefList('CAP-LINE\nCAP-SHIP\nCAP-NONE\nUNASKED');
  const cap = (tracking: string, known: boolean) =>
    checkRow({ tracking, reason: 'zoho_cap', po_number: null, status: null, local: local({ known }) });
  const unboxed = { id: 9, tracking_number: 'CAP-LINE', zoho_purchaseorder_number: null, unboxed_at: '2026-09-20T10:00:00Z' } as ReceivingLineRow;
  const entries = reconcileCheck(selection, [cap('CAP-LINE', false), cap('CAP-SHIP', true), cap('CAP-NONE', false)], [unboxed]);
  assert.deepEqual(entries.map((e) => [e.pending, e.status, e.reasonCode]), [
    [false, 'received', 'unboxed'],
    [false, 'not_received', 'in_transit'],
    [false, 'not_received', 'no_match'],
    // Only a number the Check has not answered at all is pending.
    [true, 'not_received', null],
  ]);
  const unanswered = { id: 10, tracking_number: 'UNASKED', zoho_purchaseorder_number: null } as ReceivingLineRow;
  assert.deepEqual(filterRowsByRecon([unanswered], entries, 'not_received'), []);
});

test('a reason narrows its status', () => {
  const selection = parseRefList('A-1\nB-2\nC-3\nD-4');
  const entries = reconcileCheck(selection, [
    checkRow({ tracking: 'A-1', po_number: 'A-1', local: local({ delivered: true }) }),
    checkRow({ tracking: 'B-2', po_number: 'B-2', local: local({ delivered: true }) }),
    checkRow({ tracking: 'C-3', po_number: 'C-3' }),
    checkRow({ tracking: 'D-4', po_number: 'D-4', local: local({ scanned: true }) }),
  ]);
  assert.deepEqual(entries.map((e) => [e.status, e.reasonCode]), [
    ['not_received', 'delivered_not_scanned'],
    ['not_received', 'delivered_not_scanned'],
    ['not_received', 'in_transit'],
    ['received', 'scanned'],
  ]);
  const rows = ['A-1', 'B-2', 'C-3', 'D-4'].map(
    (po, i) => ({ id: i + 1, zoho_purchaseorder_number: po, tracking_number: null }) as ReceivingLineRow,
  );
  assert.deepEqual(filterRowsByRecon(rows, entries, 'not_received', 'delivered_not_scanned').map((r) => r.id), [1, 2]);
  assert.deepEqual(filterRowsByRecon(rows, entries, 'not_received').map((r) => r.id), [1, 2, 3]);
});

test('a reason param only applies inside its own status', () => {
  assert.equal(parseReconReasonParam('in_transit', 'not_received'), 'in_transit');
  assert.equal(parseReconReasonParam('in_transit', 'received'), null);
  assert.equal(parseReconReasonParam('in_transit', null), null);
  assert.equal(parseReconReasonParam('bogus', 'not_received'), null);
});
