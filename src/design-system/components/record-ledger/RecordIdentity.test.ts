import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { RecordPlatformFace, RecordListingLink } from './RecordIdentity';
import { buildOrderChannelResolver } from '@/lib/platform-display';

test('shared platform face prints the catalog-derived compact platform and dot', () => {
  const channel = buildOrderChannelResolver([], [])('12-15207-56171', 'ebay');
  const html = renderToStaticMarkup(React.createElement(RecordPlatformFace, { channel }));
  assert.ok(html.includes(channel.shortLabel));
  assert.ok(html.includes('record-platform'));
  assert.ok(html.includes('title="eBay"'));
});

test('item value face displays the full number and a safe new-tab listing link', () => {
  const html = renderToStaticMarkup(React.createElement(RecordListingLink, { href: 'https://shopgoodwill.com/item/276843321', itemNumber: '276843321', face: 'value' }));
  assert.ok(html.includes('>276843321</span>'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('target="_blank"'));
});

test('receiving and To-ship share the exact identity presentation', () => {
  const outbound = readFileSync('src/components/outbound/orders/OutboundOrdersLedger.tsx', 'utf8');
  const receiving = readFileSync('src/components/receiving/ReceivingRecordIdentity.tsx', 'utf8');
  const editors = readFileSync('src/components/outbound/orders/outbound-orders-ledger-editors.tsx', 'utf8');
  assert.match(outbound, /<RecordPlatformFace channel=\{channel\}/);
  assert.match(receiving, /<RecordPlatformFace channel=\{channel\}/);
  assert.match(editors, /RecordListingLink as LedgerListingLink/);
  assert.match(receiving, /<RecordListingLink/);
});
