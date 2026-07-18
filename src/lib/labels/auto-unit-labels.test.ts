import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_AUTO_UNIT_LABELS,
  resolveLabelIssueSerials,
} from './auto-unit-labels';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

test('auto-unit expands quantity into stable synthetic serial keys', () => {
  const first = resolveLabelIssueSerials({
    printClass: 'auto-unit',
    serialNumbers: [],
    quantity: 3,
    clientEventId: EVENT_ID,
  });
  const retry = resolveLabelIssueSerials({
    printClass: 'auto-unit',
    serialNumbers: [],
    quantity: 3,
    clientEventId: EVENT_ID,
  });

  assert.deepEqual(first, {
    ok: true,
    synthetic: true,
    serials: [
      `AUTO-${EVENT_ID}-001`,
      `AUTO-${EVENT_ID}-002`,
      `AUTO-${EVENT_ID}-003`,
    ],
  });
  assert.deepEqual(retry, first, 'a retry must address the same serial_units rows');
});

test('auto-unit rejects missing idempotency and out-of-range quantities', () => {
  const missingEvent = resolveLabelIssueSerials({
    printClass: 'auto-unit',
    serialNumbers: [],
    quantity: 1,
    clientEventId: null,
  });
  const tooMany = resolveLabelIssueSerials({
    printClass: 'auto-unit',
    serialNumbers: [],
    quantity: MAX_AUTO_UNIT_LABELS + 1,
    clientEventId: EVENT_ID,
  });

  assert.equal(missingEvent.ok, false);
  assert.equal(tooMany.ok, false);
});

test('manufacturer-serial modes preserve the supplied serials', () => {
  const result = resolveLabelIssueSerials({
    printClass: 'print',
    serialNumbers: ['OEM-1', 'OEM-2'],
    quantity: undefined,
    clientEventId: null,
  });

  assert.deepEqual(result, {
    ok: true,
    synthetic: false,
    serials: ['OEM-1', 'OEM-2'],
  });
});

test('manufacturer-serial modes cap batch fanout', () => {
  const result = resolveLabelIssueSerials({
    printClass: 'sn-to-sku',
    serialNumbers: Array.from({ length: MAX_AUTO_UNIT_LABELS + 1 }, (_, index) => `OEM-${index}`),
    quantity: undefined,
    clientEventId: null,
  });

  assert.equal(result.ok, false);
});
