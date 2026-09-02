import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { PoLineRow } from './PoLineRow';

function line(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 7,
    receiving_id: 42,
    item_name: 'Bose Wave Music System',
    zoho_item_title: 'Bose Wave Music System',
    catalog_product_title: null,
    sku: 'BOSE-WAVE',
    quantity_expected: 1,
    quantity_received: 1,
    unit_price: 99,
    condition_grade: 'A',
    serials: [],
    staged_at: '2026-09-02T00:00:00.000Z',
    staged_location_id: 84,
    staged_location_name: 'Returns shelf 51851',
    staged_location_code: 'R-51851',
    staged_location_barcode: 'LOC-R-51851',
    ...overrides,
  } as ReceivingLineRow;
}

function renderRow(row: ReceivingLineRow, onOpenLocation?: (line: ReceivingLineRow) => void) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PoLineRow
        line={row}
        isActive
        readOnly={false}
        unitsChrome={false}
        onOpenLocation={onOpenLocation}
      />
    </QueryClientProvider>,
  );
}

test('PO item location is inline in the bottom metadata row and uses the human label', () => {
  const html = renderRow(line());

  assert.match(html, /data-testid="item-record-location"/);
  assert.match(html, /data-col="location"/);
  assert.match(html, /Returns shelf 51851/);
  assert.match(html, /data-testid="item-record-location-icon"/);
  assert.ok(
    html.indexOf('data-col="location"') > html.indexOf('data-col="price"'),
    'location belongs after the existing price/cash-receipt metadata track',
  );
  assert.doesNotMatch(html, /TaskContextBar|task-context-bar/);
});

test('an unassigned PO item shows only the amber location pin, without a text blocker', () => {
  const html = renderRow(
    line({
      staged_at: null,
      staged_location_id: null,
      staged_location_name: null,
      staged_location_code: null,
      staged_location_barcode: null,
    }),
  );

  assert.match(html, /data-location-pending="true"/);
  assert.match(html, /data-testid="item-record-location-icon"/);
  assert.doesNotMatch(html, />SCAN</);
  assert.doesNotMatch(html, />NEEDS LOCATION</);
});

test('clicking the inline location opens the existing location display for that line', () => {
  let opened: ReceivingLineRow | null = null;
  const html = renderRow(line(), (selected) => {
    opened = selected;
  });

  assert.match(html, /data-testid="item-record-location-action"/);
  assert.match(html, /aria-label="Open location for Bose Wave Music System"/);
  assert.equal(opened, null);
});
