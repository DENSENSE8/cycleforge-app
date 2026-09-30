/** DB-free validation tests for the support ticket link / create request schemas. */

import { test } from 'node:test';
import { deepEqual, ok, throws } from 'node:assert';
import {
  parseTicketLinkAnchorSearch,
  SupportTicketCreateBody,
  TicketLinkBody,
} from './support-tickets';

test('link search: anchorType=repair resolves to the repair anchor', () => {
  const sp = new URLSearchParams({ anchorType: 'repair', repairId: '4894' });
  deepEqual(parseTicketLinkAnchorSearch(sp), { type: 'repair', repairId: 4894 });
});

test('link search: a repair anchor without a positive repairId is rejected', () => {
  throws(() => parseTicketLinkAnchorSearch(new URLSearchParams({ anchorType: 'repair' })));
  throws(() => parseTicketLinkAnchorSearch(new URLSearchParams({ anchorType: 'repair', repairId: '0' })));
  // An order id is not a repair id — the repair branch never falls through to order.
  throws(() => parseTicketLinkAnchorSearch(new URLSearchParams({ anchorType: 'repair', orderId: '12' })));
});

test('link search: an unknown anchorType is rejected', () => {
  throws(() => parseTicketLinkAnchorSearch(new URLSearchParams({ anchorType: 'carton', repairId: '1' })));
});

test('link body: the repair anchor validates', () => {
  const r = TicketLinkBody.safeParse({ ticketId: 1, anchor: { type: 'repair', repairId: 4894 } });
  ok(r.success);
  deepEqual(r.data.anchor, { type: 'repair', repairId: 4894 });
});

test('link body: the repair anchor needs a numeric positive repairId', () => {
  ok(!TicketLinkBody.safeParse({ ticketId: 1, anchor: { type: 'repair', repairId: '4894' } }).success);
  ok(!TicketLinkBody.safeParse({ ticketId: 1, anchor: { type: 'repair', repairId: 0 } }).success);
  ok(!TicketLinkBody.safeParse({ ticketId: 1, anchor: { type: 'repair' } }).success);
});

test('create body: the repair anchor validates (string id coerced)', () => {
  const r = SupportTicketCreateBody.safeParse({
    subject: 'Repair #10089 · Roxann Fenn',
    note: 'CD Issues',
    anchor: { type: 'repair', repairId: '4894' },
  });
  ok(r.success);
  deepEqual(r.data.anchor, { type: 'repair', repairId: 4894 });
});

test('create body: a repair anchor with a non-positive id is rejected', () => {
  ok(!SupportTicketCreateBody.safeParse({ subject: 'x', anchor: { type: 'repair', repairId: 0 } }).success);
});
