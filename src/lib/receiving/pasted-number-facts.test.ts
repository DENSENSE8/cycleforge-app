import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReconEntry, ReconReason } from '@/lib/receiving/reconcile';
import {
  carrierFactText,
  duplicatePurchaseLineIds,
  pastedNumberFacts,
  pastedNumberNextStep,
  pastedNumberStateFace,
  shortDay,
  unitsState,
} from './pasted-number-facts';

const NOW = new Date('2026-10-03T12:00:00Z');

function line(patch: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    tracking_number: '383922113625',
    carrier: 'FEDEX',
    quantity_received: 0,
    quantity_expected: 1,
    item_name: 'Bose adapter',
    sku: '01113',
    unit_price: '12.50',
    po_date: '2026-09-23',
    vendor_name: 'rydogreclaims',
    ...patch,
  } as ReceivingLineRow;
}

function entry(reasonCode: ReconReason | null, patch: Partial<ReconEntry> = {}): ReconEntry {
  return {
    ref: '17-15191-28624',
    key: '171519128624',
    status: reasonCode === 'unboxed' || reasonCode === 'scanned' || reasonCode === 'received_here' ? 'received' : 'not_received',
    reasonCode,
    detail: reasonCode ? reasonCode : 'Checking…',
    pending: reasonCode == null,
    poNumber: '17-15191-28624',
    vendor: 'rydogreclaims',
    exception: null,
    ...patch,
  };
}

test('units sum over every line; one unknown expected makes the whole expected unknown', () => {
  const facts = pastedNumberFacts([line({ quantity_received: 1, quantity_expected: 1 }), line({ id: 2, quantity_received: 0, quantity_expected: 2 })], entry('unboxed'), NOW);
  assert.deepEqual(facts.units, { received: 1, expected: 3 });
  assert.equal(unitsState(facts.units), 'partial');
  const unknown = pastedNumberFacts([line({ quantity_expected: 1 }), line({ id: 2, quantity_expected: null })], entry('unboxed'), NOW);
  assert.equal(unknown.units.expected, null);
});

test('units: none, partial and all are the only receipt words', () => {
  assert.equal(unitsState({ received: 0, expected: 3 }), 'none');
  assert.equal(unitsState({ received: 2, expected: 3 }), 'partial');
  assert.equal(unitsState({ received: 3, expected: 3 }), 'all');
  assert.equal(unitsState({ received: 4, expected: 3 }), 'all');
});

// Real data (2026-10-04, 15-15078-20314): the Zoho PO line was received; an eBay
// import of the SAME purchase landed days later (its own carton, tracking mangled
// to "9.434608106245533e+21"), EXPECTED, never received. It read "1 of 2".
const zohoLine = (patch: Partial<ReceivingLineRow> = {}) =>
  line({ id: 31872, receiving_id: 52156, zoho_purchaseorder_number: '15-15078-20314', tracking_number: '9434608106245533522453', quantity_received: 1, quantity_expected: 1, sku: '00072-BK', ...patch });
const ebayTwin = (patch: Partial<ReceivingLineRow> = {}) =>
  line({ id: 32100, receiving_id: 52465, inbound_source_type: 'ebay', source_order_id: '15-15078-20314', zoho_purchaseorder_number: null, tracking_number: '9.434608106245533e+21', quantity_received: 0, quantity_expected: 1, sku: null, item_name: 'Bose Companion 2 Series III', ...patch });

test('a purchase counts once: an unreceived eBay twin of a Zoho PO line is named, never units', () => {
  const lines = [ebayTwin(), zohoLine()];
  assert.deepEqual([...duplicatePurchaseLineIds(lines)], [32100]);
  const facts = pastedNumberFacts(lines, entry('unboxed', { poNumber: '15-15078-20314' }), NOW);
  assert.deepEqual(facts.units, { received: 1, expected: 1 });
  assert.equal(unitsState(facts.units), 'all');
  assert.deepEqual(facts.duplicates, [32100]);
  // The facts read the counted line — never the twin's blank SKU or mangled tracking.
  assert.equal(facts.item.lines, 1);
  assert.equal(facts.item.sku, '00072-BK');
  assert.equal(facts.tracking, '9434608106245533522453');
});

test('a twin is a duplicate only by the merge rule: same purchase, eBay import, nothing received', () => {
  // Received on its own line: two receive events, not a phantom — kept, so the double count shows.
  assert.equal(duplicatePurchaseLineIds([ebayTwin({ quantity_received: 1 }), zohoLine()]).size, 0);
  // Another eBay order in the same carton is its own purchase.
  assert.equal(duplicatePurchaseLineIds([ebayTwin({ source_order_id: '16-15107-26018' }), zohoLine()]).size, 0);
  // No Zoho PO line in the number: nothing to be a twin of.
  assert.equal(duplicatePurchaseLineIds([ebayTwin()]).size, 0);
  // A Zoho line never counts as anyone's twin.
  assert.equal(duplicatePurchaseLineIds([zohoLine({ id: 1, quantity_received: 0 }), zohoLine()]).size, 0);
  // A real short (no twin) still reads short.
  const short = pastedNumberFacts([zohoLine({ quantity_received: 1, quantity_expected: 2 })], entry('unboxed'), NOW);
  assert.deepEqual([short.units, short.duplicates], [{ received: 1, expected: 2 }, []]);
});

test('age counts whole days from the earliest purchase date', () => {
  const facts = pastedNumberFacts([line({ po_date: '2026-09-23' }), line({ id: 2, po_date: '2026-09-25' })], entry('in_transit'), NOW);
  assert.deepEqual(facts.ordered, { at: '2026-09-23', ageDays: 10 });
  assert.equal(pastedNumberFacts([line({ po_date: null })], entry('in_transit'), NOW).ordered, null);
});

test('total is price × qty bought; an unpriced line marks the total partial', () => {
  const facts = pastedNumberFacts([line({ unit_price: '12.50', quantity_expected: 2 }), line({ id: 2, unit_price: null })], entry('in_transit'), NOW);
  assert.deepEqual(facts.total, { dollars: 25, partial: true });
  assert.equal(pastedNumberFacts([line({ unit_price: null })], entry('in_transit'), NOW).total, null);
});

test('carrier: delivered (with signer) outranks an ETA; no tracking says so', () => {
  const delivered = pastedNumberFacts(
    [line({ is_delivered: true, delivered_at: '2026-10-02T18:00:00Z', shipment_signed_by: 'MIKE' }), line({ id: 2, shipment_estimated_delivery_at: '2026-10-05' })],
    entry('delivered_not_scanned'),
    NOW,
  );
  assert.deepEqual(delivered.carrier, { kind: 'delivered', at: '2026-10-02T18:00:00Z', signedBy: 'MIKE' });
  // The carrier's own estimate outranks the PO's planned delivery date.
  const eta = pastedNumberFacts([line({ shipment_estimated_delivery_at: '2026-10-06', expected_delivery_date: '2026-10-05' })], entry('in_transit'), NOW);
  assert.deepEqual(eta.carrier, { kind: 'eta', at: '2026-10-06' });
  const planned = pastedNumberFacts([line({ expected_delivery_date: '2026-10-05' })], entry('in_transit'), NOW);
  assert.deepEqual(planned.carrier, { kind: 'eta', at: '2026-10-05' });
  assert.deepEqual(pastedNumberFacts([line({ tracking_number: null })], entry('open_po'), NOW).carrier, { kind: 'no_tracking' });
  assert.deepEqual(
    pastedNumberFacts([line({ shipment_delivery_attempts: 2, shipment_estimated_delivery_at: '2026-10-05' })], entry('in_transit'), NOW).carrier,
    { kind: 'attempted', count: 2 },
  );
  // No ETA: the carrier's status category, in words — never the raw enum.
  assert.deepEqual(pastedNumberFacts([line({ shipment_status: 'OUT_FOR_DELIVERY' })], entry('in_transit'), NOW).carrier, {
    kind: 'moving',
    label: 'Out for delivery',
  });
});

test('an opened box says how many units were counted; it never claims received for an uncounted box', () => {
  const uncounted = pastedNumberFacts([line({ quantity_received: 0, quantity_expected: 3 })], entry('unboxed'), NOW);
  const face = pastedNumberStateFace(entry('unboxed', { detail: 'Unboxed' }), uncounted);
  assert.equal(face.label, 'Unboxed · 0 of 3 received');
  assert.equal(face.tone, 'fulfillment');
  assert.deepEqual(pastedNumberNextStep(entry('unboxed'), uncounted), { label: 'Receive', tone: 'fulfillment', blocked: false });

  const counted = pastedNumberFacts([line({ quantity_received: 3, quantity_expected: 3 })], entry('unboxed'), NOW);
  assert.equal(pastedNumberStateFace(entry('unboxed', { detail: 'Unboxed' }), counted).label, 'Unboxed · all received');
  assert.equal(pastedNumberNextStep(entry('unboxed'), counted), null);
});

test('owed numbers ask the floor for the next physical step', () => {
  const none = pastedNumberFacts([], entry('no_match'), NOW);
  assert.equal(pastedNumberNextStep(entry('delivered_not_scanned'), none)?.label, 'Investigate');
  assert.equal(pastedNumberNextStep(entry('scanned'), none)?.label, 'Unbox');
  assert.equal(pastedNumberNextStep(entry('open_po'), none)?.label, 'Attach tracking');
  assert.equal(pastedNumberNextStep(entry('no_match'), none)?.blocked, true);
  assert.equal(pastedNumberNextStep(entry(null), none), null);
});

test("carrier words read like the sheet's notes, in the warehouse's day", () => {
  assert.equal(carrierFactText({ kind: 'delivered', at: '2026-10-02T18:00:00Z', signedBy: 'MIKE' }), 'Delivered Oct 2 · signed MIKE');
  // The Compact row's column: the signer is the Full card's, an attempt is one word.
  assert.equal(carrierFactText({ kind: 'delivered', at: '2026-10-02T18:00:00Z', signedBy: 'MIKE' }, true), 'Delivered Oct 2');
  assert.equal(carrierFactText({ kind: 'attempted', count: 2 }, true), 'Attempted ×2');
  // 03:00Z on Oct 3 is still Oct 2 in Los Angeles.
  assert.equal(shortDay('2026-10-03T03:00:00Z'), 'Oct 2');
  // A bare calendar day is never shifted a day back by the timezone.
  assert.equal(carrierFactText({ kind: 'eta', at: '2026-10-05' }), 'ETA Oct 5');
  assert.equal(carrierFactText({ kind: 'attempted', count: 1 }), 'Delivery attempted');
  assert.equal(carrierFactText({ kind: 'unknown' }), null);
});
