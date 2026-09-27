/**
 * DB-free tests for print_order_paperwork: order + papers resolution, the
 * device action the browser prints (never in the model's echo), the
 * printed-before gate, honest misses, and the Ask-only refusal.
 * Run: npx tsx --test src/lib/assistant/tools/order-paperwork-print-tool.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssistantTool } from './index';
import { dispatchToolCall } from './dispatch';
import type { PaperworkBundle, PaperworkPrintDeps } from './order-paperwork-print-tool';
import { takeDeviceAction } from '@/lib/assistant/tool-device-action';
import type { AssistantToolCtx, AssistantToolDeps, AssistantToolRunResult } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const ctx: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: new Set(['packing.complete_order']) };

const LABEL_AND_SLIP: PaperworkBundle = {
  documents: [
    { id: 1, documentType: 'shipping_label' },
    { id: 2, documentType: 'packing_slip' },
  ],
  manuals: [],
};

function message(r: AssistantToolRunResult): string {
  return r.ok ? String((r.data as { message?: unknown }).message) : r.error;
}

function harness(opts: {
  orders: Record<string, Array<Record<string, unknown>>>;
  bundles: Record<number, PaperworkBundle>;
  printedBefore?: number[];
}) {
  const calls: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const paperworkPrint: PaperworkPrintDeps = {
    resolveBundle: async (_org, rowId) => opts.bundles[rowId] ?? { documents: [], manuals: [] },
  };
  const deps = {
    query: async (orgId: string, text: string, params: ReadonlyArray<unknown> = []) => {
      calls.push({ orgId, text, params });
      if (/document_print_jobs/.test(text)) {
        const ids = params[1] as number[];
        return { rows: (opts.printedBefore ?? []).filter((id) => ids.includes(id)).map((id) => ({ order_id: id })) };
      }
      if (/o\.id = \$2/.test(text)) return { rows: [] };
      return { rows: opts.orders[String(params[1])] ?? [] };
    },
    paperworkPrint,
  } as AssistantToolDeps;
  return { deps, calls };
}

test('bulk print: every order resolves to its row and papers; the browser gets ids, the model gets words', async () => {
  const { deps, calls } = harness({
    orders: { '4899': [{ id: 501, order_id: '4899' }], '4900': [{ id: 502, order_id: '4900' }] },
    bundles: { 501: LABEL_AND_SLIP, 502: { documents: [{ id: 3, documentType: 'packing_slip' }], manuals: [{ id: 9 }] } },
  });
  const r = await runAssistantTool('print_order_paperwork', { orders: ['Order #4899', '4900'], documents: 'all' }, ctx, deps);
  assert.equal(r.ok, true);
  const action = takeDeviceAction(r.ok ? r.data : null);
  assert.deepEqual(action, {
    name: 'print_order_paperwork',
    input: {
      orders: [
        { orderRowId: 501, orderNumber: '4899', papers: 'shipping label + packing slip' },
        { orderRowId: 502, orderNumber: '4900', papers: 'packing slip + paperwork' },
      ],
      documents: ['shipping_label', 'packing_slip', 'manual'],
      reprint: false,
    },
  });
  const echo = JSON.stringify(r.ok ? r.data : null);
  assert.doesNotMatch(echo, /orderRowId|501/, 'the model never sees row ids it could retype');
  assert.match(echo, /Sending the shipping label, packing slip and paperwork for 4899 and 4900 to your print station/);
  assert.ok(calls.every((c) => c.params[0] === ORG), 'every statement is scoped to the ctx org');
});

test('papers printed before are not printed again without reprint; reprint sends them as a reprint', async () => {
  const opts = {
    orders: { '4899': [{ id: 501, order_id: '4899' }] },
    bundles: { 501: LABEL_AND_SLIP },
    printedBefore: [501],
  };
  const first = await runAssistantTool('print_order_paperwork', { orders: ['4899'], documents: 'packing_slip' }, ctx, harness(opts).deps);
  assert.equal(first.ok, true);
  assert.equal(takeDeviceAction(first.ok ? first.data : null), null, 'nothing goes to the station');
  assert.match(message(first), /4899 was printed before/);

  const again = await runAssistantTool('print_order_paperwork', { orders: ['4899'], documents: 'packing_slip', reprint: true }, ctx, harness(opts).deps);
  const action = takeDeviceAction(again.ok ? again.data : null);
  assert.equal(action?.input.reprint, true);
  assert.deepEqual(action?.input.documents, ['packing_slip']);
});

test('misses are named: an unknown order and an order without the asked-for paper are skipped, the rest prints', async () => {
  const { deps } = harness({
    orders: { '4899': [{ id: 501, order_id: '4899' }], '7000': [{ id: 700, order_id: '7000' }] },
    bundles: { 501: LABEL_AND_SLIP, 700: { documents: [{ id: 5, documentType: 'packing_slip' }], manuals: [] } },
  });
  const r = await runAssistantTool('print_order_paperwork', { orders: ['4899', 'ZZ-NOPE', '7000'], documents: 'shipping_label' }, ctx, deps);
  assert.deepEqual(
    (takeDeviceAction(r.ok ? r.data : null)?.input.orders as Array<{ orderNumber: string }>).map((o) => o.orderNumber),
    ['4899'],
  );
  assert.match(message(r), /No order ZZ-NOPE exists/);
  assert.match(message(r), /7000 has no shipping label on file/);

  const none = await runAssistantTool('print_order_paperwork', { orders: ['ZZ-NOPE'] }, ctx, deps);
  assert.equal(takeDeviceAction(none.ok ? none.data : null), null);
  assert.match(message(none), /Nothing was sent to print/);
});

test('a split order prints from the newest row that has the papers', async () => {
  const { deps } = harness({
    orders: { '4899': [{ id: 520, order_id: '4899' }, { id: 501, order_id: '4899' }] },
    bundles: { 501: LABEL_AND_SLIP },
  });
  const r = await runAssistantTool('print_order_paperwork', { orders: ['4899'] }, ctx, deps);
  assert.equal((takeDeviceAction(r.ok ? r.data : null)?.input.orders as Array<{ orderRowId: number }>)[0].orderRowId, 501);
});

test('Ask only refuses the print at the dispatch chokepoint — nothing is resolved', async () => {
  const { deps, calls } = harness({ orders: { '4899': [{ id: 501, order_id: '4899' }] }, bundles: { 501: LABEL_AND_SLIP } });
  const r = await dispatchToolCall(
    'print_order_paperwork',
    { orders: ['4899'] },
    { ...ctx, accessMode: 'ask' },
    new Map(),
    (name, input, c) => runAssistantTool(name, input, c, deps),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, 'forbidden');
  assert.equal(calls.length, 0);
});
