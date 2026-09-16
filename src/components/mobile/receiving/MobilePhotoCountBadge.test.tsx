/**
 * MobilePhotoCountBadge contracts — the compact xN photo count.
 *
 *   npx tsx --test src/components/mobile/receiving/MobilePhotoCountBadge.test.tsx
 *
 * The load-bearing rule: **x0 is never a door.** A gallery link or button for
 * a count of zero sends a thumb to an empty screen, so plain ink is the only
 * render at x0 regardless of which interactive props were supplied. Negative
 * counts clamp — a transient −1 from a failed decrement must not paint "x-1".
 */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobilePhotoCountBadge } from '@/components/mobile/receiving/MobilePhotoCountBadge';

test('x0 is plain faint ink — never a link or button, even when both are offered', () => {
  const html = renderToStaticMarkup(
    <MobilePhotoCountBadge count={0} href="/m/r/9/photos" onClick={() => undefined} />,
  );
  assert.match(html, />x0</);
  assert.match(html, /text-text-faint/);
  assert.match(html, /aria-label="Photos 0"/);
  assert.doesNotMatch(html, /<a[\s>]/, 'x0 must not link to an empty gallery');
  assert.doesNotMatch(html, /<button[\s>]/, 'x0 must not be a button');
});

test('xN with href links to the gallery and speaks its count', () => {
  const html = renderToStaticMarkup(<MobilePhotoCountBadge count={3} href="/m/r/9/photos" />);
  assert.match(html, /<a[\s>]/);
  assert.match(html, /href="\/m\/r\/9\/photos"/);
  assert.match(html, />x3</);
  assert.match(html, /aria-label="Photos 3"/);
  assert.match(html, /text-text-muted/);
});

test('xN without href falls back to a button when onClick is supplied', () => {
  const html = renderToStaticMarkup(<MobilePhotoCountBadge count={2} onClick={() => undefined} />);
  assert.match(html, /<button[\s>]/);
  assert.doesNotMatch(html, /<a[\s>]/);
  assert.match(html, /aria-label="Photos 2"/);
});

test('negative counts clamp to x0 — a transient −1 never paints', () => {
  const html = renderToStaticMarkup(<MobilePhotoCountBadge count={-5} />);
  assert.match(html, />x0</);
  assert.match(html, /aria-label="Photos 0"/);
  assert.doesNotMatch(html, /x-5/);
});

test('figures are tabular so x9 → x10 does not jitter the row', () => {
  const html = renderToStaticMarkup(<MobilePhotoCountBadge count={10} />);
  assert.match(html, /tabular-nums/);
});

test('size faces: sm is the caption rung, md the sheet-header rung', () => {
  assert.match(renderToStaticMarkup(<MobilePhotoCountBadge count={1} />), /text-role-caption/);
  assert.match(renderToStaticMarkup(<MobilePhotoCountBadge count={1} size="md" />), /text-sm/);
});
