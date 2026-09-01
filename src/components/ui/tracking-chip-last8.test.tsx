/**
 * Tracking face = Unbox last-8 SoT — never CSS-truncate the eight digits.
 *
 *   npx tsx --test src/components/ui/tracking-chip-last8.test.tsx
 */

import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLast8 } from '@/lib/copy-chip-format';
import { TrackingChip } from '@/components/ui/CopyChip';

const LONG_TRACKING = '1Z999AA10123456784';

test('getLast8 is the trailing eight for carrier tracking', () => {
  assert.equal(getLast8(LONG_TRACKING), LONG_TRACKING.slice(-8));
  assert.equal(getLast8(LONG_TRACKING).length, 8);
});

test('TrackingChip paints the full last-8 and locks width — no CSS truncate', () => {
  const html = renderToStaticMarkup(<TrackingChip value={LONG_TRACKING} dense />);
  const face = LONG_TRACKING.slice(-8);
  assert.match(html, new RegExp(face));
  assert.match(html, /w-\[8\.25ch\]/, 'last8 displayWidth is the Unbox lock');
  // The value span must not use Tailwind `truncate` (ellipsis from the wrong end).
  assert.doesNotMatch(
    html,
    /class="[^"]*\btruncate\b[^"]*w-\[8\.25ch\]|class="[^"]*w-\[8\.25ch\][^"]*\btruncate\b/,
    'truncate + last8 lock reintroduces Arrival mid–last-8 ellipsis',
  );
  assert.match(html, /whitespace-nowrap/);
  assert.doesNotMatch(html, /<svg/, 'tracking last-8 has no MapPin');
});

test('TrackingChip never paints the leading digits of a long tracking', () => {
  const html = renderToStaticMarkup(<TrackingChip value={LONG_TRACKING} />);
  assert.doesNotMatch(html, />1Z999AA1</);
  assert.match(html, new RegExp(`>${LONG_TRACKING.slice(-8)}<`));
});
