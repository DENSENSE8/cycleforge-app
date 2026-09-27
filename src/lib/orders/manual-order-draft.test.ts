import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intakeFromCanonical } from '@/components/outbound/orders/intake/intake-model';
import {
  decodeOrderPrefill,
  emptyManualOrderDraft,
  encodeOrderPrefill,
  manualOrderDraftSchema,
  manualOrderDraftToIntake,
  type ManualOrderDraft,
} from './manual-order-draft';

const ebay: ManualOrderDraft = {
  ...emptyManualOrderDraft(),
  orderNumber: '12-34567-89012',
  channel: 'USAV',
  channelPlatform: 'ebay',
  channelLabel: 'eBay · USAV',
  customer: { id: null, name: 'Pat Buyer', phone: '', email: '', shipTo: { address1: '1 Main St', address2: '', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' } },
  lines: [{ skuCatalogId: null, sku: '', title: 'Bose 151 pair', quantity: 1, condition: null, unitPriceCents: null, itemNumber: '397944288197' }],
  listingUrl: 'https://www.ebay.com/itm/397944288197',
  trackingNumber: '9400108106245603001206',
};

test('Open in form: a marketplace draft reaches the intake form with the same channel, number, item number and tracking', () => {
  const back = decodeOrderPrefill(encodeOrderPrefill(ebay));
  assert.deepEqual(back, ebay);
  const form = intakeFromCanonical(manualOrderDraftToIntake(back!));
  assert.equal(form.channel, 'USAV');
  assert.equal(form.orderNumber, '12-34567-89012');
  assert.equal(form.orderNumberGenerated, false);
  assert.equal(form.lines[0].itemNumber, '397944288197');
  assert.equal(form.shippingMode, 'elsewhere');
  assert.equal(form.trackingNumber, '9400108106245603001206');
  assert.equal(form.customer.name, 'Pat Buyer');
});

test('buy-a-label intent opens the form on the buy-label path; a draft persisted before channels still parses as a phone order', () => {
  assert.equal(intakeFromCanonical(manualOrderDraftToIntake({ ...ebay, trackingNumber: '', buyLabel: true })).shippingMode, 'buy');
  const { channelPlatform: _p, channelLabel: _l, listingUrl: _u, trackingNumber: _t, buyLabel: _b, ...legacy } = emptyManualOrderDraft();
  const parsed = manualOrderDraftSchema.parse({ ...legacy, lines: [{ skuCatalogId: 1, sku: 'A', title: 'A', quantity: 1, condition: null, unitPriceCents: 100 }] });
  assert.equal(parsed.channelPlatform, '');
  assert.equal(parsed.lines[0].itemNumber, '');
});
