/**
 * Real deps for {@link runReturnsSync}: the platform fetchers, the inbound
 * import (`runPoCsvImport`), `sync_cursors` and the import recorder. Kept off
 * the pure module so unit tests never import the pool or a platform client.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { fetchEbayReturnFiles } from '@/lib/ebay/returns';
import { fetchAmazonReturnFiles } from '@/lib/amazon/returns-reports';
import { runPoCsvImport } from '@/lib/inbound/po-csv-import';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import { startImportRun } from '@/lib/sync/import-record';
import { importRecordDeps } from '@/lib/sync/import-record-load';
import { runReturnsSync, type ReturnsSyncDeps, type ReturnsSyncOpts } from './returns-sync';

export const returnsSyncDeps: ReturnsSyncDeps = {
  fetchFiles: (orgId, provider, window) =>
    provider === 'ebay' ? fetchEbayReturnFiles(orgId, window) : fetchAmazonReturnFiles(orgId, window),
  importFile: async (orgId, input) => {
    const result = await runPoCsvImport(orgId, input);
    const batchId = result.batch?.batchId ?? null;
    // Same as the upload route: a committed batch refreshes the receiving views.
    if (batchId != null) {
      await invalidateReceivingViews(orgId).catch((e) => console.warn('[returns-sync] invalidate failed', e));
    }
    return { batchId, summary: result.summary, missingRequired: result.identification.missingRequired };
  },
  getCursor: (orgId, resource) => getSyncCursor(resource, orgId),
  updateCursor: (orgId, resource, at) => updateSyncCursor(resource, at, orgId),
  startImportRun: (orgId, meta) => startImportRun(orgId, meta, importRecordDeps),
  now: () => new Date(),
};

export function loadReturnsSync(orgId: OrgId, opts: ReturnsSyncOpts) {
  return runReturnsSync(orgId, opts, returnsSyncDeps);
}
