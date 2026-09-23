import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutboundSlaCountdown } from './outbound-sla';

const NOW = Date.parse('2026-09-17T12:00:00Z');

test('does not invent an exact SLA countdown from a date-only field', () => {
  assert.deepEqual(resolveOutboundSlaCountdown('2026-09-17', NOW), {
    label: 'No SLA assigned', tone: 'neutral', exact: false,
  });
});

test('uses semantic warning and danger bands for exact deadlines', () => {
  assert.equal(resolveOutboundSlaCountdown('2026-09-17T12:45:00Z', NOW).tone, 'warning');
  assert.equal(resolveOutboundSlaCountdown('2026-09-17T12:14:00Z', NOW).tone, 'danger');
  assert.equal(resolveOutboundSlaCountdown('2026-09-17T11:55:00Z', NOW).label, 'Late 5m');
});
