import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_USE_STAFF_ACCENT,
  resolveOperatorAccentTheme,
  resolvesUseStaffAccent,
} from './operator-accent';
import { setStaffColorCache } from './staff-colors';

test('resolvesUseStaffAccent defaults to staff color ON', () => {
  assert.equal(DEFAULT_USE_STAFF_ACCENT, true);
  assert.equal(resolvesUseStaffAccent(undefined), true);
  assert.equal(resolvesUseStaffAccent(null), true);
  assert.equal(resolvesUseStaffAccent({}), true);
  assert.equal(resolvesUseStaffAccent({ useStaffAccent: null }), true);
  assert.equal(resolvesUseStaffAccent({ useStaffAccent: true }), true);
  assert.equal(resolvesUseStaffAccent({ useStaffAccent: false }), false);
});

test('resolveOperatorAccentTheme prefers staff color when toggle ON', () => {
  setStaffColorCache([{ id: 7, color_hex: '#a855f7' }]);
  assert.equal(resolveOperatorAccentTheme({}, 7), 'purple');
  assert.equal(resolveOperatorAccentTheme({ useStaffAccent: true }, 7), 'purple');
});

test('resolveOperatorAccentTheme uses accentHex when toggle OFF', () => {
  assert.equal(
    resolveOperatorAccentTheme({ useStaffAccent: false, accentHex: '#ef4444' }, 7),
    'red',
  );
});
