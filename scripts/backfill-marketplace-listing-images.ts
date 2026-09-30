/**
 * Backfill every reachable dogfood product image from its listing: Amazon ASIN,
 * eBay item id, Shopify variant SKU, Ecwid product id. Marketplace media is
 * registered in CycleForge's photo pipeline;
 * public legacy sources can render from their CDN while managed storage keeps
 * using the internal photo route. Catalog-paired lines receive a listing-gallery
 * cover; still-unpaired lines receive an order-scoped fallback.
 *
 * Dry-run by default:
 *   pnpm marketplace:images:backfill
 *   pnpm marketplace:images:backfill --apply
 */
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { runMarketplaceMediaBackfill } from '@/lib/photos/marketplace-media-backfill';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';

async function main() {
  const apply = process.argv.includes('--apply');
  const report = await runMarketplaceMediaBackfill(DOGFOOD_ORG_ID, {
    apply,
    since: new Date(0),
    providers: ['amazon', 'ebay', 'shopify', 'ecwid'],
    includeZohoLinked: true,
  });

  // Allocate and Search cache their shared order read model. Once marketplace
  // media is durable, evict those snapshots so newly reachable images paint on
  // the next request rather than waiting for the five-minute TTL.
  if (apply && (report.stored > 0 || report.orderImagesStored > 0)) {
    await invalidateAllOrdersApiCaches([], DOGFOOD_ORG_ID);
  }

  const sampleLimit = 12;
  console.log(
    JSON.stringify(
      {
        ...report,
        samples: report.samples.slice(0, sampleLimit),
        orderSamples: report.orderSamples.slice(0, sampleLimit),
        samplesOmitted: Math.max(0, report.samples.length - sampleLimit),
        orderSamplesOmitted: Math.max(0, report.orderSamples.length - sampleLimit),
      },
      null,
      2,
    ),
  );
  const providerBlocked = Object.values(report.providers).some((provider) => provider.gate.ok === false);
  if (
    providerBlocked ||
    report.fetchErrors.length > 0 ||
    report.storeErrors.length > 0 ||
    report.orderFetchErrors.length > 0 ||
    report.orderStoreErrors.length > 0
  ) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
