/**
 * Contract pins for the shared mobile outbound record. These guard the
 * tactile image rules without having to couple every queue adapter to them.
 *
 * npx tsx --test src/components/mobile/redesign/ItemCardRow.test.tsx
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemCardRow } from './ItemCardRow';

function render(props: Partial<React.ComponentProps<typeof ItemCardRow>> = {}) {
  return renderToStaticMarkup(
    <ItemCardRow
      title="Shimano GRX Crankset"
      orderContext="Shopify · ORD-8821"
      reference="SHI-810-CRK-172"
      location={{ text: 'B-01-S4' }}
      qty="2"
      condition={{ label: 'USED — EXCELLENT', tone: 'text-text-warning' }}
      onOpen={() => {}}
      {...props}
    />,
  );
}

test('queues the image as a 48px bento-grid cell beside the three record rows', () => {
  const html = render({ imageUrl: 'https://cdn.example.test/crankset.jpg' });
  assert.match(html, /data-item-card-bento/);
  assert.match(html, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(html, /w-12/, 'queued rows stay at the 48px phone thumbnail token');
  assert.match(html, /SHI-810-CRK-172/);
  assert.match(html, /QTY|Qty/);
});

test('active targets upgrade only the thumbnail grid cell to the 80px preview', () => {
  const html = render({ imageUrl: 'https://cdn.example.test/crankset.jpg', active: true });
  assert.match(html, /w-20/, 'active target owns the 80px inspection preview');
});

test('a missing photo retains a high-contrast part silhouette and identity mark', () => {
  const html = render({ imageUrl: null });
  assert.match(html, /data-item-record-thumb/);
  assert.match(html, /data-testid="item-card-photo-fallback"/);
  assert.match(html, />Part</, 'the fallback code is never an orphaned string');
  assert.match(html, />SG</, 'two deterministic title initials remove blank thumbnail space');
  assert.match(html, /has no product image/, 'the disabled inspection target explains its state');
});

test('the tactical roster starts with location context, anchors the SKU and listing inspector, and reserves its right rail for quantity', () => {
  const html = render({
    managementStatus: 'Ready to pick',
    managementAction: 'Pick',
    quantityStatus: 'Picked 0/2',
    managementOwner: 'Warehouse',
    listing: { href: 'https://www.amazon.com/dp/B00143', platform: 'Amazon' },
    price: '$149.99',
  });
  assert.match(html, /sku: SHI-810-CRK-172/);
  assert.ok(
    html.indexOf('B-01-S4') < html.indexOf("ORD-8821")
      && html.indexOf("ORD-8821") < html.lastIndexOf("Shimano GRX Crankset")
      && html.lastIndexOf("Shimano GRX Crankset") < html.lastIndexOf("sku: SHI-810-CRK-172"),
    'location and order context lead the row; title leads Row 2 and the scan fallback remains in Row 3',
  );
  assert.match(html, /data-testid="item-card-condition"/);
  assert.match(html, /data-testid="item-card-price"/);
  assert.match(html, />\$149\.99</);
  assert.match(html, /data-testid="item-card-management-status"/);
  assert.match(html, /Ready to pick/);
  assert.match(html, /Owner: Warehouse/);
  assert.match(html, /data-testid="item-card-management-owner"/);
  assert.match(html, /data-testid="item-card-quantity-anchor"/);
  assert.ok(html.indexOf('data-testid="item-card-quantity-anchor"') > html.indexOf('sku: SHI-810-CRK-172'));
  assert.match(html, /data-testid="item-card-listing"/);
  assert.match(html, /Amazon listing/);
});

test('an unknown bin paints an honest No bin warning instead of a blank or fake bin', () => {
  const html = render({ location: { text: null } });
  assert.match(html, /data-tone="missing"/);
  assert.match(html, />No bin</);
  assert.doesNotMatch(html, /Unassigned/);
});

test('the bin badge is a button only when the caller can set the bin', () => {
  assert.doesNotMatch(render(), /<button[^>]*data-testid="location-badge"/);
  const pressable = render({ location: { text: null, onPress: () => {} } });
  assert.match(pressable, /<button[^>]*data-testid="location-badge"[^>]*aria-label="No bin — set bin"/);
});
