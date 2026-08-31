import assert from 'node:assert/strict';
import test from 'node:test';

import { hrefForPreviewHit } from '@/lib/search/commit-identifier-find';

test('hrefForPreviewHit: orders use feedback sel href', () => {
  assert.equal(
    hrefForPreviewHit({ entityType: 'order', id: 7, href: '/shipping/orders?x=1' }),
    '/search?sel=order:7',
  );
});

test('hrefForPreviewHit: units open search unit station', () => {
  assert.equal(
    hrefForPreviewHit({ entityType: 'unit', id: 3, href: '/inventory/units?unit=3' }),
    '/search?sel=unit:3',
  );
});

test('hrefForPreviewHit: never returns a mobile Digital Link', () => {
  assert.equal(
    hrefForPreviewHit({ entityType: 'receiving', id: 99, href: '/m/r/99' }),
    '/search?sel=receiving:99',
  );
});
