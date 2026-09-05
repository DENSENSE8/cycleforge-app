/**
 *   node --import tsx --test src/design-system/components/item-record/ItemRecordMetaGrid.test.ts
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ITEM_RECORD_META_TRACKS,
  ItemRecordMetaGrid,
} from './ItemRecordMetaGrid';

function trackOrder(html: string): string[] {
  return [...html.matchAll(/data-col="([^"]+)"/g)].map((m) => m[1]);
}

test('desk six-track order is qty price condition sku serial location', () => {
  assert.deepEqual(ITEM_RECORD_META_TRACKS, [
    'qty',
    'price',
    'condition',
    'sku',
    'serial',
    'location',
  ]);
  const html = renderToStaticMarkup(
    React.createElement(ItemRecordMetaGrid, {
      qty: 'Q',
      price: 'P',
      condition: 'C',
      sku: 'S',
      serial: 'N',
      location: 'L',
    }),
  );
  assert.deepEqual(trackOrder(html), [...ITEM_RECORD_META_TRACKS]);
});
