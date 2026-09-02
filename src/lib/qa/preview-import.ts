/**
 * Dry-run import preview. Uses the same fetch + ingestPurchase(preview)
 * path as the live eBay buyer import — it does not invent a second normalizer.
 *
 * Execute (buyer only) is the same function without preview, refused unless
 * the org's eBay app is SANDBOX. Seller exception-first sync is preview-only:
 * it writes orders and deletes exceptions, so the console will not execute it.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getEbayAppCreds, EBAY_PLATFORM_PREDICATE, EBAY_SELLER_ROLE_PREDICATE } from '@/lib/ebay/credentials';
import { isEbaySandbox } from '@/lib/ebay/oauth-config';
import { ingestRecentSellerOrders } from '@/lib/ebay/sync';
import { syncEbayPurchasesToReceiving } from '@/lib/inbound/sync-ebay-purchases';
import { applyAdapterInjection, InjectedProviderFailure } from './adapter-injection';
import { emptyDryRunPreview, type DryRunPreview } from './dry-run';

export type QaImportOperation = 'ebay.buyer-import' | 'ebay.seller-sync';

export class QaExecuteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QaExecuteRefused';
  }
}

function ebayEnvironmentLabel(environment: string | undefined): string {
  if (environment === 'SANDBOX') return 'Sandbox';
  if (environment) return 'Production';
  return 'unconfigured';
}

function injectedPreview(environment: string, operation: string, err: InjectedProviderFailure): DryRunPreview {
  const preview = emptyDryRunPreview();
  preview.wouldSkip = [{ kind: 'provider calls', count: 1, reason: err.message }];
  preview.wouldCall = [{ provider: 'eBay', environment, operation }];
  preview.notes = [`Injected failure: ${err.injection.errorClass}`];
  return preview;
}

export async function previewImportOperation(
  orgId: OrgId,
  operation: QaImportOperation,
): Promise<DryRunPreview> {
  const app = await getEbayAppCreds(orgId);
  const environment = ebayEnvironmentLabel(app?.environment);

  if (operation === 'ebay.seller-sync') {
    return previewSellerSync(orgId, environment);
  }

  let result;
  try {
    result = await syncEbayPurchasesToReceiving(orgId, undefined, { preview: true });
  } catch (err) {
    if (err instanceof InjectedProviderFailure) {
      return injectedPreview(environment, 'GetOrders (buyer)', err);
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

async function previewSellerSync(orgId: OrgId, environment: string): Promise<DryRunPreview> {
  try {
    await applyAdapterInjection(orgId, 'ebay');
  } catch (err) {
    if (err instanceof InjectedProviderFailure) {
      return injectedPreview(environment, 'Fulfillment getOrders (seller)', err);
    }
    throw err;
  }

  const accounts = await tenantQuery<{ account_name: string }>(
    orgId,
    `SELECT account_name
       FROM ebay_accounts
      WHERE organization_id = $1
        AND ${EBAY_PLATFORM_PREDICATE}
        AND ${EBAY_SELLER_ROLE_PREDICATE}
        AND is_active = true
      ORDER BY account_name`,
    [orgId],
  );

  const preview = emptyDryRunPreview();
  preview.wouldCall.push({
    provider: 'eBay',
    environment,
    operation: 'Fulfillment getOrders (seller) — same fetch as recent-order ingest',
  });

  if (accounts.rows.length === 0) {
    preview.notes = ['No active seller accounts on this organization.'];
    return preview;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of accounts.rows) {
    try {
      const result = await ingestRecentSellerOrders(row.account_name, orgId, {
        preview: true,
        limit: 20,
      });
      created += result.created;
      updated += result.updated;
      skipped += result.skipped;
      errors.push(...result.errors);
    } catch (err) {
      errors.push(`${row.account_name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (created > 0) preview.wouldCreate.push({ kind: 'internal orders', count: created });
  if (updated > 0) preview.wouldUpdate.push({ kind: 'existing orders', count: updated });
  if (skipped > 0) preview.wouldSkip.push({ kind: 'seller order without id', count: skipped });
  preview.notes = [
    `Seller accounts scanned: ${accounts.rows.length}`,
    'Preview is the recent-order ingest path (first page). When open exceptions exist, production uses exception-first matching — that path is not executed here.',
    'No writes. Exception rows are not deleted. last_sync_date is not advanced.',
    'Execute is not available for seller sync from this console.',
    ...(errors.length ? [`Fetch/normalize notes: ${errors.slice(0, 5).join('; ')}`] : []),
  ];
  return preview;
}

export function refuseExecuteReason(
  operation: QaImportOperation,
  ebayEnvironment: string | null | undefined,
): string | null {
  if (operation === 'ebay.seller-sync') {
    return 'Seller exception-first sync is not an execute action on this console. It writes orders and deletes matched exceptions. Preview only.';
  }
  if (!ebayEnvironment || !isEbaySandbox(ebayEnvironment)) {
    return 'Execute is refused unless this organization\'s eBay app is SANDBOX. Production credentials are not a console execute target.';
  }
  return null;
}

export async function executeImportOperation(
  orgId: OrgId,
  operation: QaImportOperation,
): Promise<{ ingested: number; created: number; accounts: number; errors: string[] }> {
  const app = await getEbayAppCreds(orgId);
  const refused = refuseExecuteReason(operation, app?.environment ?? null);
  if (refused) throw new QaExecuteRefused(refused);

  const result = await syncEbayPurchasesToReceiving(orgId);
  return {
    ingested: result.ingested,
    created: result.created,
    accounts: result.accounts,
    errors: result.errors,
  };
}
