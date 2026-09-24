/**
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/kiosk/price-approval.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PriceApprovalError,
  signPriceApproval,
  verifyLinePrices,
  verifyPriceApproval,
  type VerifyLinePricesDeps,
} from './price-approval';
import type { CounterRetailLine } from '@/lib/counter/counter-transaction-types';

const SECRET = 'x'.repeat(40);
const ORG = '00000000-0000-0000-0000-000000000001';
const NOW = 1_800_000_000;

function approval(over: Partial<Parameters<typeof signPriceApproval>[0]> = {}): string {
  return signPriceApproval(
    { organizationId: ORG, staffId: 7, kind: 'adjust', fromCents: 559, toCents: 400, reason: 'Price match', ...over },
    { secret: SECRET, now: NOW },
  ).token;
}

const deps = (catalog: Record<string, number> = { '812345': 559 }): VerifyLinePricesDeps => ({
  verify: (t) => verifyPriceApproval(t, ORG, { secret: SECRET, now: NOW + 60 }),
  catalogPrices: async (ids) => new Map(ids.filter((id) => id in catalog).map((id) => [id, catalog[id]])),
});

function line(over: Partial<CounterRetailLine> = {}): CounterRetailLine {
  return { variationId: '812345', sku: '00162', productTitle: 'Cable', quantity: 1, unitAmountCents: 559, ...over };
}

describe('verifyPriceApproval', () => {
  it('refuses a tampered, expired or other-org approval', () => {
    const token = approval();
    const [payload, sig] = token.split('.');
    const forged = `${Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), toCents: 1 }),
    ).toString('base64url')}.${sig}`;
    assert.equal(verifyPriceApproval(forged, ORG, { secret: SECRET, now: NOW }), null);
    assert.equal(verifyPriceApproval(token, ORG, { secret: SECRET, now: NOW + 5 * 60 * 60 }), null);
    assert.equal(verifyPriceApproval(token, 'another-org', { secret: SECRET, now: NOW }), null);
    assert.equal(verifyPriceApproval(token, ORG, { secret: SECRET, now: NOW })?.toCents, 400);
  });
});

describe('verifyLinePrices', () => {
  it('keeps an adjusted line, rebuilding the original and reason from the claims, not the tablet', async () => {
    const out = await verifyLinePrices(
      {
        retailLines: [
          line({
            unitAmountCents: 400,
            priceAdjustment: {
              kind: 'adjust',
              originalUnitAmountCents: 99_999,
              reason: 'tablet says so',
              staffId: 1,
              approval: approval(),
            },
          }),
        ],
        services: [],
      },
      deps(),
    );
    assert.deepEqual(out.retailLines[0].priceAdjustment, {
      kind: 'adjust',
      originalUnitAmountCents: 559,
      reason: 'Price match',
      staffId: 7,
    });
  });

  it('refuses a catalog line whose price changed with no approval', async () => {
    await assert.rejects(
      verifyLinePrices({ retailLines: [line({ unitAmountCents: 1 })], services: [] }, deps()),
      PriceApprovalError,
    );
  });

  it('refuses an approval reused for a different price', async () => {
    const adjusted = line({
      unitAmountCents: 300,
      priceAdjustment: { kind: 'adjust', originalUnitAmountCents: 559, reason: 'x', staffId: 7, approval: approval() },
    });
    await assert.rejects(verifyLinePrices({ retailLines: [adjusted], services: [] }, deps()), PriceApprovalError);
  });

  it('lets a keypad amount and a trade-in credit through without an approval, at their own price', async () => {
    const out = await verifyLinePrices(
      {
        retailLines: [
          line({ variationId: null, unitAmountCents: 1250 }),
          line({ variationId: null, sku: 'BUYBACK', unitAmountCents: -5000 }),
        ],
        services: [],
      },
      deps(),
    );
    assert.deepEqual(
      out.retailLines.map((l) => [l.unitAmountCents, l.priceAdjustment]),
      [
        [1250, null],
        [-5000, null],
      ],
    );
  });
});
