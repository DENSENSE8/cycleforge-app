import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotAsListedIssue,
  orderIdHintForSellerClaim,
  resolveSellerClaimedCondition,
} from './seller-claimed-condition';

test('order sold-as wins over listing condition', () => {
  const r = resolveSellerClaimedCondition({
    matchedOrderCondition: 'USED_GOOD',
    listingCondition: 'NEW',
  });
  assert.equal(r.source, 'order');
  assert.equal(r.label, 'Used Good');
  assert.equal(r.raw, 'USED_GOOD');
});

test('listing condition is used when order is absent', () => {
  const r = resolveSellerClaimedCondition({
    matchedOrderCondition: null,
    listingCondition: 'LIKE_NEW',
  });
  assert.equal(r.source, 'listing');
  assert.equal(r.label, 'Like New');
});

test('honest absence when neither fact exists', () => {
  const r = resolveSellerClaimedCondition({});
  assert.equal(r.label, null);
  assert.equal(r.source, null);
  assert.equal(r.raw, null);
});

test('not-as-listed issue names the claim and optional detail', () => {
  const claimed = resolveSellerClaimedCondition({ matchedOrderCondition: 'NEW' });
  assert.equal(
    buildNotAsListedIssue({ claimed, issueDetail: 'Power button dead' }),
    'Listed / sold as New. Issue: Power button dead',
  );
  assert.match(buildNotAsListedIssue({ claimed }), /does not work as listed/i);
});

test('orderIdHintForSellerClaim only on RETURN cartons', () => {
  assert.equal(
    orderIdHintForSellerClaim({
      receiving_type: 'RETURN',
      source_order_id: 'EBAY-99',
      zoho_purchaseorder_number: 'PO-1',
    }),
    'EBAY-99',
  );
  assert.equal(
    orderIdHintForSellerClaim({
      carton_intake_type: 'RETURN',
      zoho_purchaseorder_number: 'AMZ-7',
    }),
    'AMZ-7',
  );
  assert.equal(
    orderIdHintForSellerClaim({
      receiving_type: 'PO',
      source_order_id: 'EBAY-1',
      zoho_purchaseorder_number: 'PO-9',
    }),
    null,
  );
});
