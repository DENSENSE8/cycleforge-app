import test from 'node:test';
import assert from 'node:assert/strict';
import { navIconStrokeClass, NAV_ICON_MODE_STROKE_CLASS, NAV_ICON_PAGE_STROKE_CLASS } from '@/components/icons/nav-weight';

test('navIconStrokeClass applies page vs mode stroke tokens', () => {
  assert.match(navIconStrokeClass('mode'), /stroke-width:2\.25/);
  assert.match(navIconStrokeClass('page'), /stroke-width:1\.5/);
  assert.match(navIconStrokeClass('mode', 'h-4 w-4'), /h-4 w-4/);
});

/**
 * Page glyphs draw at 1.5 (2026-08-02, down from 2): they render at 14px beside
 * 12–14px text, and a 2-weight stroke at that size is a heavy graphic rather
 * than chrome. Mode glyphs stay heavier — they are the whole control in the
 * GlobalHeader Mode switcher, not a label's companion — but never 2.75, which
 * muddies dense glyphs at h-4.
 */
test('page stroke is the LIGHT nav weight; mode stays heavier (never muddy 2.75)', () => {
  assert.notEqual(NAV_ICON_PAGE_STROKE_CLASS, NAV_ICON_MODE_STROKE_CLASS);
  assert.match(NAV_ICON_MODE_STROKE_CLASS, /2\.25/);
  assert.doesNotMatch(NAV_ICON_MODE_STROKE_CLASS, /2\.75/);
  assert.match(NAV_ICON_PAGE_STROKE_CLASS, /!\[stroke-width:1\.5\]/);
  // The old weight is gone, not merely joined — a stray `stroke-width:2]` here
  // would render the heavy graphic on whichever elements still matched it.
  assert.doesNotMatch(NAV_ICON_PAGE_STROKE_CLASS, /stroke-width:2\]/);
});
