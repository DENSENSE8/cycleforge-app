import assert from 'node:assert/strict';
import test from 'node:test';
import {
  marketplaceRefsFor,
  runMarketplaceMediaBackfill,
  type MarketplaceMediaDeps,
  type MarketplaceRef,
  type OrderImageRow,
  type ProviderGate,
} from '@/lib/photos/marketplace-media-backfill';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { pickAmazonCatalogMainImage } from '@/lib/amazon/client';
import { pickEbayItemImage } from '@/lib/ebay/browse-client';

const ORG = '00000000-0000-0000-0000-000000000001';
const SINCE = new Date('2026-09-17T00:00:00Z');
const OK: ProviderGate = { ok: true, notes: [] };

function row(over: Partial<OrderImageRow>): OrderImageRow {
  return {
    orderId: 1,
    orderRef: null,
    accountSource: null,
    sku: null,
    itemNumber: null,
    skuCatalogId: null,
    catalogImageUrl: null,
    zohoItemId: null,
    zohoImageDocumentId: null,
    zohoImageUrl: null,
    galleryCount: 0,
    catalogRefs: [],
    ...over,
  };
}

/**
 * In-memory world: `store` really adds to the SKU's gallery, so a second run
 * reads what the first one wrote.
 */
function world(rows: OrderImageRow[], gates: Partial<Record<'amazon' | 'ebay', ProviderGate>> = {}) {
  const gallery = new Map<number, number>();
  const fetched: MarketplaceRef[] = [];
  const stored: Array<{ skuCatalogId: number; imageUrl: string }> = [];
  let nextPhotoId = 500;
  const deps: MarketplaceMediaDeps = {
    loadOrderRows: async () =>
      rows.map((r) => ({
        ...r,
        galleryCount: r.galleryCount + (r.skuCatalogId == null ? 0 : (gallery.get(r.skuCatalogId) ?? 0)),
      })),
    checkProvider: async (_org, provider) => gates[provider] ?? OK,
    fetchImageUrl: async (_org, ref) => {
      fetched.push(ref);
      return `https://cdn.example/${ref.provider}/${ref.id}.jpg`;
    },
    storeListingImage: async (_org, skuCatalogId, imageUrl) => {
      stored.push({ skuCatalogId, imageUrl });
      gallery.set(skuCatalogId, (gallery.get(skuCatalogId) ?? 0) + 1);
      return { status: 'stored', photoId: nextPhotoId++ };
    },
  };
  return { deps, fetched, stored };
}

test('productImageUrl: the listing-gallery cover is the last tier — Zoho and catalog photos always win', () => {
  const cover = { listingCoverPhotoId: 77 };
  assert.equal(
    productImageUrl({ zohoItemId: 'Z1', zohoImageDocumentId: 'D1', catalogImageUrl: 'https://cat/x.jpg', ...cover }),
    '/api/zoho/items/Z1/image',
  );
  assert.equal(productImageUrl({ catalogImageUrl: 'https://cat/x.jpg', ...cover }), 'https://cat/x.jpg');
  assert.equal(productImageUrl(cover), '/api/photos/77/content?variant=thumb');
  assert.equal(productImageUrl({ listingCoverPhotoId: 0 }), null);
});

test('backfill never fetches or stores for a product that already has a Zoho, catalog or curated-gallery photo', async () => {
  const ebayRef: MarketplaceRef = { provider: 'ebay', id: '123456789012' };
  const rows = [
    // Zoho item with a photo.
    row({ orderId: 1, skuCatalogId: 10, zohoItemId: 'Z10', zohoImageDocumentId: 'D10', catalogRefs: [ebayRef] }),
    // Zoho-owned with NO photo — Zoho governs; marketplace media must not stand in.
    row({ orderId: 2, skuCatalogId: 11, zohoItemId: 'Z11', catalogRefs: [ebayRef] }),
    // Catalog photo.
    row({ orderId: 3, skuCatalogId: 12, catalogImageUrl: 'https://cat/12.jpg', catalogRefs: [ebayRef] }),
    // Curated listing gallery.
    row({ orderId: 4, skuCatalogId: 13, galleryCount: 2, catalogRefs: [ebayRef] }),
    // Genuinely missing.
    row({ orderId: 5, skuCatalogId: 14, catalogRefs: [{ provider: 'ebay', id: '210987654321' }] }),
  ];
  const { deps, fetched, stored } = world(rows);

  const report = await runMarketplaceMediaBackfill(ORG, { since: SINCE, apply: true }, deps);

  assert.deepEqual(report.orders, {
    zoho: 1,
    catalog: 1,
    listing_gallery: 1,
    zoho_owned_no_photo: 1,
    no_product: 0,
    missing: 1,
  });
  assert.deepEqual(fetched, [{ provider: 'ebay', id: '210987654321' }]);
  assert.deepEqual(stored, [{ skuCatalogId: 14, imageUrl: 'https://cdn.example/ebay/210987654321.jpg' }]);
});

test('a second apply run is a no-op: the stored cover makes the product ineligible', async () => {
  const rows = [
    row({ orderId: 1, skuCatalogId: 20, accountSource: 'Amazon', itemNumber: 'B0D6X2MFSZ' }),
    row({ orderId: 2, skuCatalogId: 20, accountSource: 'Amazon', itemNumber: 'B0D6X2MFSZ' }),
  ];
  const { deps, fetched, stored } = world(rows);

  const first = await runMarketplaceMediaBackfill(ORG, { since: SINCE, apply: true }, deps);
  assert.equal(first.productsMissingImages, 1, 'two orders, one product');
  assert.equal(first.stored, 1);

  const second = await runMarketplaceMediaBackfill(ORG, { since: SINCE, apply: true }, deps);
  assert.equal(second.productsMissingImages, 0);
  assert.equal(second.orders.listing_gallery, 2);
  assert.equal(second.stored, 0);
  assert.equal(fetched.length, 1, 'no provider call on the re-run');
  assert.equal(stored.length, 1);
});

test('a blocked provider is reported, never called; a product with another live listing still resolves', async () => {
  const rows = [
    row({ orderId: 1, skuCatalogId: 30, accountSource: 'Amazon', itemNumber: 'B00ODYZNCE' }),
    row({
      orderId: 2,
      skuCatalogId: 31,
      accountSource: 'Amazon',
      itemNumber: 'B07ZY7DWT6',
      catalogRefs: [{ provider: 'ebay', id: '363100692206' }],
    }),
  ];
  const blocked: ProviderGate = { ok: false, reason: 'No active Amazon accounts', repair: 'connect Amazon' };
  const { deps, fetched, stored } = world(rows, { amazon: blocked });

  const report = await runMarketplaceMediaBackfill(ORG, { since: SINCE, apply: true }, deps);

  assert.ok(fetched.every((ref) => ref.provider !== 'amazon'));
  assert.deepEqual(report.providers.amazon.gate, blocked);
  assert.equal(report.providers.amazon.blocked, 2);
  assert.equal(report.blockedProducts, 1);
  assert.equal(report.fetchableProducts, 1);
  assert.deepEqual(stored.map((s) => s.skuCatalogId), [31]);
});

test('dry run fetches but never stores', async () => {
  const { deps, stored } = world([row({ skuCatalogId: 40, itemNumber: '257359056678', accountSource: 'eBay' })]);
  const report = await runMarketplaceMediaBackfill(ORG, { since: SINCE }, deps);
  assert.equal(report.apply, false);
  assert.equal(report.stored, 1, 'counted as would-store');
  assert.equal(stored.length, 0);
});

test('orders without a catalog product are counted, not stored', async () => {
  const { deps, fetched } = world([row({ accountSource: 'Amazon', itemNumber: 'B003JQLPWY' })]);
  const report = await runMarketplaceMediaBackfill(ORG, { since: SINCE, apply: true }, deps);
  assert.equal(report.orders.no_product, 1);
  assert.equal(report.noProductWithMarketplaceId, 1);
  assert.equal(fetched.length, 0);
});

test('marketplaceRefsFor: the order channel first, shape-checked ids only', () => {
  // A ShipStation row of an Amazon order carries the ASIN as its SKU.
  const refs = marketplaceRefsFor(
    row({
      accountSource: 'shipstation',
      orderRef: '114-8809493-7956233',
      sku: 'b011i7z4bi',
      itemNumber: '374968541', // 9 digits — not an eBay legacy id
      catalogRefs: [{ provider: 'ebay', id: '156046303221' }],
    }),
  );
  assert.deepEqual(refs, [
    { provider: 'amazon', id: 'B011I7Z4BI' },
    { provider: 'ebay', id: '156046303221' },
  ]);

  const ebayFirst = marketplaceRefsFor(
    row({
      orderRef: '17-15170-01793',
      itemNumber: '257359056678',
      catalogRefs: [{ provider: 'amazon', id: 'B0D6X2MFSZ' }, { provider: 'ebay', id: '257359056678' }],
    }),
  );
  assert.deepEqual(ebayFirst, [
    { provider: 'ebay', id: '257359056678' },
    { provider: 'amazon', id: 'B0D6X2MFSZ' },
  ]);
});

test('pickAmazonCatalogMainImage prefers the largest MAIN image of the account marketplace', () => {
  const url = pickAmazonCatalogMainImage(
    {
      images: [
        { marketplaceId: 'A2EUQ1WTGCTBG2', images: [{ variant: 'MAIN', link: 'https://ca/main.jpg', width: 2000, height: 2000 }] },
        {
          marketplaceId: 'ATVPDKIKX0DER',
          images: [
            { variant: 'PT01', link: 'https://us/pt01.jpg', width: 1500, height: 1500 },
            { variant: 'MAIN', link: 'https://us/main-small.jpg', width: 75, height: 75 },
            { variant: 'MAIN', link: 'https://us/main.jpg', width: 1000, height: 1000 },
          ],
        },
      ],
    },
    ['ATVPDKIKX0DER'],
  );
  assert.equal(url, 'https://us/main.jpg');
  assert.equal(pickAmazonCatalogMainImage({ images: [] }, ['ATVPDKIKX0DER']), null);
});

test('pickEbayItemImage falls back to the first variation of an item group', () => {
  assert.equal(pickEbayItemImage({ image: { imageUrl: 'https://i.ebayimg.com/hero.jpg' } }), 'https://i.ebayimg.com/hero.jpg');
  assert.equal(
    pickEbayItemImage({ items: [{ image: { imageUrl: '' } , additionalImages: [{ imageUrl: 'https://i.ebayimg.com/v1.jpg' }] }] }),
    'https://i.ebayimg.com/v1.jpg',
  );
  assert.equal(pickEbayItemImage({}), null);
});

test('a failing store is reported and does not stop the next product', async () => {
  const rows = [
    row({ orderId: 1, skuCatalogId: 50, itemNumber: '111111111111', accountSource: 'eBay' }),
    row({ orderId: 2, skuCatalogId: 51, itemNumber: '222222222222', accountSource: 'eBay' }),
  ];
  const { deps, stored } = world(rows);
  const store = deps.storeListingImage;
  deps.storeListingImage = async (org, skuCatalogId, imageUrl) => {
    if (skuCatalogId === 50) throw new Error('42P10 boom');
    return store(org, skuCatalogId, imageUrl);
  };

  const report = await runMarketplaceMediaBackfill(ORG, { since: SINCE, apply: true }, deps);

  assert.deepEqual(report.storeErrors, [{ skuCatalogId: 50, error: '42P10 boom' }]);
  assert.equal(report.stored, 1);
  assert.deepEqual(stored.map((s) => s.skuCatalogId), [51]);
});
