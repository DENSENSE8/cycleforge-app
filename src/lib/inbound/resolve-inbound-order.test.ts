import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveInboundCartonByOrderId,
  type ResolveInboundOrderDeps,
} from './resolve-inbound-order';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

describe('resolveInboundCartonByOrderId', () => {
  it('returns an existing carton when the order already has receiving_id', async () => {
    const deps: ResolveInboundOrderDeps = {
      query: (async () => ({
        rows: [
          {
            receiving_id: 55,
            receiving_line_id: 9,
            source_type: 'amazon',
            source_order_id: '111-222-333',
          },
        ],
        rowCount: 1,
      })) as ResolveInboundOrderDeps['query'],
      withTx: (async () => {
        throw new Error('should not create carton');
      }) as ResolveInboundOrderDeps['withTx'],
      ensureReceivingForInboundOrder: (async () => {
        throw new Error('should not ensure');
      }) as ResolveInboundOrderDeps['ensureReceivingForInboundOrder'],
    };
    const hit = await resolveInboundCartonByOrderId(ORG, '111-222-333', deps);
    assert.deepEqual(hit, {
      receivingId: 55,
      receivingLineId: 9,
      sourceType: 'amazon',
      sourceOrderId: '111-222-333',
      createdCarton: false,
    });
  });

  it('mints a carton when the line is EXPECTED with null receiving_id', async () => {
    let ensured = false;
    const deps: ResolveInboundOrderDeps = {
      query: (async () => ({
        rows: [
          {
            receiving_id: null,
            receiving_line_id: 9,
            source_type: 'ebay',
            source_order_id: '12-34567-89012',
          },
        ],
        rowCount: 1,
      })) as ResolveInboundOrderDeps['query'],
      withTx: (async (_org, fn) =>
        fn({
          query: async () => ({ rows: [], rowCount: 0 }),
        } as never)) as ResolveInboundOrderDeps['withTx'],
      ensureReceivingForInboundOrder: (async () => {
        ensured = true;
        return 77;
      }) as ResolveInboundOrderDeps['ensureReceivingForInboundOrder'],
    };
    const hit = await resolveInboundCartonByOrderId(ORG, '12-34567-89012', deps);
    assert.equal(ensured, true);
    assert.deepEqual(hit, {
      receivingId: 77,
      receivingLineId: 9,
      sourceType: 'ebay',
      sourceOrderId: '12-34567-89012',
      createdCarton: true,
    });
  });

  it('returns null when two different orders normalize the same', async () => {
    const deps: ResolveInboundOrderDeps = {
      query: (async () => ({
        rows: [
          {
            receiving_id: 1,
            receiving_line_id: 1,
            source_type: 'amazon',
            source_order_id: 'A',
          },
          {
            receiving_id: 2,
            receiving_line_id: 2,
            source_type: 'ebay',
            source_order_id: 'B',
          },
        ],
        rowCount: 2,
      })) as ResolveInboundOrderDeps['query'],
      withTx: (async () => null) as ResolveInboundOrderDeps['withTx'],
      ensureReceivingForInboundOrder: (async () => 0) as ResolveInboundOrderDeps['ensureReceivingForInboundOrder'],
    };
    const hit = await resolveInboundCartonByOrderId(ORG, 'X', deps);
    assert.equal(hit, null);
  });
});
