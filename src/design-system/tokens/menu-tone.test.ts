import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MENU_ITEM_TONE_CLASS } from './menu-tone';

test('menu tones use theme pill fills, never a hex or rose literal', () => {
  const joined = Object.values(MENU_ITEM_TONE_CLASS).join(' ');
  assert.match(joined, /text-text-success/);
  assert.match(joined, /bg-surface-success/);
  assert.match(joined, /ring-border-success/);
  assert.match(joined, /text-text-warning/);
  assert.match(joined, /bg-surface-warning/);
  assert.match(joined, /ring-border-warning/);
  assert.match(joined, /text-text-danger/);
  assert.match(joined, /bg-surface-danger/);
  assert.match(joined, /ring-border-danger/);
  assert.match(joined, /text-text-accent/);
  assert.match(joined, /hover:bg-surface-accent/);
  assert.match(MENU_ITEM_TONE_CLASS.success, /hover:text-text-success/);
  assert.doesNotMatch(MENU_ITEM_TONE_CLASS.default, /(?:^|\s)bg-surface-/);
  assert.doesNotMatch(MENU_ITEM_TONE_CLASS.accent, /(?:^|\s)bg-surface-/);
  assert.doesNotMatch(joined, /#[0-9a-fA-F]{3,8}|rose-\d+|emerald-\d+/);
});
