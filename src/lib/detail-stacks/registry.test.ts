/**
 * detailStackHref — rebuilds deep links for the assistant context rail /
 * dashboard recents. Orders reopen on the To-ship desk.
 * Run: npx tsx --test src/lib/detail-stacks/registry.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detailStackHref } from './registry';

test('detailStackHref: orders reopen on To-ship desk openOrderId', () => {
  assert.equal(
    detailStackHref({ kind: 'order', id: '6057', path: '/pack' }),
    '/shipping/orders?openOrderId=6057',
  );
});

test('detailStackHref: order ignores stored dashboard search params', () => {
  assert.equal(
    detailStackHref({
      kind: 'order',
      id: '6057',
      path: '/dashboard',
      search: 'shipped=&openOrderId=19361',
    }),
    '/shipping/orders?openOrderId=6057',
  );
});

test('detailStackHref: shipments canonicalize to /fba', () => {
  assert.equal(
    detailStackHref({ kind: 'shipment', id: '2', path: '/dashboard', search: 'openShipmentId=1' }),
    '/fba?openShipmentId=2',
  );
});

test('detailStackHref: receiving deep-links to the read carton inspector', () => {
  assert.equal(
    detailStackHref({
      kind: 'receiving',
      id: '99',
      path: '/unbox',
      search: 'mode=receive&openReceivingId=12',
    }),
    '/search?sel=receiving:99',
  );
});
