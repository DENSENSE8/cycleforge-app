import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getOrderLabelSummary,
  type OrderLabelRow,
  type OrderLabelSummaryDeps,
} from './order-label-summary';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

const BARE: OrderLabelRow = {
  id: '42',
  label_linked: false,
  label_bought_document: false,
  purchase_status: null,
  carrier_code: null,
  service_code: null,
  cost: null,
  currency: null,
  tracking_number: null,
  label_document_id: null,
  bought_at: null,
  purchased_by: null,
  purchased_by_name: null,
};

function deps(row: OrderLabelRow | null): OrderLabelSummaryDeps {
  return { readRow: async () => row, readLabels: async () => [] };
}

const status = async (patch: Partial<OrderLabelRow>) =>
  (await getOrderLabelSummary(ORG, 42, deps({ ...BARE, ...patch })))?.status;

test('an order outside the org reads as missing', async () => {
  assert.equal(await getOrderLabelSummary(ORG, 42, deps(null)), null);
});

test('no purchase and no document: none, with no purchase facts', async () => {
  const summary = await getOrderLabelSummary(ORG, 42, deps(BARE));
  assert.deepEqual(summary, { orderId: 42, status: 'none', purchase: null, labels: [] });
});

test('a purchased ledger row is bought, with its facts', async () => {
  const summary = await getOrderLabelSummary(
    ORG,
    42,
    deps({
      ...BARE,
      label_linked: true,
      purchase_status: 'purchased',
      carrier_code: 'stamps_com',
      service_code: 'usps_ground_advantage',
      cost: '7.35',
      currency: 'USD',
      tracking_number: '9400111',
      label_document_id: 88,
      bought_at: new Date('2026-09-24T21:00:00Z'),
      purchased_by: 1,
      purchased_by_name: 'Michael',
    }),
  );
  assert.equal(summary?.status, 'bought');
  assert.equal(summary?.purchase?.cost, 7.35);
  assert.equal(summary?.purchase?.boughtAt, '2026-09-24T21:00:00.000Z');
  assert.deepEqual(summary?.purchase?.boughtBy, { id: 1, name: 'Michael' });
  assert.equal(summary?.purchase?.labelDocumentId, 88);
});

test('a label bought before the ledger (API-sourced document) is bought, not linked', async () => {
  assert.equal(await status({ label_linked: true, label_bought_document: true }), 'bought');
});

test('an unresolved claim is pending even with a hand-linked label', async () => {
  assert.equal(await status({ purchase_status: 'pending', label_linked: true }), 'pending');
});

test('a hand-attached label is linked', async () => {
  assert.equal(await status({ label_linked: true }), 'linked');
});

test('voided, then a label attached by hand: linked wins over voided', async () => {
  assert.equal(await status({ purchase_status: 'voided', label_linked: true }), 'linked');
});

test('voided and nothing replaced it: voided', async () => {
  assert.equal(await status({ purchase_status: 'voided' }), 'voided');
});
