import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlatformAccountRow, PlatformRow } from '@/lib/neon/catalog-queries';
import {
  buildOrderChannelResolver,
  buildPlatformShortLabelLookup,
  normalizeShortLabelInput,
  orderPlatformChoices,
  platformDisplayName,
} from './platform-display';

let nextId = 1;
function platform(slug: string, label: string, extra: Partial<PlatformRow> = {}): PlatformRow {
  return {
    id: nextId++,
    organization_id: 'org',
    slug,
    label,
    short_label: null,
    tone: null,
    color_hex: null,
    provider: null,
    sort_order: 100,
    is_active: true,
    is_system: true,
    created_at: '',
    updated_at: '',
    ...extra,
  };
}
function account(p: PlatformRow, slug: string, label: string, short: string | null = null): PlatformAccountRow {
  return {
    id: nextId++,
    organization_id: 'org',
    platform_id: p.id,
    slug,
    label,
    short_label: short,
    integration_scope: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  };
}

const AMAZON_ID = '111-1234567-1234567';
const EBAY_ID = '03-15100-78272';

const amazon = platform('amazon', 'Amazon');
const ebay = platform('ebay', 'eBay', { short_label: 'EB' });
const walmart = platform('walmart', 'Walmart');
const renewed = platform('amazon_renewed', 'Amazon Renewed', { short_label: 'AMZRN', color_hex: '#123456' });
const mekong = account(ebay, 'MEKONG', 'Mekong Store', 'MKG');
const usav = account(amazon, 'amazon-usav', 'Amazon USAV');
const resolve = buildOrderChannelResolver(
  [amazon, ebay, walmart, renewed],
  [mekong, usav, account(walmart, 'walmart-main', 'Walmart')],
);

test('a connection short label wins over its platform short label', () => {
  const d = resolve(EBAY_ID, 'mekong');
  assert.equal(d.label, 'eBay');
  assert.equal(d.shortLabel, 'MKG');
  assert.equal(d.connectionName, 'Mekong Store');
  assert.equal(d.meta.value, 'ebay');
  assert.equal(platformDisplayName(d), 'eBay · Mekong Store');
});

test('an eBay order keeps its linked ShipStation storefront in the full detail label', () => {
  const dragon = account(ebay, 'DRAGON', 'DRAGON');
  const d = buildOrderChannelResolver([ebay], [dragon])('21-15107-47310', 'DRAGON');
  assert.equal(d.label, 'eBay');
  assert.equal(d.connectionName, 'DRAGON');
  assert.equal(platformDisplayName(d), 'eBay · DRAGON');
});

test('account_source holding a connection NAME resolves through platform_accounts.label', () => {
  const d = resolve(AMAZON_ID, 'Amazon USAV');
  assert.equal(d.label, 'Amazon');
  // No short on the connection or platform → the built-in Amazon compact.
  assert.equal(d.shortLabel, 'AMZ');
  assert.equal(d.connectionName, 'Amazon USAV');
});

test('a custom platform reads its own label, short label and accent', () => {
  const d = resolve('R-889', 'amazon_renewed');
  assert.equal(d.label, 'Amazon Renewed');
  assert.equal(d.shortLabel, 'AMZRN');
  assert.equal(d.connectionName, null);
  assert.equal(d.meta.accentHex, '#123456');
});

test('the order-number shape beats a slug that names a different platform', () => {
  const d = resolve(AMAZON_ID, 'walmart');
  assert.equal(d.label, 'Amazon');
  assert.equal(d.shortLabel, 'AMZ');
  assert.equal(d.connectionName, null);
  assert.equal(d.meta.value, 'amazon');
});

test('a default connection named like its platform is not repeated as the connection', () => {
  const d = resolve('123456789012345', 'walmart-main');
  assert.equal(d.label, 'Walmart');
  assert.equal(d.connectionName, null);
  // No org or built-in compact → the full label.
  assert.equal(d.shortLabel, 'Walmart');
});

test('an empty catalog falls back to the static order-id inference', () => {
  const bare = buildOrderChannelResolver([], []);
  const d = bare(AMAZON_ID, null);
  assert.equal(d.label, 'Amazon');
  assert.equal(d.shortLabel, 'AMZ');
  assert.equal(d.meta.value, 'amazon');
  assert.equal(bare(null, 'QA-DEMO').label, 'QA-DEMO');
});

test('short-label lookup matches a platform by slug or display label, org overrides only', () => {
  const lookup = buildPlatformShortLabelLookup([amazon, renewed]);
  assert.equal(lookup('Amazon Renewed'), 'AMZRN');
  assert.equal(lookup('amazon_renewed'), 'AMZRN');
  assert.equal(lookup('Amazon'), null);
  assert.equal(lookup(''), null);
});

test('short-label input is trimmed and upper-cased; blank clears', () => {
  assert.equal(normalizeShortLabelInput('  amzrn '), 'AMZRN');
  assert.equal(normalizeShortLabelInput('   '), null);
});

test('order platform choices: each platform once, or its linked accounts in its place', () => {
  const ecwid = platform('ecwid', 'ECW');
  const ebay = platform('ebay', 'eBay');
  const hidden = platform('other', 'Other', { is_active: false });
  const ecwidMain = account(ecwid, 'ecwid-main', 'ECWID');
  const dragon = account(ebay, 'DRAGON', 'DRAGON');
  const zoho = account(ebay, 'ZOHO_MAIN', 'ZOHO_MAIN'); // no store sells as it
  const mirror = { ...account(ebay, 'shipstation-216566', 'eBay Dragonhn'), is_active: false };
  const choices = orderPlatformChoices(
    [ecwid, ebay, hidden],
    [ecwidMain, dragon, zoho, mirror],
    // Linked: Ecwid store → platform only; eBay Dragonhn → DRAGON; a stale link
    // to the retired mirror and one to the default account list nothing extra.
    [
      { platform_account_id: null },
      { platform_account_id: dragon.id },
      { platform_account_id: mirror.id },
      { platform_account_id: ecwidMain.id },
    ],
  );
  assert.deepEqual(choices, [
    { value: 'ecwid', label: 'ECW' },
    { value: 'DRAGON', label: 'eBay · DRAGON' },
  ], 'the bare "eBay" is a placeholder once a store sells as an account');
});
