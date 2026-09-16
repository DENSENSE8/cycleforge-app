/**
 * MobileAccountFooter contracts — the nav's bottom bar.
 *
 *   npx tsx --test src/components/mobile/redesign/MobileAccountFooter.test.tsx
 *
 * Operator law (2026-09-14, three passes): staff colour + initials bubble with
 * the name, held by a CONTENT INSET (px-3 on the inner wrapper) — while the
 * BUTTON itself stays edge-to-edge (px-0: full-bleed tap + hover fill). No
 * hairline: separation is a drop shadow. Tapping anywhere on the row opens
 * /m/settings. The bubble is never a photo.
 */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileAccountFooter } from '@/components/mobile/redesign/MobileAccountFooter';
import { staffInitials } from '@/design-system/components/StaffBadge';

const NAME = 'Dana Quarry';

const render = () => renderToStaticMarkup(<MobileAccountFooter displayName={NAME} />);

test('the bar shows the staff name and is the door to settings', () => {
  const html = render();
  assert.match(html, />Dana Quarry</);
  assert.match(html, /href="\/m\/settings"/);
  assert.match(html, /aria-label="Settings, signed in as Dana Quarry"/);
});

test('colour + initials bubble sits at the far left of the inset — never a photo', () => {
  const html = render();
  assert.match(html, new RegExp(`>${staffInitials(NAME)}<`), 'the bubble carries the initials');
  assert.doesNotMatch(html, /<img[\s>]/, 'avatarPhotoId={null} — colour + initials only');
});

test('no hairline: the bar separates by shadow token, never a border rule', () => {
  const html = render();
  assert.match(html, /shadow-elev-soft/, 'the sanctioned soft drop shadow');
  assert.doesNotMatch(html, /border-t\b/);
  assert.doesNotMatch(html, /border-border-soft/);
  assert.doesNotMatch(html, /border-border-hairline/);
});

test('button edge-to-edge, content inset: px-0 on the anchor, px-3 on the wrapper', () => {
  const html = render();
  const anchor = (html.match(/<a\b[^>]*>/) ?? [])[0] ?? '';
  assert.match(anchor, /px-0/, 'the interactive box is full-bleed');
  assert.doesNotMatch(anchor, /px-[1-9]/, 'no horizontal padding on the button itself');
  assert.match(html, /class="[^"]*\bpx-3\b/, 'the content inset lives on the inner wrapper');
  assert.doesNotMatch(html, /\bp-3\b/, 'the footer itself carries no padding');
});

test('the row keeps a touch floor — min-h-11, never a sliver target', () => {
  assert.match(render(), /min-h-11/);
});

test('renders nothing when no staff identity exists', () => {
  // No provider → default auth context → no user → the footer is absent.
  assert.equal(renderToStaticMarkup(<MobileAccountFooter />), '');
});
