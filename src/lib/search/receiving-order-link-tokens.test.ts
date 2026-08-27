/**
 *   node --import tsx --test src/lib/search/receiving-order-link-tokens.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { receivingOrderLinkTokens } from './receiving-order-link-tokens';

test('receivingOrderLinkTokens: local pickup, carton tracking, then line tracking', () => {
  assert.deepEqual(
    receivingOrderLinkTokens(
      { local_pickup_order_id: '111-222', tracking: '1Z999' },
      [{ tracking_number: '1Z888' }, { tracking_number: '1Z999' }],
    ),
    ['111-222', '1Z999', '1Z888'],
  );
});

test('receivingOrderLinkTokens: skips blanks and dedupes', () => {
  assert.deepEqual(
    receivingOrderLinkTokens({ local_pickup_order_id: '  ', tracking: 'ABC' }, [
      { tracking_number: 'ABC' },
    ]),
    ['ABC'],
  );
});
