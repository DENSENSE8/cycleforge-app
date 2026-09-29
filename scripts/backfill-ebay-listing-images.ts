/**
 * Backfill every missing dogfood product image reachable from an eBay listing
 * ID. Dry-run by default; pass --apply to persist listing-gallery covers.
 *
 *   pnpm ebay:images:backfill
 *   pnpm ebay:images:backfill --apply
 */
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { runMarketplaceMediaBackfill } from '@/lib/photos/marketplace-media-backfill';

async function main() {
  const apply = process.argv.includes('--apply');
  const report = await runMarketplaceMediaBackfill(DOGFOOD_ORG_ID, {
    apply,
    // Full history. The org+item-number probe already has
    // idx_orders_org_item_number, so this needs no new migration.
    since: new Date(0),
    providers: ['ebay'],
    includeZohoLinked: true,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.providers.ebay.gate.ok === false || report.fetchErrors.length > 0 || report.storeErrors.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
