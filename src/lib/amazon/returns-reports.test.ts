import test from 'node:test';
import assert from 'node:assert/strict';
import { ReturnsNotConnectedError } from '@/lib/returns/returns-sync';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AmazonCredentials } from '@/lib/integrations/credentials';
import type { AmazonAccount } from './client';
import { AmazonReportFatalError, type CreateReportSpec, type ReportsClient } from './reports-client';
import { fetchAmazonReturnFiles, type AmazonReturnFilesDeps } from './returns-reports';

const ORG = 'org-1' as OrgId;
const ACCOUNT = { id: 1, accountName: 'Main', sellerId: 'S1', region: 'NA', marketplaceIds: ['ATVPDKIKX0DER'] } as unknown as AmazonAccount;
const CREDS = { refreshToken: 'r', marketplaceIds: [] } as unknown as AmazonCredentials;

const MFN = 'Order ID\tAmazon RMA ID\tASIN\tReturn Reason\n111-1\tRMA1\tB01\tDefective\n';

function fakeClient(runs: CreateReportSpec[], docFor: (spec: CreateReportSpec) => string | null): ReportsClient {
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    createReport: unused,
    getReport: unused,
    getReportDocument: unused,
    waitForReport: unused,
    runReport: async (spec) => {
      runs.push(spec);
      return docFor(spec);
    },
  };
}

function deps(overrides: Partial<AmazonReturnFilesDeps>): AmazonReturnFilesDeps {
  return {
    loadAccounts: async () => [ACCOUNT],
    loadCreds: async () => CREDS,
    clientFor: () => fakeClient([], () => null),
    now: () => Date.parse('2026-10-09T00:00:00Z'),
    ...overrides,
  };
}

test('no account with vault credentials → ReturnsNotConnectedError(amazon)', async () => {
  const window = { since: new Date('2026-09-01T00:00:00Z'), until: new Date('2026-10-01T00:00:00Z') };
  await assert.rejects(fetchAmazonReturnFiles(ORG, window, deps({ loadAccounts: async () => [] })), (err: unknown) => {
    assert.ok(err instanceof ReturnsNotConnectedError);
    assert.equal(err.provider, 'amazon');
    return true;
  });
  await assert.rejects(fetchAmazonReturnFiles(ORG, window, deps({ loadCreds: async () => null })), ReturnsNotConnectedError);
});

test('splits a long window into 60-day reports per type, merges slices, one file per type with rows', async () => {
  const runs: CreateReportSpec[] = [];
  const window = { since: new Date('2026-06-01T00:00:00Z'), until: new Date('2026-12-01T00:00:00Z') };
  const files = await fetchAmazonReturnFiles(
    ORG,
    window,
    deps({
      // The MFN report answers every slice with the same row (overlap); FBA has no data (CANCELLED).
      clientFor: () => fakeClient(runs, (spec) => (spec.reportType === 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE' ? MFN : null)),
    }),
  );
  // 2026-06-01 → now (2026-10-09, the future is clamped) = 130 days → 3 slices per report type.
  assert.equal(runs.length, 6);
  for (const run of runs) {
    assert.deepEqual(run.marketplaceIds, ['ATVPDKIKX0DER']);
    assert.ok(run.dataEndTime.getTime() - run.dataStartTime.getTime() <= 60 * 86_400_000);
  }
  assert.equal(runs.at(-1)!.dataEndTime.toISOString(), '2026-10-09T00:00:00.000Z');
  assert.equal(files.length, 1);
  assert.equal(files[0]!.preset, 'amazon_returns');
  assert.equal(files[0]!.fileName, 'amazon-returns 2026-06-01..2026-10-09');
  assert.deepEqual(files[0]!.headers, ['Order ID', 'Amazon RMA ID', 'ASIN', 'Return Reason']);
  assert.deepEqual(files[0]!.rows, [{ 'Order ID': '111-1', 'Amazon RMA ID': 'RMA1', ASIN: 'B01', 'Return Reason': 'Defective' }]);
});

const MFN_TYPE = 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE';
const FBA_TYPE = 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA';
const WINDOW = { since: new Date('2026-09-01T00:00:00Z'), until: new Date('2026-10-01T00:00:00Z') };
const fbaFatal = (detail: string | null) => new AmazonReportFatalError(FBA_TYPE, 'R-FBA', detail);

test('an FBA FATAL does not discard the MFN file; the call still resolves', async () => {
  const files = await fetchAmazonReturnFiles(
    ORG,
    WINDOW,
    deps({
      clientFor: () =>
        fakeClient([], (spec) => {
          if (spec.reportType === FBA_TYPE) throw fbaFatal('Internal error, please retry');
          return MFN;
        }),
    }),
  );
  assert.deepEqual(files.map((f) => f.preset), ['amazon_returns']);
});

test('FBA "not enrolled" FATAL reads as no FBA returns; other FBA FATALs still count as failures', async () => {
  for (const detail of [
    'The seller is not enrolled in Fulfillment by Amazon.',
    'Seller has not registered for FBA',
    'FBA: merchant is not authorized for this report',
  ]) {
    // MFN has no data (CANCELLED) and FBA is "not enrolled": nothing failed, so no throw.
    const files = await fetchAmazonReturnFiles(
      ORG,
      WINDOW,
      deps({
        clientFor: () =>
          fakeClient([], (spec) => {
            if (spec.reportType === FBA_TYPE) throw fbaFatal(detail);
            return null;
          }),
      }),
    );
    assert.deepEqual(files, [], detail);
  }

  // A FATAL without the not-enrolled wording (or with no error document) is a real failure.
  for (const detail of ['Internal error, please retry', null]) {
    await assert.rejects(
      fetchAmazonReturnFiles(
        ORG,
        WINDOW,
        deps({
          clientFor: () =>
            fakeClient([], (spec) => {
              if (spec.reportType === FBA_TYPE) throw fbaFatal(detail);
              throw new Error('SP-API createReport failed: HTTP 500');
            }),
        }),
      ),
      /Amazon returns reports failed/,
    );
  }
});

test('every requested report failing → one error naming each report and account', async () => {
  await assert.rejects(
    fetchAmazonReturnFiles(
      ORG,
      WINDOW,
      deps({
        clientFor: () =>
          fakeClient([], (spec) => {
            throw new Error(`boom ${spec.reportType}`);
          }),
      }),
    ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, new RegExp(`${MFN_TYPE} \\(Main\\): boom ${MFN_TYPE}`));
      assert.match(err.message, new RegExp(`${FBA_TYPE} \\(Main\\): boom ${FBA_TYPE}`));
      return true;
    },
  );
});

test('per-account isolation: a failing account keeps the other account rows', async () => {
  const second = { ...ACCOUNT, id: 2, accountName: 'Second', marketplaceIds: [] } as AmazonAccount;
  const files = await fetchAmazonReturnFiles(
    ORG,
    WINDOW,
    deps({
      loadAccounts: async () => [ACCOUNT, second],
      // `Second` has no marketplace ids anywhere → its reports fail; `Main` still answers.
      clientFor: () => fakeClient([], (spec) => (spec.reportType === MFN_TYPE ? MFN : null)),
    }),
  );
  assert.equal(files.length, 1);
  assert.equal(files[0]!.rows.length, 1);
});
