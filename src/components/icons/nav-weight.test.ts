import test from 'node:test';
import assert from 'node:assert/strict';
import { navIconStrokeClass, NAV_ICON_MODE_STROKE_CLASS, NAV_ICON_PAGE_STROKE_CLASS } from '@/components/icons/nav-weight';

test('navIconStrokeClass applies page vs mode stroke tokens', () => {
  assert.match(navIconStrokeClass('mode'), /stroke-width:2\.25/);
  assert.match(navIconStrokeClass('page'), /stroke-width:2/);
  assert.match(navIconStrokeClass('mode', 'h-4 w-4'), /h-4 w-4/);
});

test('mode stroke is slightly heavier than page stroke (not muddy 2.75)', () => {
  assert.notEqual(NAV_ICON_PAGE_STROKE_CLASS, NAV_ICON_MODE_STROKE_CLASS);
  assert.match(NAV_ICON_MODE_STROKE_CLASS, /2\.25/);
  assert.doesNotMatch(NAV_ICON_MODE_STROKE_CLASS, /2\.75/);
  assert.match(NAV_ICON_PAGE_STROKE_CLASS, /stroke-width:2\]/);
});
