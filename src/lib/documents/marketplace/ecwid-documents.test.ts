/** DB-free unit tests for Ecwid outbound packing-slip adapter. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ecwidDocumentAdapter,
  fetchEcwidPackingSlip,
  type EcwidPackingSlipDeps,
} from './ecwid-documents';
import { EcwidApiError } from '@/lib/ecwid/client';
import type { OutboundOrderContext } from './order-context';

const sampleOrder: OutboundOrderContext = {
  id: 1,
  orderRef: '4787',
  accountSource: 'ecwid',
  sku: 'SKU-1',
  productTitle: 'Widget',
  quantity: '1',
  shipmentId: null,
  tracking: null,
  carrier: null,
};

const connectedDeps: EcwidPackingSlipDeps = {
  resolveCreds: async () => ({ storeId: '16593703', apiToken: 'token' }),
  fetchPdf: async () => Buffer.from('%PDF-1.4'),
};

test('ecwidDocumentAdapter.canFetch gates on account_source', () => {
  assert.equal(ecwidDocumentAdapter.canFetch(sampleOrder), true);
  assert.equal(
    ecwidDocumentAdapter.canFetch({ ...sampleOrder, accountSource: 'Ecwid Store' }),
    true,
  );
  assert.equal(
    ecwidDocumentAdapter.canFetch({ ...sampleOrder, accountSource: 'ebay' }),
    false,
  );
  assert.equal(
    ecwidDocumentAdapter.canFetch({ ...sampleOrder, accountSource: null }),
    false,
  );
});

test('ecwidDocumentAdapter rejects shipping_label', async () => {
  const outcome = await ecwidDocumentAdapter.fetchDocument(
    sampleOrder,
    'shipping_label',
    'org_test',
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.match(outcome.error, /manually|carrier/i);
  }
});

test('fetchEcwidPackingSlip happy path via injected invoice-pdf', async () => {
  const pdf = Buffer.from('%PDF-1.4 mock-invoice');
  const deps: EcwidPackingSlipDeps = {
    resolveCreds: connectedDeps.resolveCreds,
    fetchPdf: async (_storeId, _token, orderRef) => {
      assert.equal(orderRef, '4787');
      return pdf;
    },
  };
  const outcome = await fetchEcwidPackingSlip(sampleOrder, 'org_test', deps);
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.platform, 'ecwid');
    assert.equal(outcome.source, 'marketplace_api');
    assert.equal(outcome.contentType, 'application/pdf');
    assert.equal(outcome.buffer.equals(pdf), true);
    assert.equal(outcome.sourceHash.length, 64);
  }
});

test('fetchEcwidPackingSlip fails when Ecwid not connected', async () => {
  const outcome = await fetchEcwidPackingSlip(sampleOrder, 'org_test', {
    resolveCreds: async () => null,
    fetchPdf: async () => {
      throw new Error('should not be called');
    },
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.match(outcome.error, /not connected/i);
  }
});

test('fetchEcwidPackingSlip maps EcwidApiError to failure', async () => {
  const outcome = await fetchEcwidPackingSlip(sampleOrder, 'org_test', {
    resolveCreds: async () => ({ storeId: '1', apiToken: 't' }),
    fetchPdf: async () => {
      throw new EcwidApiError('Ecwid invoice-pdf failed (404)', 404);
    },
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.match(outcome.error, /404/);
  }
});
