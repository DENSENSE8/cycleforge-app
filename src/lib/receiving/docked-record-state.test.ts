import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReceivingLineRow } from './receiving-line-row';
import { dockedCartonFlags, dockedFlags, dockedIntakeKind, dockedNextStep, dockedPackageRecordFace, dockedReceivedQuantity, dockedReceivingState, dockedRecordFace, dockedTicketLabels } from './docked-record-state';
import { isClaimCode, isInvestigationCode } from './exception-codes';
import { receivingLineMatchesQuery } from './receiving-line-search';

const row = (fields: Partial<ReceivingLineRow>) => fields as ReceivingLineRow;
const damaged = (ticket: string | null = '#1') => [{ code: 'DAMAGED', ticket }];

test('expected and unknown records do not manufacture warehouse receipt or scan', () => {
  assert.equal(dockedReceivingState(row({ workflow_status: 'EXPECTED' })).id, 'UNKNOWN');
  assert.equal(dockedReceivingState(row({ delivery_state: 'IN_TRANSIT' })).id, 'IN_TRANSIT');
  assert.equal(dockedReceivingState(row({ workflow_status: 'MATCHED' })).id, 'SCANNED');
});

test('history is receiving only: scanned → received, with exceptions kept apart', () => {
  // QC results never make a History state — received is received, whatever QC said.
  for (const [workflow_status, qa_status] of [['DONE', 'PASSED'], ['DONE', 'PENDING'], ['PASSED', 'PASSED'], ['AWAITING_TEST', 'PENDING'], ['UNBOXED', 'PENDING']]) {
    assert.equal(dockedReceivingState(row({ id: 1, workflow_status, qa_status })).id, 'RECEIVED');
  }
  assert.equal(dockedReceivingState(row({ id: 1, workflow_status: 'FAILED', unboxed_at: '2026-09-25' })).id, 'EXCEPTION');
  // Unboxed is received: a line still MATCHED in an opened carton is in the building.
  assert.equal(dockedReceivingState(row({ id: 1, workflow_status: 'MATCHED', unboxed_at: '2026-09-25' })).id, 'RECEIVED');
  assert.equal(dockedReceivingState(row({ id: 1, received_at: '2026-09-25' })).id, 'SCANNED');
});

test('Docked never infers a contents discrepancy before the package is opened', () => {
  const unopened = row({ id: 1, scanned_at: '2026-09-29T17:00:00Z', quantity_received: 0, quantity_expected: 4 });
  assert.equal(dockedPackageRecordFace(unopened).id, 'DOCKED');
  assert.equal(dockedPackageRecordFace(unopened).label, 'Docked');
});

test('a card wears its most urgent attention, and only a clean line reads Unboxed', () => {
  const clean = { id: 1, workflow_status: 'DONE', received_done_at: '2026-09-25', quantity_received: 1, quantity_expected: 1 };
  assert.equal(dockedRecordFace(row(clean)).id, 'RECEIVED');
  assert.equal(dockedRecordFace(row({ ...clean, quantity_received: 0 })).id, 'SHORT');
  assert.equal(dockedRecordFace(row({ ...clean, quantity_received: 0, claim_ticket: '#1', ticket_reasons: damaged() })).id, 'CLAIM');
  assert.equal(dockedRecordFace(row({ ...clean, workflow_status: 'FAILED', claim_ticket: '#1', ticket_reasons: damaged() })).id, 'EXCEPTION');
  assert.equal(dockedRecordFace(row({ id: -5, unboxed_at: '2026-09-25' })).id, 'UNFOUND');
  // A line added to an unmatched carton stops being unfound once paired to a PO.
  assert.equal(dockedRecordFace(row({ ...clean, receiving_source: 'unmatched', zoho_purchaseorder_id: '9' })).id, 'RECEIVED');
  // The matching write can carry a PO number or marketplace order before its
  // internal PO id. Those are known goods, not an Unfound carton.
  assert.equal(dockedRecordFace(row({ ...clean, receiving_source: 'unmatched', zoho_purchaseorder_number: '15-15190-56779' })).id, 'RECEIVED');
  assert.equal(dockedRecordFace(row({ ...clean, receiving_source: 'unmatched', source_order_id: '111-8911758-3549041' })).id, 'RECEIVED');
});

test('next step is a verb the carton strip runs, else nothing', () => {
  const done = { id: 1, workflow_status: 'DONE', received_done_at: '2026-09-25', quantity_received: 1, quantity_expected: 1, sku: 'A-1', label_printed_at: '2026-09-25' };
  assert.equal(dockedNextStep(row(done)), null);
  assert.equal(dockedNextStep(row({ ...done, label_printed_at: null })), 'Print label');
  assert.equal(dockedNextStep(row({ ...done, quantity_received: 0 })), 'Claim');
  assert.equal(dockedNextStep(row({ ...done, workflow_status: 'FAILED' })), 'Claim');
  // A filed claim waits on its ticket; the label step still applies once it is filed.
  assert.equal(dockedNextStep(row({ ...done, quantity_received: 0, claim_ticket: '#1', ticket_reasons: damaged() })), null);
  // A short line whose only ticket is an investigation (or carries no reason) still owes a claim.
  assert.equal(dockedNextStep(row({ ...done, quantity_received: 0, claim_ticket: '#1', ticket_reasons: [{ code: 'NO_PO', ticket: '#1' }] })), 'Claim');
  assert.equal(dockedNextStep(row({ ...done, quantity_received: 0, claim_ticket: '#1' })), 'Claim');
  assert.equal(dockedNextStep(row({ id: -5, unboxed_at: '2026-09-25' })), 'Resolve');
});

test('zero received never displays the expected quantity as received', () => {
  assert.equal(dockedReceivedQuantity(row({ quantity_received: 0, quantity_expected: 5 })), 0);
  assert.equal(dockedReceivedQuantity(row({ quantity_expected: 5 })), 0);
  assert.equal(dockedReceivedQuantity(row({ quantity_received: 2, quantity_expected: 5 })), 2);
});

test('an opened unfound carton is received; a bare DONE placeholder is not', () => {
  assert.equal(dockedReceivingState(row({ id: -53302, workflow_status: 'DONE', quantity_received: 0, unboxed_at: '2026-09-24T22:04:14Z' })).id, 'RECEIVED');
  assert.equal(dockedReceivingState(row({ id: -53302, workflow_status: 'DONE', unbox_opened_at: '2026-09-24T22:04:14Z' })).id, 'RECEIVED');
  assert.equal(dockedReceivingState(row({ id: -53302, workflow_status: 'DONE', quantity_received: 0 })).id, 'UNKNOWN');
  assert.equal(dockedReceivingState(row({ id: 32605, workflow_status: 'DONE', quantity_received: 1, received_done_at: '2026-09-24T20:54:25Z' })).id, 'RECEIVED');
});

test('local history search preserves PO, tracking, SKU, serial, and marketplace identity', () => {
  const sample = row({ id: 123, sku: 'BOSE-418', source_order_id: 'ORDER-009', tracking_number: '1Z999', units: [{ serial: 'SN-123' }] as ReceivingLineRow['units'] });
  for (const q of [' bose-418 ', 'order-009', '1z999', 'sn-123', '123', '']) assert.ok(receivingLineMatchesQuery(sample, q), q);
  assert.equal(receivingLineMatchesQuery(sample, 'absent'), false);
});

test('a pasted list of order / tracking numbers finds ANY of them; plain words stay one phrase', () => {
  const a = row({ id: 1, zoho_purchaseorder_number: '15-15190-56779', tracking_number: '1Z3Y496R0398693994' });
  const b = row({ id: 2, source_order_id: '113-0586702-7374608', tracking_number: '1Z14V5340315836555' });
  const c = row({ id: 3, item_name: 'Bose Wave Radio', zoho_purchaseorder_number: '65411608' });
  const hits = (q: string) => [a, b, c].filter((r) => receivingLineMatchesQuery(r, q)).map((r) => r.id);
  // One per line, comma-separated, or spaced — order # and tracking mixed.
  assert.deepEqual(hits('15-15190-56779\n1Z14V5340315836555'), [1, 2]);
  assert.deepEqual(hits('15-15190-56779, 113-0586702-7374608, 65411608'), [1, 2, 3]);
  assert.deepEqual(hits('1z3y496r0398693994 NOPE-99999'), [1]);
  // Words are not a list: "bose wave" is a phrase, "bose 251" too (251 is not id-shaped).
  assert.deepEqual(hits('bose wave'), [3]);
  assert.deepEqual(hits('wave bose'), []);
  assert.deepEqual(hits('bose 251'), []);
});

test('attention pills: claim, short and unfound are read off the line, and combine', () => {
  assert.deepEqual(dockedFlags(row({ id: 1, quantity_received: 1, quantity_expected: 1 })), []);
  assert.deepEqual(dockedFlags(row({ id: 1, claim_ticket: '#48213', ticket_reasons: [{ code: 'SHORT', ticket: '#48213' }], quantity_received: 0, quantity_expected: 2 })), ['CLAIM', 'SHORT']);
  // A ticket that only mentions the shipment is not a claim.
  assert.deepEqual(dockedFlags(row({ id: 1, zendesk_ticket: '#9912', claim_ticket: null, quantity_received: 1, quantity_expected: 1 })), []);
  // Over-received is not short; an unknown expectation is not short.
  assert.deepEqual(dockedFlags(row({ id: 1, quantity_received: 3, quantity_expected: 2 })), []);
  assert.deepEqual(dockedFlags(row({ id: 1, quantity_received: 0, quantity_expected: null })), []);
  // An unfound placeholder has no line to be short against; a line on an unmatched carton is unfound too.
  assert.deepEqual(dockedFlags(row({ id: -53339, quantity_received: 0, quantity_expected: 1 })), ['UNFOUND']);
  assert.deepEqual(dockedFlags(row({ id: 7, receiving_source: 'unmatched', quantity_received: 1, quantity_expected: 1 })), ['UNFOUND']);
  assert.deepEqual(dockedFlags(row({ id: 1, claim_ticket: '   ', quantity_received: 1, quantity_expected: 1 })), []);
});

test('ticket reason families: investigations answer "what is this", claims "who owes us"', () => {
  for (const code of ['NO_PO', 'RETURN_NO_ORDER', 'CARRIER_MISMATCH']) {
    assert.ok(isInvestigationCode(code), code);
    assert.ok(!isClaimCode(code), code);
  }
  for (const code of ['SHORT', 'OVER', 'DAMAGED', 'WRONG_ITEM', 'DEFECTIVE', 'INCOMPLETE', 'LOST_IN_TRANSIT', 'EMPTY_BOX', 'MISDELIVERED', 'STOLEN']) {
    assert.ok(isClaimCode(code), code);
    assert.ok(!isInvestigationCode(code), code);
  }
  // Photo waivers are neither: they never make a ticket reason.
  assert.ok(!isClaimCode('PHOTO_WAIVED_DEFERRED') && !isInvestigationCode('PHOTO_WAIVED_DEFERRED'));
});

test('an investigation ticket is Unfound, a reasoned claim is Claim, a reasonless ticket is neither', () => {
  const investigating = row({ id: -5, unboxed_at: '2026-09-25', claim_ticket: '#10066', ticket_reasons: [{ code: 'NO_PO', ticket: '#10066' }] });
  assert.deepEqual(dockedFlags(investigating), ['UNFOUND']);
  assert.deepEqual(dockedTicketLabels(investigating), [{ ticket: '#10066', label: 'Investigating', family: 'investigation' }]);

  const paired = row({ id: 9, quantity_received: 1, quantity_expected: 1, claim_ticket: '#10066', ticket_reasons: damaged('#10066') });
  assert.deepEqual(dockedFlags(paired), ['CLAIM']);
  assert.deepEqual(dockedTicketLabels(paired), [{ ticket: '#10066', label: 'Damaged', family: 'claim' }]);

  const legacy = row({ id: 9, quantity_received: 1, quantity_expected: 1, claim_ticket: '#48213', ticket_reasons: [] });
  assert.deepEqual(dockedFlags(legacy), []);
  assert.deepEqual(dockedTicketLabels(legacy), [{ ticket: '#48213', label: 'Ticket', family: null }]);

  // A claim code flagged with no ticket is a reason, not a filed claim.
  assert.deepEqual(dockedFlags(row({ id: 9, quantity_received: 1, quantity_expected: 1, ticket_reasons: damaged(null) })), []);
});

test('a carton that is both under investigation and claimed shows both tickets, investigation first', () => {
  const both = row({
    id: 9,
    claim_ticket: '#2',
    ticket_reasons: [{ code: 'DAMAGED', ticket: '#2' }, { code: 'NO_PO', ticket: '#1' }],
  });
  assert.deepEqual(dockedTicketLabels(both).map((t) => `${t.label} ${t.ticket}`), ['Investigating #1', 'Damaged #2']);
});

test('unfound is red and outranks claim and short; an exception still outranks unfound', () => {
  const unmatched = { id: 7, receiving_source: 'unmatched', workflow_status: 'DONE', received_done_at: '2026-09-25' };
  const claimedShort = { quantity_received: 0, quantity_expected: 2, claim_ticket: '#1', ticket_reasons: damaged() };
  const face = dockedRecordFace(row({ ...unmatched, ...claimedShort }));
  assert.equal(face.id, 'UNFOUND');
  assert.equal(face.tone, 'danger');
  assert.deepEqual(dockedFlags(row({ ...unmatched, ...claimedShort })), ['UNFOUND', 'CLAIM', 'SHORT']);
  assert.equal(dockedRecordFace(row({ ...unmatched, ...claimedShort, workflow_status: 'FAILED' })).id, 'EXCEPTION');
  // Paired, the same line falls back to its claim.
  assert.equal(dockedRecordFace(row({ ...unmatched, ...claimedShort, zoho_purchaseorder_id: '9' })).id, 'CLAIM');
});

test('carton pills: every flag its lines wear, in pill order; a clean carton wears none', () => {
  const cleanLine = { workflow_status: 'DONE', received_done_at: '2026-09-25', quantity_received: 1, quantity_expected: 1 };
  assert.deepEqual(dockedCartonFlags([row({ id: 1, ...cleanLine }), row({ id: 2, ...cleanLine })]), []);
  // One short line makes the carton Short.
  assert.deepEqual(dockedCartonFlags([row({ id: 1, ...cleanLine }), row({ id: 2, ...cleanLine, quantity_received: 0 })]), ['SHORT']);
  // Pill order holds across lines.
  assert.deepEqual(
    dockedCartonFlags([row({ id: 1, ...cleanLine, quantity_received: 0 }), row({ id: 2, ...cleanLine, receiving_source: 'unmatched' })]),
    ['UNFOUND', 'SHORT'],
  );
});

test('a claim with no recorded reason still counts as a Claim and reads "Claim #…"', () => {
  const unspecified = row({ id: 9, quantity_received: 1, quantity_expected: 1, claim_ticket: '#7', ticket_reasons: [{ code: 'CLAIM_UNSPECIFIED', ticket: '#7' }] });
  assert.deepEqual(dockedFlags(unspecified), ['CLAIM']);
  assert.deepEqual(dockedTicketLabels(unspecified), [{ ticket: '#7', label: 'Claim', family: 'claim' }]);
});

test('intake kind: a line override beats the carton, repair is its own kind', () => {
  assert.equal(dockedIntakeKind(row({})), 'purchase');
  assert.equal(dockedIntakeKind(row({ carton_intake_type: 'RETURN' })), 'return');
  assert.equal(dockedIntakeKind(row({ intake_type: 'trade_in', carton_intake_type: 'PO' })), 'trade_in');
  assert.equal(dockedIntakeKind(row({ carton_intake_type: 'repair' })), 'repair');
  assert.equal(dockedIntakeKind(row({ receiving_type: 'PO', carton_intake_type: 'RETURN' })), 'return');
});
