/**
 * Sheets orders queue — identity chips keep SoT Hash / MapPin tone icons.
 * `plain` (icon-less) was debt that hid the order-number hash; reversed.
 *
 *   npx tsx --test src/components/dashboard/orders-queue/orders-queue-plain-identity.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const ROW = join(__dirname, 'OrdersQueueTableRow.tsx');

describe('OrdersQueueTableRow — SoT identity chips (icons)', () => {
  const src = readFileSync(ROW, 'utf8');

  it('uses variant icons for OrderIdChip / TrackingChip (Hash present)', () => {
    assert.match(
      src,
      /variant:\s*'icons'\s+as\s+const/,
      'orders queue identity cells must use variant icons (Hash / MapPin)',
    );
    assert.doesNotMatch(
      src,
      /variant:\s*\(gridSkin\s*\?\s*'plain'/,
      'must not force plain (icon-less) chips on gridSkin',
    );
  });

  it('omits platform chip paint on this surface', () => {
    assert.match(
      src,
      /showPlatform:\s*false/,
      'orders queue must not paint PlatformChip / PlatformMark',
    );
    assert.doesNotMatch(
      src,
      /getOrderPlatformColor/,
      'must not color-map platform identity in the row view',
    );
  });

  it('does not mount link / open / notes / OOS row affordances', () => {
    assert.doesNotMatch(src, /data-expand-row/, 'Open order hover button must be gone');
    assert.doesNotMatch(src, /data-edit-link/, 'Edit listing link hover button must be gone');
    assert.doesNotMatch(src, /data-indicator="note"/, 'note corner indicator must be gone');
    assert.doesNotMatch(src, /data-indicator="oos"/, 'OOS corner indicator must be gone');
    assert.doesNotMatch(src, /RowInfoMenuPopover/, 'row info menu must be gone');
  });
});
