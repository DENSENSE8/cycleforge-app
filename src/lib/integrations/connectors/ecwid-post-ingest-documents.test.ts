import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchEcwidPackingSlipsAfterIngest } from './ecwid-post-ingest-documents';

const ORG = '00000000-0000-4000-8000-000000000001';

test('fetches one provider packing slip for each unique inserted Ecwid order', async () => {
  const calls: Array<{ orderId: number; types: string[] }> = [];
  const result = await fetchEcwidPackingSlipsAfterIngest(
    ORG,
    [12, 12, -1, 13],
    async (_orgId, orderId, types) => {
      calls.push({ orderId, types });
      return { fetched: orderId === 12 ? [{}] : [], failed: orderId === 13 ? [{}] : [] };
    },
  );

  assert.deepEqual(calls, [
    { orderId: 12, types: ['packing_slip'] },
    { orderId: 13, types: ['packing_slip'] },
  ]);
  assert.deepEqual(result, { attempted: 2, fetched: 1, failed: 1 });
});

test('isolates a rejected document fetch from the committed ingest', async () => {
  const result = await fetchEcwidPackingSlipsAfterIngest(ORG, [21], async () => {
    throw new Error('Ecwid unavailable');
  });

  assert.deepEqual(result, { attempted: 1, fetched: 0, failed: 1 });
});
