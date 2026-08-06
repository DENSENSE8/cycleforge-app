import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSupportTicketDisplayLabel,
  formatSupportTicketLabel,
  normalizeReceivingTicketEntityRefs,
  pickTicketLinkAnchor,
  primaryTicketLabel,
  secondaryProviderLabel,
} from './tickets';

test('formatSupportTicketLabel uses internal registry id', () => {
  assert.equal(formatSupportTicketLabel(42), '#42');
});

test('formatSupportTicketDisplayLabel uses Zendesk external id for claims parity', () => {
  assert.equal(
    formatSupportTicketDisplayLabel({
      id: 7,
      provider: 'zendesk',
      externalTicketId: '9395',
      subjectCache: null,
      statusCache: null,
    }),
    '#9395',
  );
});

test('formatSupportTicketDisplayLabel falls back to internal id for internal tickets', () => {
  assert.equal(
    formatSupportTicketDisplayLabel({
      id: 42,
      provider: 'internal',
      externalTicketId: null,
      subjectCache: null,
      statusCache: null,
    }),
    '#42',
  );
});

test('primaryTicketLabel is always the internal registry id (operator primary)', () => {
  assert.equal(primaryTicketLabel(42), '#42');
  // Unlike formatSupportTicketDisplayLabel, it never prefers the provider id.
});

test('secondaryProviderLabel renders the provider id, or null for internal tickets', () => {
  assert.equal(secondaryProviderLabel({ provider: 'zendesk', externalTicketId: '9395' }), '#9395');
  assert.equal(secondaryProviderLabel({ provider: 'zendesk', externalTicketId: '#9395' }), '#9395');
  assert.equal(secondaryProviderLabel({ provider: 'internal', externalTicketId: null }), null);
  assert.equal(secondaryProviderLabel({ provider: 'zendesk', externalTicketId: '  ' }), null);
});

test('normalizeReceivingTicketEntityRefs drops placeholder line id without inventing carton', () => {
  assert.deepEqual(
    normalizeReceivingTicketEntityRefs({ lineId: -6936, receivingId: 6936 }),
    { lineId: null, receivingId: 6936 },
  );
  // Pending scan stub: hashed negative id + null receiving_id — never promote abs(hash).
  assert.deepEqual(
    normalizeReceivingTicketEntityRefs({ lineId: -6936, receivingId: null }),
    { lineId: null, receivingId: null },
  );
  assert.deepEqual(
    normalizeReceivingTicketEntityRefs({ lineId: 42, receivingId: 6936 }),
    { lineId: 42, receivingId: 6936 },
  );
});

test('pickTicketLinkAnchor prefers line > carton > shipment > order', () => {
  assert.deepEqual(
    pickTicketLinkAnchor({ lineId: 41, receivingId: 88, shipmentId: 555, orderId: 9 }),
    { entityType: 'RECEIVING_LINE', entityId: 41 },
  );
  assert.deepEqual(
    pickTicketLinkAnchor({ lineId: null, receivingId: 88, shipmentId: 555, orderId: 9 }),
    { entityType: 'RECEIVING', entityId: 88 },
  );
  assert.deepEqual(
    pickTicketLinkAnchor({ lineId: null, receivingId: null, shipmentId: 555, orderId: 9 }),
    { entityType: 'SHIPMENT', entityId: 555 },
  );
  assert.deepEqual(
    pickTicketLinkAnchor({ lineId: null, receivingId: null, shipmentId: null, orderId: 9 }),
    { entityType: 'ORDER', entityId: 9 },
  );
  assert.equal(pickTicketLinkAnchor({}), null);
});

test('pickTicketLinkAnchor ignores placeholder line id without inventing carton', () => {
  // Unmatched stubs always pass receivingId; pending scan hashes must not become cartons.
  assert.deepEqual(
    pickTicketLinkAnchor({ lineId: -88, receivingId: 88, shipmentId: 555 }),
    { entityType: 'RECEIVING', entityId: 88 },
  );
  assert.deepEqual(
    pickTicketLinkAnchor({ lineId: -88, receivingId: null, shipmentId: 555 }),
    { entityType: 'SHIPMENT', entityId: 555 },
  );
});
