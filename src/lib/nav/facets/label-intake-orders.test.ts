import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrderPacketParsedQuery, OrderPacketQueue } from '@/lib/label-prints/order-packet-contracts';
import { labelIntakeOrdersFacets } from './label-intake-orders';

const COUNTS: Omit<OrderPacketQueue, 'rows'> = {
  total: 7,
  counts: { all: 12, missing: 7, ready: 3, printed: 2 },
  gapCounts: { label: 4, slip: 2, paperwork: 5 },
  channelCounts: { Ecwid: 3, eBay: 9 },
};

test('Orders facets read the list statement with the list params, and paint its counts', async () => {
  let asked: OrderPacketParsedQuery | null = null;
  const body = await labelIntakeOrdersFacets(
    new URLSearchParams('context=label-intake.orders&view=orders&status=missing&gap=label,slip&channel=eBay&q=1006&page=2'),
    async (query) => {
      asked = query;
      return COUNTS;
    },
  );
  assert.ok(asked);
  const query: OrderPacketParsedQuery = asked;
  assert.equal(query.status, 'missing');
  assert.deepEqual(query.gap, ['label', 'slip']);
  assert.deepEqual(query.channel, ['eBay']);
  assert.equal(query.q, '1006');
  assert.equal(body.context, 'label-intake.orders');
  assert.equal(body.total, 7);
  assert.deepEqual(
    body.groups.map((group) => [group.param, group.options.map((option) => `${option.value}:${option.count}`)]),
    [
      ['status', ['missing:7', 'ready:3', 'printed:2']],
      ['gap', ['label:4', 'slip:2', 'paperwork:5']],
      // Busiest channel first; values keep the stored case.
      ['channel', ['eBay:9', 'Ecwid:3']],
    ],
  );
});

test('a malformed Orders param offers nothing rather than counting the wrong population', async () => {
  const body = await labelIntakeOrdersFacets(new URLSearchParams('status=bogus'), async () => {
    throw new Error('must not read');
  });
  assert.equal(body.total, 0);
  assert.ok(body.groups.every((group) => group.options.length === 0));
});
