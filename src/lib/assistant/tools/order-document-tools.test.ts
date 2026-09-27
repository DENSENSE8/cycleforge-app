/**
 * DB-free tests for get_order_documents: order resolution, the rail artifact
 * (requested paper first, every file behind its auth-gated content route) and
 * the honest misses. Run: npx tsx --test src/lib/assistant/tools/order-document-tools.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssistantTool } from './index';
import type { OrderDocumentDeps } from './order-document-tools';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
import { sessionArtifactSchema } from '@/lib/assistant/ui-artifacts';
import type { OutboundDocument } from '@/lib/documents/types';
import type { OrderManual } from '@/lib/manuals/order-manuals';
import type { AssistantToolCtx, AssistantToolDeps } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const ctx: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: new Set(['orders.view']) };

function doc(id: number, documentType: OutboundDocument['documentType'], extra: Partial<OutboundDocument['data']> = {}): OutboundDocument {
  return {
    id,
    documentType,
    data: { url: `/x/${id}.pdf`, platform: 'ecwid', source: 'generated', mimeType: 'application/pdf', ...extra },
    links: [],
    createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z',
  };
}

function manual(id: number, displayName: string, contentUrl: string | null, fileName = 'm.pdf'): OrderManual {
  return {
    id,
    displayName,
    type: 'manual',
    fileName,
    contentUrl,
    externalUrl: null,
    source: null,
    pairedBy: [],
    pairing: { orderId: null, itemNumber: null, sku: null } as unknown as OrderManual['pairing'],
    updatedAt: '2026-09-27T00:00:00Z',
  };
}

function harness(opts: {
  byNumber?: Array<Record<string, unknown>>;
  byRowId?: Array<Record<string, unknown>>;
  docs?: Record<number, OutboundDocument[]>;
  manuals?: Record<number, OrderManual[]>;
}) {
  const calls: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const orderDocuments: OrderDocumentDeps = {
    listDocuments: async (_org, rowId) => opts.docs?.[rowId] ?? [],
    listManuals: async (_org, rowId) => opts.manuals?.[rowId] ?? [],
  };
  const deps = {
    query: async (orgId: string, text: string, params: ReadonlyArray<unknown> = []) => {
      calls.push({ orgId, text, params });
      return { rows: /o\.id = \$2/.test(text) ? (opts.byRowId ?? []) : (opts.byNumber ?? []) };
    },
    orderDocuments,
  } as AssistantToolDeps;
  return { deps, calls };
}

test('label asked for: rail artifact opens the label first, slip switchable, tracking in the summary', async () => {
  const { deps, calls } = harness({
    byNumber: [{ id: 15538, order_id: '5083', product_title: 'Bose UB-20 wall mount' }],
    docs: { 15538: [doc(1133, 'packing_slip'), doc(1065, 'shipping_label', { carrier: 'USPS', tracking: '9400150206217932830794' })] },
    manuals: { 15538: [manual(9, 'UB-20 install guide', '/api/product-manuals/9/content?v=1'), manual(10, 'Drive-only manual', null)] },
  });
  const r = await runAssistantTool('get_order_documents', { order: 'Order #5083', type: 'shipping_label' }, ctx, deps);
  assert.equal(r.ok, true);
  const split = splitToolArtifact(r.ok ? r.data : null);
  assert.ok(split, 'branded envelope');
  assert.equal(split.tool, 'get_order_documents');
  const a = split.artifact;
  assert.equal(a.kind, 'document');
  if (a.kind !== 'document') return;
  assert.equal(a.title, 'Order 5083 · Shipping label + 2 more');
  assert.deepEqual(
    a.documents.map((d) => [d.label, d.url]),
    [
      ['Shipping label', '/api/documents/1065/content'],
      ['Packing slip', '/api/documents/1133/content'],
      ['UB-20 install guide', '/api/product-manuals/9/content?v=1'],
    ],
  );
  assert.match(split.modelData.summary, /Order 5083/);
  assert.match(split.modelData.summary, /9400150206217932830794/);
  // "#5083" / "Order" were stripped before the org-scoped lookup.
  assert.deepEqual(calls[0].params, [ORG, '5083']);
  assert.ok(calls.every((c) => c.orgId === ORG && /organization_id = \$1/.test(c.text)));
});

test('requested paper missing: says so and opens what the order does have', async () => {
  const { deps } = harness({
    byNumber: [{ id: 1, order_id: 'A-1', product_title: null }],
    docs: { 1: [doc(5, 'packing_slip')] },
  });
  const r = await runAssistantTool('get_order_documents', { order: 'A-1', type: 'shipping_label' }, ctx, deps);
  const split = splitToolArtifact(r.ok ? r.data : null);
  assert.ok(split);
  assert.match(split.modelData.summary, /has no shipping label on file/);
  assert.equal(split.artifact.kind === 'document' && split.artifact.documents[0].docType, 'packing_slip');
});

test('multi-line order: documents from every order row, each file once', async () => {
  const { deps } = harness({
    byNumber: [
      { id: 2, order_id: '111-1', product_title: 'A' },
      { id: 3, order_id: '111-1', product_title: 'B' },
    ],
    docs: { 2: [doc(7, 'shipping_label')], 3: [doc(7, 'shipping_label'), doc(8, 'shipping_label')] },
  });
  const r = await runAssistantTool('get_order_documents', { order: '111-1' }, ctx, deps);
  const split = splitToolArtifact(r.ok ? r.data : null);
  assert.ok(split && split.artifact.kind === 'document');
  if (split.artifact.kind !== 'document') return;
  assert.deepEqual(split.artifact.documents.map((d) => d.label), ['Shipping label', 'Shipping label 2']);
});

test('unknown order number falls back to the row id, then says what was searched', async () => {
  const byId = harness({ byRowId: [{ id: 42, order_id: 'EB-9', product_title: null }], docs: { 42: [doc(1, 'shipping_label')] } });
  const hit = await runAssistantTool('get_order_documents', { order: '42' }, ctx, byId.deps);
  assert.equal(splitToolArtifact(hit.ok ? hit.data : null)?.artifact.title, 'Order EB-9 · Shipping label');

  const none = harness({});
  const miss = await runAssistantTool('get_order_documents', { order: 'ZZ-NOPE' }, ctx, none.deps);
  assert.equal(miss.ok, true);
  assert.equal(splitToolArtifact(miss.ok ? miss.data : null), null, 'nothing for the rail');
  assert.deepEqual(miss.ok && miss.data, {
    found: false,
    order: 'ZZ-NOPE',
    searched: ['order number', 'order record id'],
    message: 'No order "ZZ-NOPE" exists in this workspace, so there are no documents to show.',
  });
  // A non-numeric miss never probes the row id.
  assert.equal(none.calls.length, 1);
});

test('order with nothing on file: honest no-documents result, no artifact', async () => {
  const { deps } = harness({
    byNumber: [{ id: 5, order_id: '1136', product_title: 'Bose 101' }],
    manuals: { 5: [manual(1, 'Drive-only', null)] },
  });
  const r = await runAssistantTool('get_order_documents', { order: '1136' }, ctx, deps);
  assert.equal(splitToolArtifact(r.ok ? r.data : null), null);
  assert.equal(r.ok && (r.data as { documents: number }).documents, 0);
});

test('document contract only frames the org\'s own content routes', () => {
  const base = { kind: 'document', title: 'Order 1 · Shipping label', documents: [{ id: 'doc:1', label: 'Shipping label', docType: 'shipping_label', mime: 'application/pdf', url: '' }] };
  const withUrl = (url: string) => ({ ...base, documents: [{ ...base.documents[0], url }] });
  assert.equal(sessionArtifactSchema.safeParse(withUrl('/api/documents/1/content')).success, true);
  assert.equal(sessionArtifactSchema.safeParse(withUrl('/api/product-manuals/9/content?v=17')).success, true);
  for (const bad of ['https://evil.test/a.pdf', '//evil.test/api/documents/1/content', '/api/documents/1/content/../../admin', 'javascript:alert(1)', '/api/orders/1']) {
    assert.equal(sessionArtifactSchema.safeParse(withUrl(bad)).success, false, bad);
  }
  assert.equal(sessionArtifactSchema.safeParse({ ...base, documents: [] }).success, false, 'empty rail rejected');
});
