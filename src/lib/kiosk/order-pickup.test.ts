import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePickupOrderRef } from './order-pickup';

test('parsePickupOrderRef — RS-prefixed and bare digits', () => {
  assert.deepEqual(parsePickupOrderRef('RS-125'), { repairId: 125, ticketCandidate: 'RS-125' });
  assert.deepEqual(parsePickupOrderRef('rs125'), { repairId: 125, ticketCandidate: 'rs125' });
  assert.deepEqual(parsePickupOrderRef('125'), { repairId: 125, ticketCandidate: '125' });
  assert.equal(parsePickupOrderRef('').repairId, null);
  assert.equal(parsePickupOrderRef('ABC-9').repairId, null);
  assert.equal(parsePickupOrderRef('ABC-9').ticketCandidate, 'ABC-9');
});
