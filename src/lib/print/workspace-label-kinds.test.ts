import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asListedPayloadToFace,
  resolveAsListedQrValue,
} from './printAsListedLabel';
import {
  ticketPayloadToFace,
  resolveTicketQrValue,
} from './printTicketLabel';
import {
  asListedAvailable,
  isWorkspaceLabelAvailable,
  listAvailableLabelOptions,
  resolveActiveLabelKind,
  UNBOX_LABEL_KINDS,
  type WorkspaceLabelContext,
} from './workspace-label-kinds';

test('asListedPayloadToFace uses AS LISTED kicker and disclosure center', () => {
  const face = asListedPayloadToFace({
    disclosure: 'Screen scratches as listed',
    conditionCode: 'USED_A',
    corner: 'eBay',
    date: '7/15/26',
    receivingLineId: 42,
  });
  assert.equal(face.topLeft, 'AS LISTED');
  assert.equal(face.center, 'Screen scratches as listed');
  assert.equal(face.bottomRight, 'eBay');
  assert.equal(face.matrix.value, 'L-42');
  assert.equal(face.hri, 'L-42');
});

test('resolveAsListedQrValue prefers line handle then carton', () => {
  assert.equal(
    resolveAsListedQrValue({
      disclosure: 'x',
      conditionCode: 'USED_A',
      corner: 'PO',
      receivingId: 9,
    }),
    'R-9',
  );
});

test('ticketPayloadToFace centers #ticket and encodes T- handle', () => {
  const face = ticketPayloadToFace({
    ticketDigits: '9395',
    context: 'SKU-1',
    platform: 'Amazon',
  });
  assert.equal(face.center, '#9395');
  assert.equal(face.matrix.value, 'T-9395');
  assert.equal(resolveTicketQrValue({ ticketDigits: '#9395' }), 'T-9395');
});

test('asListedAvailable for RETURN / TRADE_IN / disclosure note', () => {
  assert.equal(asListedAvailable({ receivingType: 'RETURN', disclosureNote: '' }), true);
  assert.equal(asListedAvailable({ receivingType: 'TRADE_IN', disclosureNote: null }), true);
  assert.equal(asListedAvailable({ receivingType: 'PO', disclosureNote: 'crack on lid' }), true);
  assert.equal(asListedAvailable({ receivingType: 'PO', disclosureNote: '  ' }), false);
});

test('UNBOX_LABEL_KINDS filters by availability', () => {
  const ctx: WorkspaceLabelContext = {
    hasCarton: true,
    scanValue: 'RCV-1',
    sku: 'ABC',
    receivingType: 'RETURN',
    disclosureNote: 'as listed',
    ticketDigits: '9395',
    cartonPayload: {
      scanValue: 'RCV-1',
      platform: 'eBay',
      notes: '',
      conditionCode: 'USED_A',
      date: '7/15/26',
      receivingId: 1,
    },
    unitInput: { sku: 'ABC' },
    asListedPayload: {
      disclosure: 'as listed',
      conditionCode: 'USED_A',
      corner: 'eBay',
      receivingId: 1,
    },
    ticketPayload: { ticketDigits: '9395' },
  };
  const opts = listAvailableLabelOptions(UNBOX_LABEL_KINDS, ctx);
  assert.deepEqual(
    opts.map((o) => o.kind),
    ['carton', 'unit', 'as_listed', 'ticket_minimal'],
  );
  assert.equal(isWorkspaceLabelAvailable('ticket_minimal', { ...ctx, ticketDigits: '' }), false);
  assert.equal(resolveActiveLabelKind('unit', opts), 'unit');
  assert.equal(resolveActiveLabelKind('missing', opts), 'carton');
});
