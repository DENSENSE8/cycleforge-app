import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  notInboundMirrorTerminalPredicate,
  notLineInboundMirrorTerminalPredicate,
  upsertInboundMirror,
} from './mirror';

test('notInboundMirrorTerminalPredicate pins ebay source_type', () => {
  const sql = notInboundMirrorTerminalPredicate('ebay');
  assert.match(sql, /source_type = 'ebay'/);
  assert.match(sql, /inbound_purchase_order_mirror/);
  assert.match(sql, /cancelled/);
});

test('notLineInboundMirrorTerminalPredicate keys off rl.inbound_source_type', () => {
  const sql = notLineInboundMirrorTerminalPredicate();
  assert.match(sql, /ipm\.source_type = rl\.inbound_source_type/);
  assert.match(sql, /inbound_purchase_order_mirror/);
});

test('upsertInboundMirror never stores a tracking number a numeric parse rounded', async () => {
  const params: unknown[][] = [];
  const deps = {
    query: async (_org: OrgId, _sql: string, values: unknown[]) => {
      params.push(values);
      return { rows: [{}] };
    },
  } as unknown as Parameters<typeof upsertInboundMirror>[2];
  const org = '00000000-0000-0000-0000-00000000aaaa' as OrgId;
  await upsertInboundMirror(org, { sourceType: 'ebay', sourceOrderId: '19-15115-65421', trackingNumber: '9.434608106244531e+21' }, deps);
  await upsertInboundMirror(org, { sourceType: 'ebay', sourceOrderId: '19-15115-65421', trackingNumber: '9434608106244530786660' }, deps);
  assert.equal(params[0][10], null);
  assert.equal(params[1][10], '9434608106244530786660');
});
