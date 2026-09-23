import assert from 'node:assert/strict';
import test from 'node:test';
import { wmsTicketRefreshDelayMs } from './wms-ticket-lifetime';

test('refreshes a WMS ticket before its server expiry', () => {
  const now = Date.parse('2027-01-15T08:00:00.000Z');
  assert.equal(
    wmsTicketRefreshDelayMs('2027-01-15T08:00:30.000Z', now),
    25_000,
  );
});

test('expired or malformed tickets reconnect promptly without a hot loop', () => {
  const now = Date.parse('2027-01-15T08:00:30.000Z');
  assert.equal(wmsTicketRefreshDelayMs('2027-01-15T08:00:29.000Z', now), 250);
  assert.equal(wmsTicketRefreshDelayMs('not-a-date', now), 250);
});

