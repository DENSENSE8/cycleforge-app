/**
 * Amazon returns as return-report files: the seller-fulfilled Manage Returns
 * report and the FBA customer returns report, requested through the SP-API
 * Reports API for every connected account and handed back as the same
 * TAB-delimited files an operator would upload (`amazon_returns` /
 * `amazon_fba_returns` presets) — the import maps them, never this module.
 */
import type { AmazonCredentials } from '@/lib/integrations/credentials';
import type { ReturnReportFile, ReturnWindow } from '@/lib/returns/return-files';
import { ReturnsNotConnectedError } from '@/lib/returns/returns-sync';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadActiveAmazonAccounts, loadAmazonCreds } from './accounts';
import type { AmazonAccount } from './client';
import {
  AmazonReportFatalError,
  mergeFlatFileTables,
  parseFlatFileReport,
  reportsClientForAccount,
  splitReportWindow,
  type FlatFileTable,
  type ReportsClient,
} from './reports-client';

interface ReturnReportSpec {
  reportType: string;
  preset: ReturnReportFile['preset'];
  fileStem: string;
  /** Longest window one report may cover. */
  maxDays: number;
  /** A FATAL whose error document matches this means "not enrolled": no returns of this type, not a failure. */
  notEnrolled?: RegExp;
}

const RETURN_REPORTS: readonly ReturnReportSpec[] = [
  // "You can request up to 60 days of data in a single report." (report-type-values-returns)
  { reportType: 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE', preset: 'amazon_returns', fileStem: 'amazon-returns', maxDays: 60 },
  // Amazon documents no range limit for this one; the same 60-day slices keep each report small.
  // "Availability: FBA sellers" — a seller without FBA gets a FATAL saying so. Amazon publishes no
  // error-document wording, so this matches a not-enrolled/registered/authorized/eligible phrase
  // naming FBA (either order); any other FATAL still surfaces.
  {
    reportType: 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
    preset: 'amazon_fba_returns',
    fileStem: 'amazon-fba-returns',
    maxDays: 60,
    notEnrolled:
      /\b(?:not|n't)\s+(?:been\s+)?(?:enrolled|registered|authori[sz]ed|eligible|subscribed)\b[^.]*\b(?:FBA|fulfil?lment by amazon|amazon fulfil?lment)\b|\b(?:FBA|fulfil?lment by amazon|amazon fulfil?lment)\b[^.]*\b(?:not|n't)\s+(?:been\s+)?(?:enrolled|registered|authori[sz]ed|eligible|subscribed)\b/i,
  },
];

/** Injectable collaborators — real impls by default; fakes in tests. */
export interface AmazonReturnFilesDeps {
  loadAccounts: (orgId: string) => Promise<AmazonAccount[]>;
  loadCreds: (orgId: string, account: AmazonAccount) => Promise<AmazonCredentials | null>;
  clientFor: (account: AmazonAccount, creds: AmazonCredentials) => ReportsClient;
  now: () => number;
}

const defaultDeps: AmazonReturnFilesDeps = {
  loadAccounts: loadActiveAmazonAccounts,
  loadCreds: loadAmazonCreds,
  clientFor: (account, creds) => reportsClientForAccount(account, creds),
  now: Date.now,
};

/**
 * One `ReturnReportFile` per Amazon returns report type that has rows in
 * [since, until), merged across the org's connected accounts. Each report type
 * × account is fetched on its own: a failure there drops only its rows (and is
 * logged); the call throws only when every requested report failed. Throws
 * `ReturnsNotConnectedError('amazon')` when no account has vault credentials.
 */
export async function fetchAmazonReturnFiles(
  orgId: OrgId,
  window: ReturnWindow,
  deps: AmazonReturnFilesDeps = defaultDeps,
): Promise<ReturnReportFile[]> {
  const connected: Array<{ account: AmazonAccount; client: ReportsClient; marketplaceIds: string[] }> = [];
  for (const account of await deps.loadAccounts(orgId)) {
    const creds = await deps.loadCreds(orgId, account);
    if (!creds) continue;
    // The order sync's marketplaces (discovered at connect); the vault copy when the row has none.
    const marketplaceIds = account.marketplaceIds.length ? account.marketplaceIds : creds.marketplaceIds;
    connected.push({ account, client: deps.clientFor(account, creds), marketplaceIds });
  }
  if (connected.length === 0) throw new ReturnsNotConnectedError('amazon');

  // Amazon reports cannot cover the future.
  const until = new Date(Math.min(window.until.getTime(), deps.now()));
  const files: ReturnReportFile[] = [];
  const failures: string[] = [];
  for (const spec of RETURN_REPORTS) {
    const tables: FlatFileTable[] = [];
    for (const { account, client, marketplaceIds } of connected) {
      try {
        if (!marketplaceIds.length) {
          throw new Error(`Amazon account ${account.accountName} has no marketplace ids — reconnect the account.`);
        }
        const accountTables: FlatFileTable[] = [];
        for (const slice of splitReportWindow(window.since, until, spec.maxDays)) {
          const text = await client.runReport({
            reportType: spec.reportType,
            marketplaceIds,
            dataStartTime: slice.since,
            dataEndTime: slice.until,
          });
          if (text !== null) accountTables.push(parseFlatFileReport(text));
        }
        tables.push(...accountTables);
      } catch (err) {
        const notEnrolled =
          err instanceof AmazonReportFatalError && err.detail !== null && spec.notEnrolled?.test(err.detail) === true;
        if (notEnrolled) continue;
        failures.push(`${spec.reportType} (${account.accountName}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const { headers, rows } = mergeFlatFileTables(tables);
    if (rows.length === 0) continue;
    files.push({
      fileName: `${spec.fileStem} ${window.since.toISOString().slice(0, 10)}..${until.toISOString().slice(0, 10)}`,
      preset: spec.preset,
      headers,
      rows,
    });
  }
  if (failures.length === RETURN_REPORTS.length * connected.length) {
    throw new Error(`Amazon returns reports failed — ${failures.join('; ')}`);
  }
  for (const failure of failures) console.warn('[amazon/returns-reports] report skipped:', failure);
  return files;
}
