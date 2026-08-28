import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  displayPlatformSlugFromOrderId,
  inferMarketplaceFromOrderId,
  normalizeMarketplaceOrderId,
  platformFromOrderIdentityFields,
  resolveMarketplaceChipIdentity,
  resolveMarketplacePlatformMeta,
  storedOrInferredSourcePlatform,
} from './marketplace-order-id';
import { sourcePlatformMeta } from './source-platform';

test('eBay 2-5-5 (Seller Hub / receipt) is eBay, not Amazon', () => {
  assert.equal(inferMarketplaceFromOrderId('03-15100-78272'), 'ebay');
  assert.equal(inferMarketplaceFromOrderId('08-14924-82211'), 'ebay');
  assert.equal(inferMarketplaceFromOrderId('12-34567-89012'), 'ebay');
  assert.equal(inferMarketplaceFromOrderId('#03-15100-78272'), 'ebay');
});

test('Amazon official 3-7-7 is Amazon regardless of prefix', () => {
  assert.equal(inferMarketplaceFromOrderId('111-1234567-1234567'), 'amazon');
  assert.equal(inferMarketplaceFromOrderId('112-4738291-5047863'), 'amazon');
  assert.equal(inferMarketplaceFromOrderId('202-1234567-8901234'), 'amazon');
  assert.equal(inferMarketplaceFromOrderId('902-3159896-1390916'), 'amazon');
});

test('first-segment length is the discriminator', () => {
  // 2 digits → eBay; 3 digits → Amazon. Neither shape is a subset of the other.
  assert.equal(inferMarketplaceFromOrderId('11-15067-72584'), 'ebay');
  assert.equal(inferMarketplaceFromOrderId('111-1506772-5841234'), 'amazon');
});

test('near-misses and other channels are not inferred', () => {
  assert.equal(inferMarketplaceFromOrderId('03-15100-7827'), null); // 2-5-4
  assert.equal(inferMarketplaceFromOrderId('03-1510-78272'), null); // 2-4-5
  assert.equal(inferMarketplaceFromOrderId('111-12345-12345'), null); // 3-5-5
  assert.equal(inferMarketplaceFromOrderId('11-1234567-1234567'), null); // 2-7-7
  assert.equal(inferMarketplaceFromOrderId('121124971073-1094989827002'), null); // legacy eBay
  assert.equal(inferMarketplaceFromOrderId('4989'), null); // Ecwid-ish
  assert.equal(inferMarketplaceFromOrderId('123456789012345'), null); // Walmart 15
  assert.equal(inferMarketplaceFromOrderId(''), null);
  assert.equal(inferMarketplaceFromOrderId(null), null);
});

test('normalizeMarketplaceOrderId strips hash and unicode dashes', () => {
  assert.equal(normalizeMarketplaceOrderId('  #03–15100–78272  '), '03-15100-78272');
  assert.equal(inferMarketplaceFromOrderId('03–15100–78272'), 'ebay');
  assert.equal(inferMarketplaceFromOrderId('111−1234567−1234567'), 'amazon');
});

test('chip identity: format wins over a wrong account_source label', () => {
  const ebay = resolveMarketplaceChipIdentity('03-15100-78272', 'Zoho');
  assert.equal(ebay.fromFormat, true);
  assert.equal(ebay.platformLabel, 'eBay');
  assert.equal(ebay.iconClass, 'text-yellow-500');
  assert.equal(ebay.meta.value, 'ebay');

  const amazon = resolveMarketplaceChipIdentity('111-1234567-1234567', 'ebay');
  assert.equal(amazon.fromFormat, true);
  assert.equal(amazon.platformLabel, 'Amazon');
  assert.equal(amazon.iconClass, 'text-orange-600');
});

test('chip identity: non-format ids still use an explicit platform label', () => {
  const walmart = resolveMarketplaceChipIdentity('123456789012345', 'Walmart');
  assert.equal(walmart.fromFormat, false);
  assert.equal(walmart.platformLabel, 'Walmart');
  assert.equal(walmart.iconClass, 'text-amber-700');
});

test('chip identity: unknown id stays unlabeled', () => {
  const unknown = resolveMarketplaceChipIdentity('PO-99', null);
  assert.equal(unknown.fromFormat, false);
  assert.equal(unknown.platformLabel, null);
  assert.equal(unknown.meta.value, '');
});

test('brand meta keeps catalog accentHex when the format matches that channel', () => {
  const catalogEbay = { ...sourcePlatformMeta('ebay'), accentHex: '#c9a227' };
  const meta = resolveMarketplacePlatformMeta('03-15100-78272', catalogEbay);
  assert.equal(meta.accentHex, '#c9a227');
  assert.equal(meta.value, 'ebay');
});

test('platformFromOrderIdentityFields picks the first marketplace-shaped field', () => {
  assert.equal(
    platformFromOrderIdentityFields('03-15100-78272', null, '1Z999'),
    'ebay',
  );
  assert.equal(
    platformFromOrderIdentityFields('PO-99', '111-1234567-1234567'),
    'amazon',
  );
  assert.equal(platformFromOrderIdentityFields('PO-99', '', null), null);
});

test('storedOrInferredSourcePlatform — empty stored fills from 2-5-5 / 3-7-7', () => {
  assert.equal(storedOrInferredSourcePlatform(null, '03-15100-78272'), 'ebay');
  assert.equal(storedOrInferredSourcePlatform('', '111-1234567-1234567'), 'amazon');
});

test('storedOrInferredSourcePlatform — stored slug is not overwritten', () => {
  assert.equal(storedOrInferredSourcePlatform('amazon', '03-15100-78272'), 'amazon');
  assert.equal(storedOrInferredSourcePlatform('Goodwill', '03-15100-78272'), 'goodwill');
});

test('displayPlatformSlugFromOrderId — format wins over a stale fallback', () => {
  assert.equal(displayPlatformSlugFromOrderId('03-15100-78272', 'zoho'), 'ebay');
  assert.equal(displayPlatformSlugFromOrderId('111-1234567-1234567', 'ebay'), 'amazon');
  assert.equal(displayPlatformSlugFromOrderId('PO-99', 'walmart'), 'walmart');
});
