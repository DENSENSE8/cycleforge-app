/**
 * Backfill Amazon/eBay pictures for products on recent orders that have no
 * photo under the product-image precedence (Zoho → catalog → listing gallery).
 * Logic lives in src/lib/photos/marketplace-media-backfill.ts; this only
 * parses flags and prints the report.
 *
 *   node --env-file=.env --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     scripts/marketplace-media-backfill.mts --org=<uuid>            # dry run (default)
 *   … --org=<uuid> --apply                                           # write gallery covers
 *   … --days=7                                                       # window (default 7)
 *
 * The dry run is read-only against the DB. It still gates each provider (the
 * existing validate paths) and fetches image URLs from providers that pass,
 * so "would store" counts only images that actually exist.
 */
import { runMarketplaceMediaBackfill, type BackfillReport } from '../src/lib/photos/marketplace-media-backfill';

function flag(name: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const orgId = flag('org');
if (!orgId) {
  console.error('--org=<uuid> is required');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const days = Number(flag('days') ?? 7);
if (!Number.isFinite(days) || days <= 0) {
  console.error('--days must be a positive number');
  process.exit(1);
}
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

function print(report: BackfillReport): void {
  console.log(`\nMarketplace media backfill — ${report.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`org ${report.orgId}, orders since ${report.since}\n`);
  console.log(`orders scanned:                 ${report.ordersScanned}`);
  console.log(`  photo from Zoho item:         ${report.orders.zoho}`);
  console.log(`  photo from catalog:           ${report.orders.catalog}`);
  console.log(`  photo from listing gallery:   ${report.orders.listing_gallery}`);
  console.log(`  Zoho-owned, no photo (skip):  ${report.orders.zoho_owned_no_photo}`);
  console.log(`  no catalog product (skip):    ${report.orders.no_product}  (${report.noProductWithMarketplaceId} carry an ASIN/eBay id)`);
  console.log(`  missing → eligible:           ${report.orders.missing}`);
  console.log(`\nproducts missing images:        ${report.productsMissingImages}`);
  console.log(`  no Amazon/eBay listing id:    ${report.noMarketplaceId}`);
  console.log(`  fetchable (a provider is up): ${report.fetchableProducts}`);
  console.log(`  blocked (all providers down): ${report.blockedProducts}`);
  for (const [provider, entry] of Object.entries(report.providers)) {
    const gate = entry.gate.ok
      ? `ok${entry.gate.notes.length ? ` (notes: ${entry.gate.notes.join(' | ')})` : ''}`
      : `blocked: ${entry.gate.reason}\n      repair: ${entry.gate.repair}`;
    console.log(`\n  ${provider}: products ${entry.products}, fetchable ${entry.fetchable}, blocked ${entry.blocked}`);
    console.log(`    gate: ${gate}`);
  }
  console.log(`\nimages found at source:         ${report.imagesFound}`);
  console.log(`listing has no image:           ${report.noImageAtSource}`);
  console.log(`fetch errors:                   ${report.fetchErrors.length}`);
  for (const e of report.fetchErrors.slice(0, 10)) {
    console.log(`  sku_catalog ${e.skuCatalogId} ${e.ref.provider}:${e.ref.id} — ${e.error.slice(0, 200)}`);
  }
  console.log(`${(report.apply ? 'stored:' : 'would store:').padEnd(32)}${report.stored}`);
  for (const s of report.skipped) console.log(`  skipped sku_catalog ${s.skuCatalogId}: ${s.reason}`);
  for (const e of report.storeErrors) console.log(`  FAILED (rolled back) sku_catalog ${e.skuCatalogId}: ${e.error.slice(0, 200)}`);
  for (const s of report.samples.slice(0, 10)) {
    console.log(`  sku_catalog ${s.skuCatalogId} (${s.sku ?? '—'}) ← ${s.ref.provider}:${s.ref.id} ${s.imageUrl}`);
  }
}

try {
  print(await runMarketplaceMediaBackfill(orgId, { apply, since }));
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
