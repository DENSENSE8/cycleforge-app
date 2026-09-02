'use client';

import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EbayPackLabelCard } from './EbayPackLabelCard';

function renderCard(props: Partial<React.ComponentProps<typeof EbayPackLabelCard>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EbayPackLabelCard
        orderId={42}
        orderRef="EBAY-42"
        packerId={7}
        stationIpAddress="192.168.50.42"
        {...props}
      />
    </QueryClientProvider>,
  );
}

test('eBay pack label card exposes upload, preview, and print actions', () => {
  const html = renderCard();

  assert.match(html, /data-testid="ebay-pack-label-card"/);
  assert.match(html, /eBay shipping label/);
  assert.match(html, /data-testid="ebay-label-documents"/);
  assert.match(html, /data-testid="order-documents-preview"/);
  assert.match(html, /data-testid="ebay-print-label"/);
  assert.match(html, /Scan order ID to print/);
});

test('eBay pack label card shows printer registration state', () => {
  const html = renderCard({ stationIpAddress: null });

  assert.match(html, /station printer not registered/);
  assert.match(html, /data-testid="ebay-packer-printer-status"/);
  assert.match(html, /disabled/);
});

test('packScanMatchesOrder accepts only the active internal or marketplace order id', async () => {
  const { packScanMatchesOrder } = await import('./EbayPackLabelCard');

  assert.equal(packScanMatchesOrder(' EBAY-42 ', 42, 'EBAY-42'), true);
  assert.equal(packScanMatchesOrder('42', 42, 'EBAY-42'), true);
  assert.equal(packScanMatchesOrder('EBAY-43', 42, 'EBAY-42'), false);
  assert.equal(packScanMatchesOrder('', 42, 'EBAY-42'), false);
});
