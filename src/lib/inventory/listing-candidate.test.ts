import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_URL_PARSE_MESSAGE,
  listingCheckHref,
  parseListingUrl,
} from './listing-candidate';
import { listingUrlIdentityKey, listingUrlItemId } from '@/lib/receiving/listing-links';

// ── The shapes operators actually paste ────────────────────────────────────── Plan Phase 0:

const PASTED_LISTINGS: Array<{ url: string; itemNumber: string; platform: string }> = [
  // eBay — bare, with tracking query, with title slug, mobile host, ccTLD.
  { url: 'https://www.ebay.com/itm/123456789012', itemNumber: '123456789012', platform: 'ebay' },
  {
    url: 'https://www.ebay.com/itm/123456789012?hash=item1c8f2a&amdata=enc%3AAQ',
    itemNumber: '123456789012',
    platform: 'ebay',
  },
  {
    url: 'https://www.ebay.com/itm/Vintage-Sony-Walkman-WM-10/123456789012',
    itemNumber: '123456789012',
    platform: 'ebay',
  },
  { url: 'https://m.ebay.com/itm/123456789012', itemNumber: '123456789012', platform: 'ebay' },
  { url: 'https://www.ebay.co.uk/itm/123456789012', itemNumber: '123456789012', platform: 'ebay' },
  // Pasted without a scheme (a very common copy out of a chat message).
  { url: 'www.ebay.com/itm/123456789012', itemNumber: '123456789012', platform: 'ebay' },

  // Amazon — bare dp, dp with title + ref suffix, legacy gp/product, lowercase ASIN.
  { url: 'https://www.amazon.com/dp/B0ABCDEFGH', itemNumber: 'B0ABCDEFGH', platform: 'amazon' },
  {
    url: 'https://www.amazon.com/Sony-Portable-Cassette-Player/dp/B0ABCDEFGH/ref=sr_1_3?keywords=walkman',
    itemNumber: 'B0ABCDEFGH',
    platform: 'amazon',
  },
  {
    url: 'https://www.amazon.com/gp/product/B0ABCDEFGH',
    itemNumber: 'B0ABCDEFGH',
    platform: 'amazon',
  },
  { url: 'https://www.amazon.com/dp/b0abcdefgh', itemNumber: 'B0ABCDEFGH', platform: 'amazon' },

  // Other marketplaces we can attribute.
  { url: 'https://shopgoodwill.com/item/267952401', itemNumber: '267952401', platform: 'goodwill' },
  {
    url: 'https://www.walmart.com/ip/Sony-Walkman/123456789',
    itemNumber: '123456789',
    platform: 'walmart',
  },
];

for (const { url, itemNumber, platform } of PASTED_LISTINGS) {
  test(`parseListingUrl: ${url}`, () => {
    const parsed = parseListingUrl(url);
    assert.equal(parsed.ok, true, `expected a candidate for ${url}`);
    if (!parsed.ok) return;
    assert.equal(parsed.candidate.itemNumber, itemNumber);
    assert.equal(parsed.candidate.platform, platform);
    assert.equal(parsed.candidate.source, 'url_parse');
    // The href we open is the pasted listing, normalized to absolute.
    assert.match(parsed.candidate.listingUrl, /^https?:\/\//);
  });
}

// ── The refusals — this is the safety half ───────────────────────────────────

test('parseListingUrl refuses a URL with no structural item id', () => {
  // Every one of these is a page an operator can genuinely land on while
  // hunting, and every one of them fooled the cosmetic chip parser.
  const noId = [
    'https://www.ebay.com/sch/i.html?_nkw=sony+walkman',
    'https://www.ebay.com/usr/someseller',
    'https://www.amazon.com/s?k=sony+walkman',
    'https://usavshop.com/products/search?keyword=1018',
    'https://www.ebay.com/b/Portable-Audio/15052',
  ];
  for (const url of noId) {
    const parsed = parseListingUrl(url);
    assert.equal(parsed.ok, false, `${url} must not yield an item number`);
    if (!parsed.ok) assert.equal(parsed.reason, 'no_item_number');
  }
});

test('parseListingUrl separates "not a URL" from "URL without an id"', () => {
  for (const raw of ['', '   ', '123456789012', 'sony walkman', null, undefined]) {
    const parsed = parseListingUrl(raw);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.reason, 'not_a_url');
  }
  // Both failures carry operator copy, so the rail never renders a bare error.
  assert.ok(LISTING_URL_PARSE_MESSAGE.not_a_url.length > 0);
  assert.ok(LISTING_URL_PARSE_MESSAGE.no_item_number.length > 0);
});

test('parseListingUrl refuses non-http schemes', () => {
  for (const raw of ['javascript:evil(1)', 'file:///etc/passwd', 'ftp://example.com/itm/123456']) {
    const parsed = parseListingUrl(raw);
    assert.equal(parsed.ok, false);
  }
});

/** The regression this whole strict path exists for. */
test('the strict item id NEVER inherits the chip parser\'s loose fallback', () => {
  const searchPage = 'https://www.ebay.com/sch/i.html?_nkw=widget';
  assert.equal(listingUrlIdentityKey(searchPage), 'ihtml'); // cosmetic: fine
  assert.equal(listingUrlItemId(searchPage), ''); // writable: refused

  const storefront = 'https://www.ebay.com/usr/someseller';
  assert.equal(listingUrlIdentityKey(storefront), 'someseller');
  assert.equal(listingUrlItemId(storefront), '');

  // A slug-valued id param is not an item number either.
  assert.equal(listingUrlItemId('https://example.com/p?id=widget-blue'), '');
  assert.equal(listingUrlItemId('https://example.com/p?id=123456789'), '123456789');
});

// ── listingCheckHref — what "Open listing" opens ─────────────────────────────

test('listingCheckHref prefers the pasted URL over anything rebuilt from the id', () => {
  // Rebuilding would drop the query and point at .com for a .co.uk listing.
  assert.equal(
    listingCheckHref({
      itemNumber: '123456789012',
      listingUrl: 'https://www.ebay.co.uk/itm/123456789012?hash=item1c8',
      accountSource: 'eBay',
    }),
    'https://www.ebay.co.uk/itm/123456789012?hash=item1c8',
  );
});

test('listingCheckHref derives from the account platform for a TYPED item number', () => {
  assert.equal(
    listingCheckHref({ itemNumber: '123456789012', accountSource: 'eBay' }),
    'https://www.ebay.com/itm/123456789012',
  );
  assert.equal(
    listingCheckHref({ itemNumber: 'B0ABCDEFGH', accountSource: 'Amazon' }),
    'https://www.amazon.com/dp/B0ABCDEFGH',
  );
});

test('listingCheckHref falls back to id-pattern inference on an unknown account', () => {
  assert.equal(
    listingCheckHref({ itemNumber: '123456789012', accountSource: 'Some Sheet Tab' }),
    'https://www.ebay.com/itm/123456789012',
  );
});

test('listingCheckHref is honestly null when there is nothing to open', () => {
  assert.equal(listingCheckHref({ itemNumber: '' }), null);
  assert.equal(listingCheckHref({ itemNumber: null }), null);
  // Zoho is inventory identity, not a storefront — never a usavshop search URL.
  assert.equal(listingCheckHref({ itemNumber: '1018', accountSource: 'Zoho' }), null);
  // A garbage "URL" does not suppress the derived fallback.
  assert.equal(
    listingCheckHref({ itemNumber: '123456789012', listingUrl: 'not a url', accountSource: 'eBay' }),
    'https://www.ebay.com/itm/123456789012',
  );
});
