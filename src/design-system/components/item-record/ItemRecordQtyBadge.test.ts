/**
 *   node --import tsx --test src/design-system/components/item-record/ItemRecordQtyBadge.test.ts
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ItemRecordQtyBadge,
  receiveQtyRemaining,
  receiveQtyState,
} from './ItemRecordQtyBadge';

function paint(quantity: React.ComponentProps<typeof ItemRecordQtyBadge>['quantity']) {
  return renderToStaticMarkup(React.createElement(ItemRecordQtyBadge, { quantity }));
}

test('receiveQtyRemaining never goes below zero', () => {
  assert.equal(receiveQtyRemaining(0, 1), 1);
  assert.equal(receiveQtyRemaining(1, 1), 0);
  assert.equal(receiveQtyRemaining(3, 1), 0);
});

test('receiveQtyState: Open is got 0, never complete', () => {
  assert.equal(receiveQtyState(0, 1), 'open');
  assert.equal(receiveQtyState(1, 3), 'partial');
  assert.equal(receiveQtyState(1, 1), 'complete');
});

test('orders stay expected-only: a number, no remaining, no emerald', () => {
  const html = paint({ expected: 3 });
  assert.match(html, />3</);
  assert.doesNotMatch(html, /left/);
  assert.doesNotMatch(html, /emerald/);
  assert.doesNotMatch(html, /data-qty-receive/);
});

test('serial-unit 1/1 is progress, not receive: emerald ok, no remaining', () => {
  const html = paint({ counted: 1, expected: 1 });
  assert.match(html, />1\/1</);
  assert.match(html, /text-emerald-600/);
  assert.doesNotMatch(html, /left/);
  assert.doesNotMatch(html, /data-qty-receive/);
});

test('Open receive is 0/listed plus remaining, never emerald', () => {
  const html = paint({ counted: 0, expected: 1, receive: true });
  assert.match(html, /data-qty-state="open"/);
  assert.match(html, /data-qty-remaining="1"/);
  assert.match(html, /0\/1/);
  assert.match(html, /1 left/);
  assert.match(html, /0 got of 1 listed, 1 remaining/);
  assert.doesNotMatch(html, /emerald/);
});

test('Partial receive warns and names remaining', () => {
  const html = paint({ counted: 1, expected: 3, receive: true });
  assert.match(html, /data-qty-state="partial"/);
  assert.match(html, /text-text-warning/);
  assert.match(html, /2 left/);
});

test('Complete receive is not color-only: 0 left stays visible', () => {
  const html = paint({ counted: 1, expected: 1, receive: true });
  assert.match(html, /data-qty-state="complete"/);
  assert.match(html, /text-emerald-600/);
  assert.match(html, /0 left/);
  assert.match(html, /0 remaining/);
});
