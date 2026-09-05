/**
 * Run: npx tsx --test src/lib/assistant/carton-ask-brief.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReceivingCartonBrief, isCartonAskQuestion, productDisplayName } from './carton-ask-brief';

test('productDisplayName prefers the catalog title over a SKU', () => {
  assert.equal(
    productDisplayName({ title: 'Bose SoundLink Mini II', sku: 'BOSE-SLM2-BK' }),
    'Bose SoundLink Mini II',
  );
  assert.equal(productDisplayName({ title: '', sku: 'BOSE-SLM2-BK' }), 'BOSE-SLM2-BK');
});

test('formatReceivingCartonBrief names products and never cites receiving/line ids', () => {
  const text = formatReceivingCartonBrief({
    tracking: 'QA-MOCK-TRK-PO',
    carrier: 'Mock',
    pairing: 'UNFOUND',
    intake: 'REPAIR',
    isReturn: false,
    platform: 'ecwid',
    photoCount: 5,
    products: [
      {
        title: 'Bose SoundLink Mini II',
        sku: 'BOSE-SLM2-BK',
        qtyExpected: 1,
        qtyReceived: 0,
        condition: 'BRAND_NEW',
        needsTest: true,
        category: 'Speakers',
      },
    ],
  });
  assert.match(text, /Bose SoundLink Mini II/);
  assert.match(text, /expecting 1/);
  assert.match(text, /still needs test/);
  assert.match(text, /not matched to a purchase order/);
  assert.match(text, /5 photos/);
  assert.doesNotMatch(text, /Receiving #/i);
  assert.doesNotMatch(text, /\bline \d+/i);
});

test('isCartonAskQuestion: carton language vs workspace packing counts', () => {
  assert.equal(isCartonAskQuestion('tell me about this order'), true);
  assert.equal(isCartonAskQuestion("what's in the box?"), true);
  assert.equal(isCartonAskQuestion('how many packages were packed by this packer on this week?'), false);
});
