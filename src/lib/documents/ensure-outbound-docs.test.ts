import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureOutboundDocsForOrder,
  type EnsureOutboundDocsDeps,
} from './ensure-outbound-docs';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OutboundDocument } from './types';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;

function doc(
  id: number,
  documentType: 'shipping_label' | 'packing_slip',
): OutboundDocument {
  return {
    id,
    documentType,
    data: {
      url: `https://nas.example/doc-${id}.pdf`,
      source: 'marketplace_api',
      platform: 'ebay',
      mimeType: 'application/pdf',
    },
    links: [{ entityType: 'ORDER', entityId: 42, linkRole: 'primary' }],
    createdAt: '2026-07-31T00:00:00Z',
    updatedAt: '2026-07-31T00:00:00Z',
  };
}

test('ensureOutboundDocsForOrder: skips when both types already present', async () => {
  const fetchCalls: unknown[] = [];
  const deps: EnsureOutboundDocsDeps = {
    listDocumentsForOrder: async () => [doc(1, 'shipping_label'), doc(2, 'packing_slip')],
    fetchOutboundDocuments: async (_org, orderId, types) => {
      fetchCalls.push({ orderId, types });
      return { fetched: [], failed: [] };
    },
  };
  const out = await ensureOutboundDocsForOrder(ORG, 42, { source: 'test' }, deps);
  assert.equal(out.status, 'skipped_complete');
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(out.missingBefore, []);
});

test('ensureOutboundDocsForOrder: fetches only missing types', async () => {
  let listPass = 0;
  const deps: EnsureOutboundDocsDeps = {
    listDocumentsForOrder: async () => {
      listPass += 1;
      if (listPass === 1) return [doc(1, 'shipping_label')];
      return [doc(1, 'shipping_label'), doc(2, 'packing_slip')];
    },
    fetchOutboundDocuments: async (_org, _orderId, types) => {
      assert.deepEqual(types, ['packing_slip']);
      return { fetched: [doc(2, 'packing_slip')], failed: [] };
    },
  };
  const out = await ensureOutboundDocsForOrder(ORG, 42, { source: 'test' }, deps);
  assert.equal(out.status, 'complete');
  assert.deepEqual(out.missingBefore, ['packing_slip']);
  assert.deepEqual(out.missingAfter, []);
  assert.equal(out.fetched.length, 1);
});

test('ensureOutboundDocsForOrder: partial when fetch cannot fill all gaps', async () => {
  const deps: EnsureOutboundDocsDeps = {
    listDocumentsForOrder: async () => [],
    fetchOutboundDocuments: async () => ({
      fetched: [doc(2, 'packing_slip')],
      failed: [{ type: 'shipping_label', error: 'no marketplace label' }],
    }),
  };
  // second list still empty for label
  let n = 0;
  deps.listDocumentsForOrder = async () => {
    n += 1;
    return n === 1 ? [] : [doc(2, 'packing_slip')];
  };
  const out = await ensureOutboundDocsForOrder(ORG, 42, { source: 'test' }, deps);
  assert.equal(out.status, 'partial');
  assert.deepEqual(out.missingAfter, ['shipping_label']);
});

test('ensureOutboundDocsForOrder: missing when nothing fetched', async () => {
  const deps: EnsureOutboundDocsDeps = {
    listDocumentsForOrder: async () => [],
    fetchOutboundDocuments: async () => ({
      fetched: [],
      failed: [
        { type: 'shipping_label', error: 'disabled' },
        { type: 'packing_slip', error: 'disabled' },
      ],
    }),
  };
  const out = await ensureOutboundDocsForOrder(ORG, 42, { source: 'test' }, deps);
  assert.equal(out.status, 'missing');
  assert.deepEqual(out.missingAfter, ['shipping_label', 'packing_slip']);
});
