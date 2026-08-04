/**
 * Unit tests for carton-read Copy helpers.
 *
 * Run: `node --test --import tsx src/lib/receiving/carton-read-utilities.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCartonReadCopyText } from './carton-read-utilities';

test('buildCartonReadCopyText includes PO + receiving id + tracking', () => {
  const text = buildCartonReadCopyText({
    id: 12,
    zoho_purchaseorder_number: 'PO-99',
    tracking: '1Z999',
    received_at: null,
    qa_status: 'PENDING',
  });
  assert.match(text, /PO #PO-99/);
  assert.match(text, /Receiving #12/);
  assert.match(text, /Tracking: 1Z999/);
  assert.match(text, /QA: PENDING/);
  assert.match(text, /Received: -/);
});
