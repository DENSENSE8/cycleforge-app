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
  workspaceLabelToFace,
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

/**
 * Grain: the PO/carton label and the per-item label must be two visibly
 * DISTINCT faces, not the same face with different text. `labelFace.ts` encodes
 * that as two layout families — `receiving` (4-corner grid with a center band)
 * vs `product` (full-width title row, no center) — so the divergence is
 * structural and cannot be undone by editing copy. Pinned here because the
 * carton face is the only one that carries the printed note (`label_note`),
 * which is exactly the buffer split out of `notes` on 2026-07-31.
 */
test('carton and unit labels resolve to structurally different faces', () => {
  const ctx: WorkspaceLabelContext = {
    hasCarton: true,
    scanValue: 'PO-1234',
    sku: 'ABC-1',
    receivingType: 'PO',
    disclosureNote: '',
    ticketDigits: '',
    cartonPayload: {
      scanValue: 'PO-1234',
      platform: 'eBay',
      // The printed center text — sourced from receiving_line.label_note, NOT
      // from the operator's item note.
      notes: 'Left speaker rattles',
      conditionCode: 'USED_A',
      date: '7/31/26',
      receivingId: 7,
    },
    unitInput: { sku: 'ABC-1', title: 'Yamaha HS8 Monitor', condition: 'USED_A' },
  };

  const carton = workspaceLabelToFace('carton', ctx);
  const unit = workspaceLabelToFace('unit', ctx);
  assert.ok(carton && unit, 'both grains must resolve a face');

  // Different layout families → the operator can tell them apart on the bench.
  assert.notEqual(carton!.kind, unit!.kind);
  assert.equal(unit!.kind, 'product');

  // Only the carton face carries the printed note in its center band.
  assert.equal(carton!.center, 'Left speaker rattles');
  assert.equal(unit!.center, '');

  // The item face leads with the product title; the carton face leads with
  // platform · type. Same string in the same slot would defeat the point.
  assert.equal(unit!.topLeft, 'Yamaha HS8 Monitor');
  assert.notEqual(carton!.topLeft, unit!.topLeft);
});

test('the carton face center is the label buffer, so an item note cannot leak onto it', () => {
  // `disclosureNote` (the As Listed / label-face text) is deliberately NOT the
  // source of the carton center — the carton center comes from the payload the
  // label editor builds. Passing an item note here must change nothing.
  const base: WorkspaceLabelContext = {
    hasCarton: true,
    scanValue: 'PO-1',
    sku: 'S',
    receivingType: 'PO',
    disclosureNote: '',
    ticketDigits: '',
    cartonPayload: {
      scanValue: 'PO-1',
      platform: 'eBay',
      notes: 'printed face text',
      conditionCode: 'USED_A',
      date: '7/31/26',
      receivingId: 1,
    },
  };
  const withItemNote: WorkspaceLabelContext = {
    ...base,
    disclosureNote: 'internal: customer was rude, do not print',
  };
  assert.equal(
    workspaceLabelToFace('carton', base)!.center,
    workspaceLabelToFace('carton', withItemNote)!.center,
  );
  assert.equal(workspaceLabelToFace('carton', withItemNote)!.center, 'printed face text');
});
