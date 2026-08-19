import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveInboundCartonByTracking,
  type ResolveInboundTrackingDeps,
} from './resolve-inbound-tracking';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function fakes(rows: unknown[]) {
  const captured: Array<{ sql: string; params: unknown[] }> = [];
  const deps: ResolveInboundTrackingDeps = {
    query: (async (_org, sql, params) => {
      captured.push({ sql, params: params ?? [] });
      return { rows, rowCount: rows.length };
    }) as ResolveInboundTrackingDeps['query'],
  };
  return { deps, captured };
}

describe('resolveInboundCartonByTracking', () => {
  it('returns the carton when the mirror tracking canonical-matches', async () => {
    const { deps, captured } = fakes([
      {
        receiving_id: 88,
        receiving_line_id: 12,
        source_type: 'amazon',
        source_order_id: '111-222-333',
      },
    ]);
    const hit = await resolveInboundCartonByTracking(ORG, '1Z999AA10123456784', deps);
    assert.deepEqual(hit, {
      receivingId: 88,
      receivingLineId: 12,
      sourceType: 'amazon',
      sourceOrderId: '111-222-333',
    });
    assert.equal(captured[0]?.params[1], '1Z999AA10123456784');
  });

  it('returns null when the line has no carton yet', async () => {
    const { deps } = fakes([
      {
        receiving_id: null,
        receiving_line_id: 12,
        source_type: 'amazon',
        source_order_id: '111-222-333',
      },
    ]);
    const hit = await resolveInboundCartonByTracking(ORG, '1Z999AA10123456784', deps);
    assert.equal(hit, null);
  });

  it('returns null when two cartons share the same tracking', async () => {
    const { deps } = fakes([
      { receiving_id: 1, receiving_line_id: 1, source_type: 'amazon', source_order_id: 'A' },
      { receiving_id: 2, receiving_line_id: 2, source_type: 'amazon', source_order_id: 'B' },
    ]);
    const hit = await resolveInboundCartonByTracking(ORG, '1Z999AA10123456784', deps);
    assert.equal(hit, null);
  });
});
