import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCartonListingLinks,
  formatListingLinkMenuOptions,
  listingUrlIdentityKey,
  listingUrlPlatform,
  normalizeListingHref,
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

test("each sync-note link keeps the buyer's own title, in the buyer's order", () => {
  // The triage case: one PO, four auctions, one box. `label` is identical on
  // all four ("Listing"/"Synced"), so the title is the ONLY thing that lets an
  // unboxer say which physical item is which link.
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
  });
  assert.deepEqual(
    links.map((l) => l.title),
    [
      'Bose Acoustimass AM-500',
      'Bose CineMate 15',
      'Bose Model 141',
      '(2) Bose Companion 2',
    ],
  );
  // Untitled links report absence honestly rather than echoing the kind.
  const untitled = collectCartonListingLinks({
    listingLink: '',
    syncNotes: 'https://shopgoodwill.com/item/267952401',
    sku: '',
    isUnmatched: false,
  });
  assert.equal(untitled[0]?.title, null);
  assert.equal(untitled[0]?.label, 'Listing');
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

test('listingUrlPlatform reads the marketplace off the host, ccTLDs included', () => {
  assert.equal(listingUrlPlatform('https://www.ebay.com/itm/123456789012'), 'ebay');
  assert.equal(listingUrlPlatform('https://m.ebay.co.uk/itm/123456789012'), 'ebay');
  assert.equal(listingUrlPlatform('https://www.amazon.de/dp/B012345678'), 'amazon');
  assert.equal(listingUrlPlatform('https://shopgoodwill.com/item/267952401'), 'goodwill');
  assert.equal(listingUrlPlatform('https://usavshop.com/products/1018'), 'ecwid');
  // Unrecognised host is '' — never guessed into a platform we would then paint.
  assert.equal(listingUrlPlatform('https://example.com/itm/123456789012'), '');
  assert.equal(listingUrlPlatform(''), '');
});

test('normalizeListingHref rejects non-http schemes instead of repairing them', () => {
  assert.equal(normalizeListingHref('www.ebay.com/itm/1'), 'https://www.ebay.com/itm/1');
  assert.equal(normalizeListingHref('ftp://example.com/itm/123456'), null);
  assert.equal(normalizeListingHref('javascript:evil(1)'), null);
  // A bare host:port is not a scheme — the port must survive.
  assert.equal(normalizeListingHref('example.com:8080/itm/1'), 'https://example.com:8080/itm/1');
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


test('durable links: stored rows replace the pasted scalar and carry their row id', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://www.ebay.com/itm/111111111111',
    syncNotes: null,
    sku: null,
    sourcePlatform: 'ebay',
    isUnmatched: false,
    storedLinks: [
      { id: 7, href: 'https://www.ebay.com/itm/222222222222', label: 'Left speaker', source: 'manual' },
      { id: 8, href: 'https://www.ebay.com/itm/333333333333', label: null, source: 'manual' },
    ],
  });
  assert.deepEqual(links.map((l) => l.href), [
    'https://www.ebay.com/itm/222222222222',
    'https://www.ebay.com/itm/333333333333',
  ]);
  assert.deepEqual(links.map((l) => l.id), [7, 8]);
  assert.equal(links[0].title, 'Left speaker');
});

test('durable links: an empty store falls back to the legacy scalar read', () => {
  const links = collectCartonListingLinks({
    listingLink: 'https://www.ebay.com/itm/111111111111',
    syncNotes: null,
    sku: null,
    sourcePlatform: 'ebay',
    isUnmatched: false,
    storedLinks: [],
  });
  assert.deepEqual(links.map((l) => l.href), ['https://www.ebay.com/itm/111111111111']);
  assert.equal(links[0].id, null);
});

test('durable links: a stored sync-note row suppresses catalog + derived, as the parse always did', () => {
  const links = collectCartonListingLinks({
    listingLink: '',
    syncNotes: null,
    sku: 'ABC-123',
    sourcePlatform: 'ebay',
    isUnmatched: false,
    storedLinks: [
      { id: 3, href: 'https://www.ebay.com/itm/444444444444', label: 'Lot item 1', source: 'sync_notes' },
    ],
    platforms: [{ platform: 'ebay', listingUrl: 'https://www.ebay.com/itm/555555555555' }],
  });
  assert.deepEqual(links.map((l) => l.href), ['https://www.ebay.com/itm/444444444444']);
});
