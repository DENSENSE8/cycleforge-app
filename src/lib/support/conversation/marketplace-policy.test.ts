import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketplacePolicy, MARKETPLACE_MAX_LENGTH } from './marketplace-policy';

test('eBay: links, emails and phone numbers are removed; each rewrite is named', () => {
  const out = applyMarketplacePolicy(
    'ebay',
    'Hi! Email me at jo.smith@example.com or call (555) 123-4567, or see https://usav.com/returns and www.usav.com.',
  );
  assert.ok(!out.body.includes('jo.smith@example.com'));
  assert.ok(!out.body.includes('123-4567'));
  assert.ok(!out.body.includes('https://'));
  assert.ok(!out.body.includes('usav.com'));
  assert.ok(out.body.includes('[email removed]'));
  assert.ok(out.body.includes('[phone removed]'));
  assert.deepEqual(out.changes, ['emails_removed', 'links_removed', 'phone_numbers_removed']);
});

test('eBay: order numbers, item ids and tracking numbers survive (bare digit runs are not phones)', () => {
  const body = 'Order 16-14873-30704, item 296543218877, tracking 9400111899561234567890, SKU 01091-BK.';
  const out = applyMarketplacePolicy('ebay', body);
  assert.equal(out.body, body);
  assert.deepEqual(out.changes, []);
});

test('an email address is removed whole — never left as name@[link removed]', () => {
  const out = applyMarketplacePolicy('amazon', 'Write to help@usav.com please');
  assert.equal(out.body, 'Write to [email removed] please');
  assert.deepEqual(out.changes, ['emails_removed']);
});

test('card numbers are redacted on every channel; non-marketplace text is otherwise untouched', () => {
  const out = applyMarketplacePolicy('zendesk', 'Card 4111 1111 1111 1111, call 555-123-4567, https://usav.com');
  assert.ok(!out.body.includes('4111 1111 1111 1111'));
  assert.ok(out.body.includes('555-123-4567'));
  assert.ok(out.body.includes('https://usav.com'));
  assert.deepEqual(out.changes, ['card_numbers_removed']);
});

test('length limits: eBay 2000, Amazon 4000, none elsewhere', () => {
  assert.equal(MARKETPLACE_MAX_LENGTH.ebay, 2000);
  assert.equal(MARKETPLACE_MAX_LENGTH.amazon, 4000);
  const ebay = applyMarketplacePolicy('ebay', 'a'.repeat(2500));
  assert.equal(ebay.body.length, 2000);
  assert.ok(ebay.body.endsWith('…'));
  assert.deepEqual(ebay.changes, ['truncated']);
  const amazonAtLimit = applyMarketplacePolicy('amazon', 'b'.repeat(4000));
  assert.equal(amazonAtLimit.body.length, 4000);
  assert.deepEqual(amazonAtLimit.changes, []);
  const email = applyMarketplacePolicy('email', 'c'.repeat(9000));
  assert.equal(email.body.length, 9000);
});

test('deterministic: the same input always yields the same output', () => {
  const body = 'Reach me at 555.123.4567 or me@x.io — www.example.com';
  assert.deepEqual(applyMarketplacePolicy('ebay', body), applyMarketplacePolicy('ebay', body));
});
