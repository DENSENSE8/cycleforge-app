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
      location="B-01-S4"
      qty="2"
      condition={{ label: 'USED — EXCELLENT', tone: 'text-text-warning' }}
      onOpen={() => {}}
      primary={null}
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
  assert.doesNotMatch(html, /rounded-(?:lg|xl|2xl|3xl|full)/, 'the row remains a flat industrial sheet');
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
    html.indexOf('Bin: B-01-S4') < html.indexOf("ORD-8821")
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

test('photo inspection is a no-navigation, centered scrim overlay', () => {
  const source = require('node:fs').readFileSync(
    new URL('./ItemCardRow.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /data-testid="item-card-photo-inspect"/);
  assert.match(source, /fixed inset-0 z-modal flex items-center justify-center bg-scrim\/30/);
  assert.match(source, /onPointerDown=\{onDismiss\}/);
  assert.doesNotMatch(source, /document\.addEventListener\('pointerup'/, 'opening the lightbox never self-dismisses on release');
  assert.doesNotMatch(source, /onPointerUp=\{\(\) => setPhotoInspecting/, 'the thumbnail release cannot close an open lightbox');
  assert.doesNotMatch(source, /router\.push|href=\{.*image/i, 'inspection never becomes a detail-route door');
});
