import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickLabelUrl,
  purchaseLabelOnce,
  type ClaimInput,
  type LabelPurchaseLedgerDeps,
  type LabelPurchaseRecord,
  type RecordPurchasedInput,
} from './label-purchase-ledger';
import type { LabelPurchaseResult } from './shipstation/types';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

const input: ClaimInput = {
  orgId: ORG,
  orderId: 14256,
  clientEventId: 'evt-1',
  rateId: 'se-rate-1',
  labelFormat: 'pdf',
  staffId: 7,
  purpose: 'return',
};

const label: LabelPurchaseResult = {
  labelId: 'se-label-1',
  status: 'completed',
  trackingNumber: '9400100000000000000001',
  carrierCode: 'stamps_com',
  serviceCode: 'usps_ground_advantage',
  cost: 5.12,
  currency: 'USD',
  labelDownload: { pdf: null, png: null, zpl: null, href: 'https://api.shipstation.com/v2/downloads/1/label.pdf' },
};

function record(overrides: Partial<LabelPurchaseRecord> = {}): LabelPurchaseRecord {
  return {
    id: 1,
    orderId: 14256,
    clientEventId: 'evt-1',
    status: 'purchased',
    labelId: label.labelId,
    trackingNumber: label.trackingNumber,
    carrierCode: label.carrierCode,
    serviceCode: label.serviceCode ?? null,
    cost: label.cost,
    currency: label.currency,
    labelFormat: 'pdf',
    labelUrl: label.labelDownload.href,
    labelDocumentId: null,
    shipmentId: null,
    purpose: 'return',
    isTest: false,
    ...overrides,
  };
}

interface Captured {
  claims: ClaimInput[];
  recorded: RecordPurchasedInput[];
  released: number[];
  buys: number;
}

function fakes(opts: { claimed?: boolean; existing?: LabelPurchaseRecord | null } = {}) {
  const cap: Captured = { claims: [], recorded: [], released: [], buys: 0 };
  const deps: LabelPurchaseLedgerDeps = {
    claim: async (i) => {
      cap.claims.push(i);
      return opts.claimed === false ? null : { id: 1 };
    },
    find: async () => opts.existing ?? null,
    recordPurchased: async (i) => {
      cap.recorded.push(i);
      return record({ labelUrl: i.labelUrl });
    },
    release: async (_org, id) => {
      cap.released.push(id);
    },
  };
  const buy = async () => {
    cap.buys += 1;
    return label;
  };
  return { deps, cap, buy };
}

test('purchaseLabelOnce: fresh key claims, buys once, records before returning', async () => {
  const { deps, cap, buy } = fakes();
  const out = await purchaseLabelOnce(input, buy, deps);

  assert.equal(out.kind, 'purchased');
  assert.equal(cap.buys, 1);
  assert.equal(cap.claims[0].orgId, ORG);
  assert.equal(cap.claims[0].clientEventId, 'evt-1');
  assert.equal(cap.recorded.length, 1);
  assert.equal(cap.recorded[0].label.trackingNumber, label.trackingNumber);
  // The href fallback is kept so a retry can backfill the bytes.
  assert.equal(cap.recorded[0].labelUrl, label.labelDownload.href);
  assert.deepEqual(cap.released, []);
});

test('purchaseLabelOnce: a key already purchased replays without charging again', async () => {
  const { deps, cap, buy } = fakes({ claimed: false, existing: record() });
  const out = await purchaseLabelOnce(input, buy, deps);

  assert.equal(out.kind, 'replay');
  assert.equal(cap.buys, 0);
  assert.equal(cap.recorded.length, 0);
});

test('purchaseLabelOnce: a voided key replays (never re-buys under a voided key)', async () => {
  const { deps, cap, buy } = fakes({ claimed: false, existing: record({ status: 'voided' }) });
  const out = await purchaseLabelOnce(input, buy, deps);

  assert.equal(out.kind, 'replay');
  assert.equal(cap.buys, 0);
});

test('purchaseLabelOnce: a pending claim (mid-charge or crashed) is refused, not re-bought', async () => {
  const { deps, cap, buy } = fakes({ claimed: false, existing: record({ status: 'pending', labelId: null }) });
  const out = await purchaseLabelOnce(input, buy, deps);

  assert.equal(out.kind, 'in_flight');
  assert.equal(cap.buys, 0);
});

test('purchaseLabelOnce: ShipStation refusing releases the claim and rethrows', async () => {
  const { deps, cap } = fakes();
  const refused = new Error('rate expired');
  await assert.rejects(
    purchaseLabelOnce(input, async () => {
      throw refused;
    }, deps),
    refused,
  );
  assert.deepEqual(cap.released, [1]);
  assert.equal(cap.recorded.length, 0);
});

test('purchaseLabelOnce: a failed record write keeps the claim pending (no release)', async () => {
  const { deps, cap, buy } = fakes();
  deps.recordPurchased = async () => {
    throw new Error('db down');
  };
  await assert.rejects(purchaseLabelOnce(input, buy, deps), /db down/);
  assert.equal(cap.buys, 1);
  assert.deepEqual(cap.released, []);
});

test('pickLabelUrl: pdf first, then href, png, zpl', () => {
  assert.equal(pickLabelUrl({ labelDownload: { pdf: 'p', href: 'h', png: null, zpl: null } }), 'p');
  assert.equal(pickLabelUrl({ labelDownload: { pdf: null, href: 'h', png: 'g', zpl: null } }), 'h');
  assert.equal(pickLabelUrl({ labelDownload: { pdf: null, href: null, png: null, zpl: null } }), null);
});
