/**
 * request_payment — refused in Ask only (never reaches Square), and on success
 * the rail artifact carries the order number only: no amount, no link.
 * Run: npx tsx --test src/lib/assistant/tools/request-payment-tool.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
import { buildWriteToolMap, dispatchToolCall } from './dispatch';
import { buildWriteTools } from './write-tools';
import { buildRequestPaymentTool, type RequestPaymentDeps } from './request-payment-tool';
import type { AssistantToolCtx } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const PERMS = new Set(['assistant.chat', 'orders.create']);
const FULL: AssistantToolCtx = { organizationId: ORG, staffId: 3, permissions: PERMS, accessMode: 'full' };
const ASK: AssistantToolCtx = { ...FULL, accessMode: 'ask' };

function fakeDeps() {
  const calls: unknown[][] = [];
  const deps: RequestPaymentDeps = {
    request: async (...args) => {
      calls.push(args);
      return {
        ok: true,
        existing: false,
        payment: {
          id: 5, orderNumber: 'PH-000123', method: 'square_link', status: 'pending', amountCents: 100, currency: 'USD',
          lines: [], url: 'https://square.link/u/abc', squareInvoiceUrl: null, lastError: null, paidAt: null, cancelledAt: null,
          createdAt: '', updatedAt: '',
        },
      };
    },
  };
  return { deps, calls };
}

test('Ask only refuses request_payment at dispatch and inside the tool — Square is never called', async () => {
  const { deps, calls } = fakeDeps();
  const tools = buildWriteTools('s', undefined, PERMS, { startedAt: new Date(), requestPaymentDeps: deps });
  assert.equal(buildWriteToolMap(ASK, tools).has('request_payment'), false);
  const out = await dispatchToolCall('request_payment', { orderNumber: 'PH-000123' }, ASK, new Map(tools.map((t) => [t.name, t])), async () => ({ ok: true, data: null }));
  assert.equal(out.ok === false && out.code, 'forbidden');
  const direct = (await buildRequestPaymentTool(deps).run({ orderNumber: 'PH-000123', method: 'payment_link' }, ASK, {} as never)) as { ok: boolean };
  assert.equal(direct.ok, false);
  assert.equal(calls.length, 0);
});

test('a staffer without orders.create is never offered the tool', () => {
  const tools = buildWriteTools('s', undefined, undefined, { startedAt: new Date() });
  assert.equal(buildWriteToolMap({ ...FULL, permissions: new Set(['assistant.chat']) }, tools).has('request_payment'), false);
});

test('full access: the org comes from ctx, the method maps, and the rail artifact carries no money or link', async () => {
  const { deps, calls } = fakeDeps();
  const tool = buildRequestPaymentTool(deps);
  const out = await dispatchToolCall(
    'request_payment',
    { orderNumber: 'Order #PH-000123', method: 'payment_link', organizationId: 'someone-else' },
    FULL,
    new Map([[tool.name, tool]]),
    async () => ({ ok: true, data: null }),
  );
  assert.equal(out.ok, true);
  assert.deepEqual(calls[0], [ORG, { orderNumber: 'PH-000123', method: 'square_link', staffId: 3 }]);
  const split = splitToolArtifact(out.ok ? out.data : null);
  assert.ok(split);
  assert.equal(split.tool, 'request_payment');
  assert.deepEqual(split.artifact, { kind: 'payment', title: 'Take payment · Order PH-000123', orderNumber: 'PH-000123', method: 'square_link' });
  assert.doesNotMatch(split.modelData.summary, /\$|square\.link/);
});

test('a refused order (no price, unknown) reaches the model as a tool error', async () => {
  const tool = buildRequestPaymentTool({ request: async () => ({ ok: false, error: 'No order "PH-9" exists in this workspace.' }) });
  const out = await dispatchToolCall('request_payment', { orderNumber: 'PH-9' }, FULL, new Map([[tool.name, tool]]), async () => ({ ok: true, data: null }));
  assert.equal(out.ok, false);
  assert.match(out.ok === false ? out.error : '', /No order "PH-9"/);
});
