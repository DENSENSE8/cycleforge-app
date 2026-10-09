import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { ReturnsNotConnectedError } from '@/lib/returns/returns-sync';
import { fetchEbayReturnFiles, type EbayReturnFilesDeps, type EbayReturnsClient } from './returns';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const WINDOW = { since: new Date('2026-09-01T00:00:00Z'), until: new Date('2026-10-01T00:00:00Z') };

function okClient(returnId: string, orderId: string): EbayReturnsClient {
  return {
    searchReturnsPage: async () => ({
      members: [
        {
          returnId,
          orderId,
          creationInfo: {
            item: { itemId: '296512345678', returnQuantity: 1 },
            reason: 'DEFECTIVE_ITEM',
            creationDate: { value: '2026-09-14T18:22:05.000Z' },
          },
        },
      ],
      paginationOutput: { totalEntries: 1 },
    }),
    getReturnDetail: async () => ({ detail: { itemDetail: { itemTitle: 'Brake lever' } } }),
    getOrderDetails: async () => ({ orderId, lineItems: [{ legacyItemId: '296512345678', sku: 'BL-1' }] }),
  };
}

const deadClient: EbayReturnsClient = {
  searchReturnsPage: async () => {
    throw new Error('Failed to refresh access token for eBay DRAGONH: eBay token refresh failed: HTTP 400 (invalid_grant)');
  },
  getReturnDetail: async () => assert.fail('no detail call after a failed search'),
  getOrderDetails: async () => assert.fail('no order call after a failed search'),
};

function deps(accounts: Record<string, EbayReturnsClient>): EbayReturnFilesDeps {
  return {
    loadSellerAccounts: async () => Object.keys(accounts),
    clientFor: (_orgId, accountName) => accounts[accountName]!,
    now: () => new Date('2026-10-09T12:00:00Z'),
  };
}

async function captureWarnings<T>(run: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
  try {
    return { result: await run(), warnings };
  } finally {
    console.warn = original;
  }
}

describe('fetchEbayReturnFiles — per seller account isolation', () => {
  it('skips a failing account with a warning naming it; the others still render', async () => {
    const { result, warnings } = await captureWarnings(() =>
      fetchEbayReturnFiles(ORG, WINDOW, deps({ 'eBay DRAGONH': deadClient, 'eBay USAV': okClient('5001', '12-34567-89012') })),
    );
    assert.equal(result.length, 1);
    assert.deepEqual(result[0]!.rows.map((r) => [r['order number'], r['return reason'], r['custom label']]), [
      ['12-34567-89012', 'DEFECTIVE_ITEM', 'BL-1'],
    ]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /eBay DRAGONH/);
    assert.match(warnings[0]!, /reconnect this eBay account/);
  });

  it('throws one aggregate error naming every account only when all failed', async () => {
    await assert.rejects(
      captureWarnings(() => fetchEbayReturnFiles(ORG, WINDOW, deps({ 'eBay DRAGONH': deadClient, 'eBay USAV': deadClient }))),
      (err: Error) => {
        assert.match(err.message, /every seller account/);
        assert.match(err.message, /eBay DRAGONH: .*invalid_grant.*reconnect/);
        assert.match(err.message, /eBay USAV: /);
        return true;
      },
    );
  });

  it('no seller account → ReturnsNotConnectedError("ebay")', async () => {
    await assert.rejects(fetchEbayReturnFiles(ORG, WINDOW, deps({})), (err: unknown) => {
      assert.ok(err instanceof ReturnsNotConnectedError);
      assert.equal(err.provider, 'ebay');
      return true;
    });
  });

  it('a de-duplicated return seen by two accounts lands once', async () => {
    const result = await fetchEbayReturnFiles(
      ORG,
      WINDOW,
      deps({ A: okClient('5001', '12-34567-89012'), B: okClient('5001', '12-34567-89012') }),
    );
    assert.equal(result[0]!.rows.length, 1);
  });
});
