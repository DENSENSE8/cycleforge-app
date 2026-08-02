import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCartonListingLinks,
  formatListingLinkMenuOptions,
  listingUrlIdentityKey,
  buildOpenLinksHubHref,
} from './listing-links';
import { getExternalUrlByPlatform } from '@/utils/external-item-url';


test('getExternalUrlByPlatform: zoho is inventory — never invents usavshop URL', () => {
  assert.equal(getExternalUrlByPlatform('zoho', '1018'), null);
  assert.equal(
    getExternalUrlByPlatform('ecwid', '01018'),
    'https://usavshop.com/products/search?keyword=01018',
  );
});


test('manual listing URL wins as primary', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://www.ebay.com/itm/123456789012',
    sku: 'WIDGET-01',
    sourcePlatform: 'ebay',
    isUnmatched: false,
    platforms: [
      {
        platform: 'amazon',
        platformItemId: 'B012345678',
        listingUrl: 'https://www.amazon.com/dp/B012345678',
      },
    ],
  });
  assert.equal(links[0]?.href, 'https://www.ebay.com/itm/123456789012');
  assert.equal(links[0]?.source, 'manual');
  assert.equal(links.length, 3);
});

test('catalog platform for carton source_platform sorts before other catalog rows', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: 'WIDGET-01',
    sourcePlatform: 'amazon',
    isUnmatched: false,
    platforms: [
      { platform: 'ebay', platformItemId: '123456789012', listingUrl: 'https://www.ebay.com/itm/123456789012' },
      { platform: 'amazon', platformItemId: 'B012345678', listingUrl: 'https://www.amazon.com/dp/B012345678' },
    ],
  });
  assert.equal(links[0]?.href, 'https://www.amazon.com/dp/B012345678');
  assert.equal(links[0]?.source, 'catalog');
});

test('unmatched cartons skip SKU-derived storefront link', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: 'WIDGET-01',
    sourcePlatform: '',
    isUnmatched: true,
    platforms: [],
  });
  assert.equal(links.length, 0);
});

test('Zoho PO suppress: empty platforms yields no derived usavshop link', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: '1018',
    sourcePlatform: '',
    isUnmatched: false,
    suppressEcwidStorefront: true,
    platforms: [],
  });
  assert.equal(links.length, 0);
});

test('Zoho PO suppress: skips catalog ecwid rows', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: '1018',
    sourcePlatform: '',
    isUnmatched: false,
    suppressEcwidStorefront: true,
    platforms: [
      { platform: 'ecwid', platformSku: '01018' },
      { platform: 'zoho', platformSku: '1018' },
    ],
  });
  assert.equal(links.length, 0);
});

test('Zoho PO suppress: keeps manual listing URL', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://www.ebay.com/itm/123456789012',
    sku: '1018',
    sourcePlatform: 'ebay',
    isUnmatched: false,
    suppressEcwidStorefront: true,
    platforms: [{ platform: 'ecwid', platformSku: '01018' }],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0]?.source, 'manual');
  assert.equal(links[0]?.href, 'https://www.ebay.com/itm/123456789012');
});

test('Zoho PO suppress: keeps non-Ecwid catalog marketplace rows', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: '1018',
    sourcePlatform: 'amazon',
    isUnmatched: false,
    suppressEcwidStorefront: true,
    platforms: [
      { platform: 'ecwid', platformSku: '01018' },
      {
        platform: 'amazon',
        platformItemId: 'B012345678',
        listingUrl: 'https://www.amazon.com/dp/B012345678',
      },
    ],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0]?.source, 'catalog');
  assert.equal(links[0]?.href, 'https://www.amazon.com/dp/B012345678');
});

test('non-Zoho matched carton still gets derived storefront from SKU', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: 'WIDGET-01',
    sourcePlatform: '',
    isUnmatched: false,
    suppressEcwidStorefront: false,
    platforms: [],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0]?.source, 'derived');
  assert.equal(
    links[0]?.href,
    'https://usavshop.com/products/search?keyword=WIDGET-01',
  );
});

test('dedupes identical hrefs from catalog and derived paths', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    sku: '123456789012',
    sourcePlatform: 'ebay',
    isUnmatched: false,
    platforms: [
      { platform: 'ebay', platformItemId: '123456789012', listingUrl: 'https://www.ebay.com/itm/123456789012' },
    ],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0]?.href, 'https://www.ebay.com/itm/123456789012');
});

test('sync notes links suppress catalog and derived fallbacks', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    syncNotes: [
      'Bose Acoustimass AM-500: https://shopgoodwill.com/item/267952401',
      'Bose CineMate 15: https://shopgoodwill.com/item/267830257',
      'Bose Model 141: https://shopgoodwill.com/item/267831532',
      '(2) Bose Companion 2: https://shopgoodwill.com/item/268362819',
    ].join('\n'),
    sku: 'WIDGET-01',
    sourcePlatform: 'goodwill',
    isUnmatched: false,
    platforms: [
      { platform: 'ecwid', platformItemId: '999', listingUrl: 'https://example.com/ecwid/999' },
    ],
  });
  assert.equal(links.length, 4);
  assert.equal(links.every((l) => l.source === 'sync_notes'), true);
  assert.deepEqual(
    links.map((l) => l.href),
    [
      'https://shopgoodwill.com/item/267952401',
      'https://shopgoodwill.com/item/267830257',
      'https://shopgoodwill.com/item/267831532',
      'https://shopgoodwill.com/item/268362819',
    ],
  );
});

test('manual listing URL stays first when sync notes are present', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://shopgoodwill.com/item/999999999',
    syncNotes: 'Bose: https://shopgoodwill.com/item/267952401',
    sku: 'WIDGET-01',
    sourcePlatform: 'goodwill',
    isUnmatched: false,
    platforms: [
      { platform: 'ecwid', platformItemId: '999', listingUrl: 'https://example.com/ecwid/999' },
    ],
  });
  assert.equal(links[0]?.source, 'manual');
  assert.equal(links[0]?.href, 'https://shopgoodwill.com/item/999999999');
  assert.equal(links[1]?.source, 'sync_notes');
  assert.equal(links[1]?.href, 'https://shopgoodwill.com/item/267952401');
  assert.equal(links.length, 2);
});

test('when sync notes are empty, catalog and derived fallbacks still apply', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    syncNotes: '',
    sku: 'WIDGET-01',
    sourcePlatform: 'amazon',
    isUnmatched: false,
    platforms: [
      { platform: 'amazon', platformItemId: 'B012345678', listingUrl: 'https://www.amazon.com/dp/B012345678' },
    ],
  });
  assert.equal(links[0]?.source, 'catalog');
  assert.equal(links.length, 2);
});

test('formatListingLinkMenuOptions returns undefined for a single link', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://www.ebay.com/itm/123456789012',
    sku: 'WIDGET-01',
    sourcePlatform: 'ebay',
    isUnmatched: true,
    platforms: [],
  });
  assert.equal(links.length, 1);
  assert.equal(formatListingLinkMenuOptions(links), undefined);
});

test('formatListingLinkMenuOptions numbers links 1-indexed with href tooltips', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://www.ebay.com/itm/123456789012',
    sku: 'WIDGET-01',
    sourcePlatform: 'ebay',
    isUnmatched: false,
    platforms: [
      {
        platform: 'amazon',
        platformItemId: 'B012345678',
        listingUrl: 'https://www.amazon.com/dp/B012345678',
      },
    ],
  });
  const menu = formatListingLinkMenuOptions(links);
  assert.equal(menu?.length, 3);
  assert.deepEqual(menu?.map((o) => o.label), ['Listing 1/3', 'Listing 2/3', 'Listing 3/3']);
  assert.equal(menu?.[0]?.title, menu?.[0]?.href);
  assert.equal(menu?.[1]?.title, menu?.[1]?.href);
  assert.equal(menu?.[2]?.title, menu?.[2]?.href);
});

test('listingUrlIdentityKey extracts marketplace item ids for last-8 chips', () => {
  assert.equal(listingUrlIdentityKey('https://www.ebay.com/itm/123456789012'), '123456789012');
  assert.equal(listingUrlIdentityKey('https://www.amazon.com/dp/B012345678'), 'B012345678');
  assert.equal(listingUrlIdentityKey('https://shopgoodwill.com/item/267952401'), '267952401');
  assert.equal(listingUrlIdentityKey(''), '');
  assert.equal(listingUrlIdentityKey('not-a-url'), '');
});

test('buildOpenLinksHubHref encodes hrefs as a JSON query param', () => {
  const href = buildOpenLinksHubHref([
    { href: 'https://www.ebay.com/itm/1' },
    { href: 'https://www.amazon.com/dp/B0' },
  ]);
  assert.ok(href.startsWith('/open-links?'));
  const qs = new URLSearchParams(href.slice('/open-links?'.length));
  assert.deepEqual(JSON.parse(qs.get('links') ?? 'null'), [
    'https://www.ebay.com/itm/1',
    'https://www.amazon.com/dp/B0',
  ]);
});
