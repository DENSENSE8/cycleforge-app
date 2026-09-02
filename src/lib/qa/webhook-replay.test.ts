import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZohoWebhook } from '@/lib/zoho/webhooks/normalize';

test('stored Zoho envelopes still classify through the production normalizer', () => {
  const event = normalizeZohoWebhook({
    event_id: 'evt-1',
    event_type: 'purchaseorder.updated',
    event_time: '2026-09-01T12:00:00Z',
    data: { purchaseorder: { purchaseorder_id: 'PO-1', line_items: [] } },
  });
  assert.equal(event.eventType, 'purchaseorder.updated');
  assert.equal(event.objectId, 'PO-1');
  assert.equal(event.eventId, 'evt-1');
});

test('a missing event_id still gets a deterministic synthetic id (idempotency key)', () => {
  const a = normalizeZohoWebhook({
    event_type: 'purchaseorder.created',
    event_time: '2026-09-01T12:00:00Z',
    data: { purchaseorder: { purchaseorder_id: 'PO-9' } },
  });
  const b = normalizeZohoWebhook({
    event_type: 'purchaseorder.created',
    event_time: '2026-09-01T12:00:00Z',
    data: { purchaseorder: { purchaseorder_id: 'PO-9' } },
  });
  assert.equal(a.eventId, b.eventId);
  assert.match(a.eventId, /^synth-/);
});
