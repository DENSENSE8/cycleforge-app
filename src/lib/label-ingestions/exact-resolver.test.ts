import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExactLabelOrder } from './exact-resolver';
const org = '00000000-0000-4000-8000-000000000001' as never;
const evidence = { parserVersion: 'v1', cycleforgeReference: null, marketplaceOrderId: 'ORDER-42', accountSource: 'ebay', trackingNumberRaw: '1Z999AA10123456784', trackingNumberNormalized: '1Z999AA10123456784', carrier: 'UPS', multiPackageEvidence: false } as const;
test('resolver uses one exact tenant/account/order query', async () => {
  let sql = ''; const result = await resolveExactLabelOrder({ query: async (text: string) => { sql = text; return { rows: [{ id: 9 }, { id: 10 }] }; } } as never, org, evidence); assert.deepEqual(result.orderIds, [9, 10]); assert.match(sql, /organization_id = \$1 AND account_source = \$2 AND order_id = \$3/); assert.equal(/like|~|address/i.test(sql), false);
});
test('tracking-only evidence quarantines before querying orders', async () => { const result = await resolveExactLabelOrder({ query: async () => { throw new Error('must not query'); } } as never, org, { ...evidence, marketplaceOrderId: null }); assert.equal(result.quarantineReason, 'TRACKING_ONLY'); });
test('multi-package evidence quarantines before querying orders', async () => { const result = await resolveExactLabelOrder({ query: async () => { throw new Error('must not query'); } } as never, org, { ...evidence, multiPackageEvidence: true }); assert.equal(result.quarantineReason, 'MULTI_PACKAGE_EVIDENCE'); });
