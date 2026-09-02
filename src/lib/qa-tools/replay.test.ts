import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQaZohoReplayEnvelope, qaReplayRequiresDestructivePermission } from './replay';

test('QA Zoho replay envelope is deterministic and contains no credentials', () => {
  assert.deepEqual(
    buildQaZohoReplayEnvelope({
      eventId: 'qa_replay_purchase_001',
      eventType: 'purchaseorder.created',
      objectId: 'po-123',
    }),
    {
      event_id: 'qa_replay_purchase_001',
      event_type: 'purchaseorder.created',
      data: { id: 'po-123' },
    },
  );
});

test('QA Zoho replay envelope preserves the purchase-receive object key', () => {
  assert.deepEqual(
    buildQaZohoReplayEnvelope({
      eventId: 'qa_replay_receive_001',
      eventType: 'purchasereceive.created',
      objectId: 'receive-123',
    }),
    {
      event_id: 'qa_replay_receive_001',
      event_type: 'purchasereceive.created',
      data: { purchase_receive_id: 'receive-123' },
    },
  );
});

test('delete webhook replays are classified as destructive', () => {
  assert.equal(qaReplayRequiresDestructivePermission('purchaseorder.deleted'), true);
  assert.equal(qaReplayRequiresDestructivePermission('purchaseorder.updated'), false);
});
