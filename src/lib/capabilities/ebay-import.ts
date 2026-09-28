/**
 * eBay → catalog product import (SIMPLE-FIRST `ebay_import`).
 *
 * Reuses the org's connected eBay seller accounts (`listActiveEbayAccounts`)
 * and the existing `EbayClient` — no second eBay client. Each active listing
 * becomes a catalog product linked to its eBay item (`sku_platform_ids`,
 * platform 'ebay'):
 *  - a listing whose SKU is already in the catalog is only LINKED — its
 *    title/photo stay the org's own (the SKU identity law);
 *  - a listing without a SKU gets `EBAY-<itemId>` so re-running the import
 *    finds the same product instead of making a copy.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { listActiveEbayAccounts } from '@/lib/ebay/credentials';
import { EbayClient } from '@/lib/ebay/client';
import { getSkuCatalogBySku, upsertSkuCatalog, upsertSkuPlatformId } from '@/lib/neon/sku-catalog-queries';

/** Pages per account per run (200 listings each) — a ceiling, not a target. */
const MAX_PAGES = 25;

export interface EbayListing {
  itemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
}

export interface EbayImportDeps {
  accounts: (orgId: OrgId) => Promise<Array<{ accountName: string; accountRole?: string | null }>>;
  fetchPage: (orgId: OrgId, accountName: string, page: number) => Promise<{ listings: EbayListing[]; totalPages: number }>;
  findSku: (orgId: OrgId, sku: string) => Promise<{ id: number } | null>;
  createProduct: (orgId: OrgId, p: { sku: string; title: string; imageUrl: string | null }) => Promise<{ id: number }>;
  link: (orgId: OrgId, l: { skuCatalogId: number; sku: string | null; itemId: string; accountName: string }) => Promise<void>;
}

const realDeps: EbayImportDeps = {
  accounts: (orgId) => listActiveEbayAccounts(orgId),
  fetchPage: (orgId, accountName, page) => new EbayClient(accountName, orgId).fetchActiveListingsPage(page),
  findSku: (orgId, sku) => getSkuCatalogBySku(sku, orgId),
  createProduct: (orgId, p) => upsertSkuCatalog({ sku: p.sku, productTitle: p.title.slice(0, 500), imageUrl: p.imageUrl }, orgId),
  link: async (orgId, l) => {
    await upsertSkuPlatformId(
      { skuCatalogId: l.skuCatalogId, platform: 'ebay', platformSku: l.sku, platformItemId: l.itemId, accountName: l.accountName },
      orgId,
    );
  },
};

export interface EbayImportResult {
  accounts: string[];
  listings: number;
  created: number;
  linked: number;
  /** Per-account failures, reported by name — one dead token never hides the rest. */
  errors: string[];
}

export async function importEbayListingsToCatalog(orgId: OrgId, deps: EbayImportDeps = realDeps): Promise<EbayImportResult> {
  const accounts = (await deps.accounts(orgId)).filter((a) => (a.accountRole ?? 'seller') === 'seller');
  const result: EbayImportResult = { accounts: accounts.map((a) => a.accountName), listings: 0, created: 0, linked: 0, errors: [] };
  for (const account of accounts) {
    try {
      let totalPages = 1;
      for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
        const batch = await deps.fetchPage(orgId, account.accountName, page);
        totalPages = batch.totalPages;
        for (const listing of batch.listings) {
          result.listings++;
          const sku = listing.sku ?? `EBAY-${listing.itemId}`;
          let product = await deps.findSku(orgId, sku);
          if (!product) {
            product = await deps.createProduct(orgId, { sku, title: listing.title, imageUrl: listing.imageUrl });
            result.created++;
          }
          await deps.link(orgId, { skuCatalogId: product.id, sku: listing.sku, itemId: listing.itemId, accountName: account.accountName });
          result.linked++;
        }
      }
    } catch (err) {
      result.errors.push(`${account.accountName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
