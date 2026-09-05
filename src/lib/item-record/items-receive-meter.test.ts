/**
 *   node --import tsx --test src/lib/item-record/items-receive-meter.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { itemsReceiveMeterCopy } from './items-receive-meter';

test('PLAN example is 2 lines · 1 received · 1 open', () => {
  assert.equal(
    itemsReceiveMeterCopy([
      { quantity_expected: 1, quantity_received: 1 },
      { quantity_expected: 1, quantity_received: 0 },
    ]),
    '2 lines · 1 received · 1 open',
  );
});

test('zero buckets stay off the string', () => {
  assert.equal(
    itemsReceiveMeterCopy([
      { quantity_expected: 2, quantity_received: 2 },
      { quantity_expected: 1, quantity_received: 1 },
    ]),
    '2 lines · 2 received',
  );
  assert.equal(
    itemsReceiveMeterCopy([{ quantity_expected: 1, quantity_received: 0 }]),
    '1 line · 1 open',
  );
});

test('partial and leftover codes are named, not folded into open', () => {
  assert.equal(
    itemsReceiveMeterCopy([
      { quantity_expected: 3, quantity_received: 1 },
      { quantity_expected: 2, quantity_received: 0, exception_code: 'SHORT' },
    ]),
    '2 lines · 1 partial · 1 leftover',
  );
});

test('empty carton is 0 lines', () => {
  assert.equal(itemsReceiveMeterCopy([]), '0 lines');
});

test('accordion header is the meter, not PO items · N', () => {
  const src = readFileSync('src/components/receiving/workspace/PoLinesAccordion.tsx', 'utf8');
  assert.match(src, /itemsReceiveMeterCopy/);
  assert.doesNotMatch(src, /PO items · \{/);
});
