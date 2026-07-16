import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSupportContextLinkable,
  pickSupportContextAnchorMeta,
  pickSupportContextThreadEntity,
} from './context-anchor';

test('pickSupportContextThreadEntity prefers line > carton > order', () => {
  assert.deepEqual(
    pickSupportContextThreadEntity({ lineId: 41, receivingId: 88, orderRowId: 9 }),
    { entityType: 'RECEIVING_LINE', entityId: 41 },
  );
  assert.deepEqual(
    pickSupportContextThreadEntity({ lineId: null, receivingId: 88, orderRowId: 9 }),
    { entityType: 'RECEIVING', entityId: 88 },
  );
  assert.deepEqual(
    pickSupportContextThreadEntity({ lineId: null, receivingId: null, orderRowId: 9 }),
    { entityType: 'ORDER', entityId: 9 },
  );
  assert.equal(
    pickSupportContextThreadEntity({ lineId: null, receivingId: null, orderRowId: null }),
    null,
  );
});

test('buildSupportContextLinkable: ticket→SHIPMENT→receiving promotion path', () => {
  // Pre-linked STN only (no carton yet) → shipment anchor
  assert.deepEqual(
    buildSupportContextLinkable({
      lineId: null,
      receivingId: null,
      shipmentId: 555,
      tracking: '1Z999',
    }),
    {
      canLinkTicket: true,
      anchorType: 'shipment',
      anchorId: 555,
      trackingNumber: '1Z999',
      receivingId: null,
      lineId: null,
    },
  );

  // After dock scan: carton open → receiving wins over shipment
  assert.deepEqual(
    buildSupportContextLinkable({
      lineId: null,
      receivingId: 88,
      shipmentId: 555,
      tracking: '1Z999',
    }),
    {
      canLinkTicket: true,
      anchorType: 'receiving',
      anchorId: 88,
      receivingId: 88,
      lineId: null,
      trackingNumber: '1Z999',
    },
  );

  // Line open → RECEIVING_LINE
  assert.equal(
    buildSupportContextLinkable({
      lineId: 41,
      receivingId: 88,
      shipmentId: 555,
    })?.anchorType,
    'receiving',
  );
  assert.equal(
    buildSupportContextLinkable({
      lineId: 41,
      receivingId: 88,
      shipmentId: 555,
    })?.anchorId,
    41,
  );
});

test('buildSupportContextLinkable falls back to tracking then order', () => {
  assert.deepEqual(buildSupportContextLinkable({ tracking: '1ZABC' }), {
    canLinkTicket: true,
    anchorType: 'tracking',
    anchorId: 0,
    trackingNumber: '1ZABC',
  });
  assert.deepEqual(buildSupportContextLinkable({ orderRowId: 12 }), {
    canLinkTicket: true,
    anchorType: 'order',
    anchorId: 12,
  });
  assert.equal(buildSupportContextLinkable({}), null);
});

test('pickSupportContextAnchorMeta: ticket → receiving → tracking → order', () => {
  assert.deepEqual(
    pickSupportContextAnchorMeta({
      ticketScan: '#4821',
      ticketLabel: '#4821',
      receivingId: 88,
      tracking: '1Z999',
    }),
    { type: 'ticket', id: '4821', label: '#4821' },
  );
  assert.deepEqual(
    pickSupportContextAnchorMeta({ receivingId: 88, tracking: '1Z999' }),
    { type: 'receiving', id: 88, label: 'Carton #88' },
  );
  assert.deepEqual(
    pickSupportContextAnchorMeta({ tracking: '1Z999' }),
    { type: 'tracking', id: '1Z999', label: '1Z999' },
  );
  assert.deepEqual(
    pickSupportContextAnchorMeta({
      orderQ: '112-1',
      orderLabel: '112-1',
      orderRowId: 9,
    }),
    { type: 'order', id: 9, label: '112-1' },
  );
  assert.deepEqual(pickSupportContextAnchorMeta({}), {
    type: 'unknown',
    id: '',
    label: 'No match',
  });
});
