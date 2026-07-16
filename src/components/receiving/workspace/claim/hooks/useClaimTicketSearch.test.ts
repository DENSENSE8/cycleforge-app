import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimTicketSearchParams } from './useClaimTicketSearch';

test('buildClaimTicketSearchParams omits lineId when null', () => {
  const params = buildClaimTicketSearchParams({ receivingId: 42, lineId: null });
  assert.equal(params.get('receivingId'), '42');
  assert.equal(params.has('lineId'), false);
});

test('buildClaimTicketSearchParams omits lineId when undefined', () => {
  const params = buildClaimTicketSearchParams({ receivingId: 42 });
  assert.equal(params.has('lineId'), false);
});

test('buildClaimTicketSearchParams omits non-positive lineId', () => {
  assert.equal(buildClaimTicketSearchParams({ receivingId: 42, lineId: 0 }).has('lineId'), false);
  assert.equal(buildClaimTicketSearchParams({ receivingId: 42, lineId: -6936 }).has('lineId'), false);
});

test('buildClaimTicketSearchParams includes positive lineId', () => {
  const params = buildClaimTicketSearchParams({ receivingId: 42, lineId: 99 });
  assert.equal(params.get('lineId'), '99');
});

test('buildClaimTicketSearchParams includes trimmed query', () => {
  const params = buildClaimTicketSearchParams({ receivingId: 42, query: '  #12345  ' });
  assert.equal(params.get('query'), '#12345');
});

test('buildClaimTicketSearchParams omits empty query', () => {
  const params = buildClaimTicketSearchParams({ receivingId: 42, query: '   ' });
  assert.equal(params.has('query'), false);
});
