/**
 * detailStackHref + parseOrderWorkspacePath — rebuilds deep links for the
 * assistant context rail / order workspace recents.
 * Run: npx tsx --test src/lib/detail-stacks/registry.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detailStackHref, parseOrderWorkspacePath } from './registry';

test('detailStackHref: orders always reopen on /o/[id]', () => {
  assert.equal(
    detailStackHref({ kind: 'order', id: '6057', path: '/pack' }),
    '/o/6057',
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
    '/o/6057',
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
    '/carton/99',
  );
});

test('parseOrderWorkspacePath: extracts /o/[orderId]', () => {
  assert.equal(parseOrderWorkspacePath('/o/6057'), '6057');
  assert.equal(parseOrderWorkspacePath('/o/12-34567-89012'), '12-34567-89012');
  assert.equal(parseOrderWorkspacePath('/o/encoded%2Fid'), 'encoded/id');
  assert.equal(parseOrderWorkspacePath('/dashboard'), null);
  assert.equal(parseOrderWorkspacePath('/o'), null);
  assert.equal(parseOrderWorkspacePath(null), null);
});
