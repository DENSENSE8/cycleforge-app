/**
 * Dry-run import preview. Uses the same fetch + ingestPurchase(preview)
 * path as the live eBay buyer import — it does not invent a second normalizer.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { getEbayAppCreds } from '@/lib/ebay/credentials';
import { syncEbayPurchasesToReceiving } from '@/lib/inbound/sync-ebay-purchases';
import { InjectedProviderFailure } from './adapter-injection';
import { emptyDryRunPreview, type DryRunPreview } from './dry-run';

export type QaImportOperation = 'ebay.buyer-import';

export async function previewImportOperation(
  orgId: OrgId,
  operation: QaImportOperation,
): Promise<DryRunPreview> {
  if (operation !== 'ebay.buyer-import') {
    return emptyDryRunPreview();
  }

  const app = await getEbayAppCreds(orgId);
  const environment = app?.environment === 'SANDBOX' ? 'Sandbox' : app ? 'Production' : 'unconfigured';

  let result;
  try {
    result = await syncEbayPurchasesToReceiving(orgId, undefined, { preview: true });
  } catch (err) {
    if (err instanceof InjectedProviderFailure) {
      const preview = emptyDryRunPreview();
      preview.wouldSkip = [{ kind: 'provider calls', count: 1, reason: err.message }];
      preview.wouldCall = [{ provider: 'eBay', environment, operation: 'GetOrders (buyer)' }];
      preview.notes = [`Injected failure: ${err.injection.errorClass}`];
      return preview;
    }
    throw err;
  }
  const created = result.created;
  const updated = Math.max(0, result.ingested - result.created);
  const skipped = result.errors.filter((e) => /no order id/i.test(e)).length;

  const preview = emptyDryRunPreview();
  if (created > 0) preview.wouldCreate.push({ kind: 'internal incoming lines', count: created });
  if (updated > 0) preview.wouldUpdate.push({ kind: 'existing incoming lines', count: updated });
  if (skipped > 0) preview.wouldSkip.push({ kind: 'line with no order id', count: skipped });
  preview.wouldCall.push({
    provider: 'eBay',
    environment,
    operation: 'GetOrders (buyer) — same fetch as production import',
  });
  preview.notes = [
    `Buyer accounts scanned: ${result.accounts}`,
    `Lines fetched: ${result.linesFetched}`,
    ...(result.errors.length ? [`Fetch/normalize notes: ${result.errors.slice(0, 5).join('; ')}`] : []),
    'No writes. Cursor not advanced. Execute uses the same ingestPurchase path without preview.',
  ];
  return preview;
}
