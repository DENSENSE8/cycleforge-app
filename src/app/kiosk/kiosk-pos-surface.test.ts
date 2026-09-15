/**
 * The kiosk POS surface is TOKEN-LEVEL, and this pins the two ways that can
 * quietly stop being true.
 *
 * 1. The responsive literals in `KIOSK_POS_AT_MD` mirror token roles that a
 *    theme is allowed to move. They cannot be composed (`md:${cornerClass(…)}`
 *    is invisible to Tailwind's scanner), so they are hand-written — which
 *    means a theme moving `surface` or the elevation ladder would leave the
 *    `md:` variant pointing at a class that no longer exists, and the tablet
 *    measure would silently lose its corner or its lift. Each literal is
 *    asserted to be exactly `md:` + the role it mirrors.
 *
 * 2. Every depth/corner decision resolves through a ROLE, never a raw value,
 *    so `ds_tokens` can see it. Same posture as `tokens/table-surface.test.ts`,
 *    which asserts the surface composes `ELEVATION_CLASS.raised.default`
 *    rather than regex-ing the class string for `shadow-*`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cornerClass } from '@/design-system/tokens/radius';
import { ELEVATION_CLASS, TACTILE_PRESS_TRAVEL_CLASS } from '@/design-system/tokens/shadows';
import {
  KIOSK_POS_ACTION_BAR,
  KIOSK_POS_AT_MD,
  KIOSK_POS_BROWSE_SCROLL,
  KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE,
  KIOSK_POS_CANVAS,
  KIOSK_POS_CARD,
  KIOSK_POS_CARD_SELECTED_FRAME,
  KIOSK_POS_CTA,
  KIOSK_POS_GRID,
  KIOSK_POS_TRAIL_CONTROL,
  KIOSK_POS_TRAIL_ICON,
} from './kiosk-pos-surface';

test('each md: literal is exactly the md variant of the role it mirrors', () => {
  // If a theme moves `surface` off rounded-xl, or the ladder renames a rung,
  // this fails here instead of at the breakpoint in a customer's face.
  assert.equal(KIOSK_POS_AT_MD.cornerSurface, `md:${cornerClass('surface')}`);
  assert.equal(KIOSK_POS_AT_MD.elevSoft, `md:${ELEVATION_CLASS.raised.soft}`);
  assert.equal(KIOSK_POS_AT_MD.elevRaisedHover, `md:hover:${ELEVATION_CLASS.raised.default}`);
});

test('the card composes the corner and elevation ROLES, not raw values', () => {
  assert.ok(KIOSK_POS_CARD.includes(KIOSK_POS_AT_MD.cornerSurface));
  assert.ok(KIOSK_POS_CARD.includes(KIOSK_POS_AT_MD.elevSoft));
  assert.ok(KIOSK_POS_CARD.includes(KIOSK_POS_AT_MD.elevRaisedHover));
});

test('the selection frame shares the card corner at BOTH measures', () => {
  // A rounded frame inside a square phone cell floats off the corners; a square
  // frame inside a rounded tablet card gets clipped. One role, both measures.
  assert.ok(KIOSK_POS_CARD_SELECTED_FRAME.includes(cornerClass('flush')));
  assert.ok(KIOSK_POS_CARD_SELECTED_FRAME.includes(KIOSK_POS_AT_MD.cornerSurface));
});

test('the ground is the ONE SoT background at every measure', () => {
  // Operator 2026-09-14: the white under the product display is the
  // design-system surface token — no page-local hex beside the fixed-width
  // intake forms. The former `md:bg-[#FAFAFA]` ground is repealed; the
  // phone-measure depth rules below still hold.
  assert.equal(KIOSK_POS_CANVAS, 'bg-surface-card');
  assert.ok(KIOSK_POS_GRID.includes('gap-0'));
  assert.ok(KIOSK_POS_GRID.includes('md:gap-3'));
  // No ungated corner or lift may reach the phone.
  assert.ok(!KIOSK_POS_CARD.split(' ').includes(cornerClass('surface')));
  assert.ok(!KIOSK_POS_CARD.split(' ').includes(ELEVATION_CLASS.raised.soft));
});

test('the CTA casts nothing and presses by travel alone', () => {
  // Operator ruling: no drop shadow under Continue. Over a transparent dock a
  // hard lip falls across the product grid and reads as a smear, not as the
  // control's own thickness. `shadow-none` is stated, not merely omitted,
  // because Button's variant classes may carry one.
  assert.ok(KIOSK_POS_CTA.split(' ').includes('shadow-none'));
  assert.ok(!/shadow-elev/.test(KIOSK_POS_CTA));
  // Travel survives — it needs no ground to read against.
  assert.ok(KIOSK_POS_CTA.split(' ').includes(TACTILE_PRESS_TRAVEL_CLASS));
  // A shrink and a drop are two motions for one press.
  assert.ok(KIOSK_POS_CTA.includes('enabled:active:scale-100'));
});

test('the CTA is full-width on a phone and capped from md up', () => {
  // At 390px the viewport IS the measure: a cap only shrinks the thumb target.
  assert.ok(KIOSK_POS_CTA.split(' ').includes('w-full'));
  assert.ok(KIOSK_POS_CTA.includes('md:max-w-sm'));
  assert.ok(!KIOSK_POS_CTA.split(' ').includes('max-w-sm'));
});

test('the action bar paints no ground at all and lets the catalog through', () => {
  // Operator ruling: no ground under Continue, of any colour. A fill plus a
  // rule is a second sheet — the eye reads a tray with a button on it. Ported
  // from components/mobile/print/MobilePrintWorkspace.tsx:512.
  assert.ok(KIOSK_POS_ACTION_BAR.includes('bg-transparent'));
  assert.ok(!KIOSK_POS_ACTION_BAR.includes('bg-surface-card'));
  assert.ok(!KIOSK_POS_ACTION_BAR.includes('bg-surface-canvas'));
  // A hairline is the other half of reading as a separate sheet.
  assert.ok(!KIOSK_POS_ACTION_BAR.includes('border-t'));
  // The strip floats over the scroll region; only the key may be hit.
  assert.ok(KIOSK_POS_ACTION_BAR.includes('pointer-events-none'));
  assert.ok(KIOSK_POS_ACTION_BAR.includes('absolute'));
  assert.ok(KIOSK_POS_CTA.includes('pointer-events-auto'));
});

test('a floating key reserves scroll clearance so the last row is reachable', () => {
  // Without this the final grid row parks under the key and cannot be read or
  // tapped — the whole point of floating the dock instead of banding it.
  assert.ok(KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE.startsWith('pb-'));
  // And it must NOT be baked into the scroll region: a permanent reserve would
  // leave dead space at the foot of every browse with nothing to continue to.
  assert.ok(!KIOSK_POS_BROWSE_SCROLL.includes(KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE));
});
test('word chips and glyph chips share ONE container treatment and ONE size', () => {
  // Operator rulings: "must all have the same consistent look" (outline) and
  // "the same size as well for the drop downs and the icons". An outlined
  // 36px word chip beside an outlined 28px glyph still reads as two systems.
  // Radius, border, fill AND height must be identical; only horizontal
  // padding (px-3 vs the glyph's fixed w-9) may differ.
  for (const part of [
    'rounded-full',
    'border',
    'border-border-soft',
    'bg-surface-card',
    'h-9',
  ]) {
    assert.ok(KIOSK_POS_TRAIL_CONTROL.split(' ').includes(part), `control missing ${part}`);
    assert.ok(KIOSK_POS_TRAIL_ICON.split(' ').includes(part), `icon missing ${part}`);
  }
  assert.ok(KIOSK_POS_TRAIL_ICON.split(' ').includes('w-9'));
});
