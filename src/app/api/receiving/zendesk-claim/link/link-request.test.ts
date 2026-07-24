import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ClaimTicketLinkBody,
  ClaimTicketLinkSearchQuery,
  ClaimTicketUnlinkQuery,
} from './link-request';

test('ClaimTicketLinkBody accepts positive lineId', () => {
  const parsed = ClaimTicketLinkBody.safeParse({
    receivingId: 50033,
    lineId: 30473,
    ticketId: 9600,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data, {
    receivingId: 50033,
    lineId: 30473,
    ticketId: 9600,
  });
});

test('ClaimTicketLinkBody drops placeholder / empty lineId to carton-level', () => {
  for (const lineId of [-50033, 0, null, '', 'null', undefined] as const) {
    const parsed = ClaimTicketLinkBody.safeParse({
      receivingId: 50033,
      lineId,
      ticketId: 9600,
    });
    assert.equal(parsed.success, true, `lineId=${JSON.stringify(lineId)}`);
    if (!parsed.success) continue;
    assert.equal(parsed.data.lineId, undefined);
    assert.equal(parsed.data.receivingId, 50033);
    assert.equal(parsed.data.ticketId, 9600);
  }
});

test('ClaimTicketLinkBody coerces string ids', () => {
  const parsed = ClaimTicketLinkBody.safeParse({
    receivingId: '50033',
    lineId: '99',
    ticketId: '9600',
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data, {
    receivingId: 50033,
    lineId: 99,
    ticketId: 9600,
  });
});

test('ClaimTicketLinkBody rejects missing receivingId / ticketId', () => {
  assert.equal(
    ClaimTicketLinkBody.safeParse({ lineId: 1, ticketId: 9600 }).success,
    false,
  );
  assert.equal(
    ClaimTicketLinkBody.safeParse({ receivingId: 50033, lineId: 1 }).success,
    false,
  );
});

test('ClaimTicketLinkSearchQuery omits bad lineId from query string shapes', () => {
  const parsed = ClaimTicketLinkSearchQuery.safeParse({
    receivingId: '50033',
    lineId: '-6936',
    query: '  #9600  ',
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.lineId, undefined);
  assert.equal(parsed.data.receivingId, 50033);
  assert.equal(parsed.data.query, '#9600');
});

test('ClaimTicketUnlinkQuery accepts carton-level unlink (no lineId)', () => {
  const parsed = ClaimTicketUnlinkQuery.safeParse({
    receivingId: 50033,
    ticketId: 9600,
    lineId: '',
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.lineId, undefined);
});
