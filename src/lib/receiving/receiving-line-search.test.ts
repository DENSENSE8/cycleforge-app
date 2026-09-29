import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReceivingLineRow } from './receiving-line-row';
import { receivingLineMatchesQuery, receivingTrackingMatchesQuery } from './receiving-line-search';

test('tracking lookup matches the trailing digits across stored punctuation', () => {
  const tracking = '1Z 999-AA1-0123-4567-84';
  assert.equal(receivingTrackingMatchesQuery(tracking, '456784'), true);
  assert.equal(receivingTrackingMatchesQuery(tracking, '1Z999AA10123456784'), true);
  assert.equal(receivingTrackingMatchesQuery(tracking, '456785'), false);
});

test('Docked local Find includes tracking suffixes', () => {
  const row = { tracking_number: '9434 6501 0615 1136 7258 72' } as ReceivingLineRow;
  assert.equal(receivingLineMatchesQuery(row, '725872'), true);
});
