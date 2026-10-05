import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDetailsHref, recordDetailsNavigation } from './record-details';

test('a record opens the way its card does: its desk, its param — never a scan station', () => {
  assert.equal(recordDetailsHref({ kind: 'order', orderId: 11, shipped: false }), '/shipping/orders?openOrderId=11');
  assert.equal(recordDetailsHref({ kind: 'order', orderId: 11, shipped: true }), '/fulfilled?openOrderId=11');
  assert.equal(recordDetailsHref({ kind: 'receiving-number', ref: 'PO-1', lineId: 7 }), '/incoming?ref_in=PO-1&openLine=7');
  // A number no line holds opens its card's placeholder (negative).
  assert.match(recordDetailsHref({ kind: 'receiving-number', ref: 'PO-1', lineId: null }), /^\/incoming\?ref_in=PO-1&openLine=-\d+$/);
});

test('in place over the desk list that holds it; from anywhere else, there and back', () => {
  const href = '/incoming?ref_in=PO-1&openLine=7';
  // The Incoming pasted list holds PO-1: only the open record moves, the held list stays.
  assert.deepEqual(recordDetailsNavigation(href, { pathname: '/incoming', search: 'ref_in=PO-1,PO-2&recon=received' }), {
    mode: 'replace',
    href: '/incoming?ref_in=PO-1%2CPO-2&recon=received&openLine=7',
  });
  // The full list page: navigate, and the record's close comes back to the sheet.
  assert.deepEqual(recordDetailsNavigation(href, { pathname: '/search/list', search: '?refs=PO-1,PO-2' }), {
    mode: 'push',
    href: '/incoming?ref_in=PO-1&openLine=7&recordBack=%2Fsearch%2Flist%3Frefs%3DPO-1%2CPO-2',
  });
  // An order from its own desk opens in place.
  assert.equal(
    recordDetailsNavigation('/shipping/orders?openOrderId=11', { pathname: '/shipping/orders', search: 'refs=A,B' }).mode,
    'replace',
  );
});
