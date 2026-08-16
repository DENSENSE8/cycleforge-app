/**
 * Unit tests for the shared PIN numpad theme (SetPinPad + StaffPinPad).
 *
 * Run: `node --test --import tsx src/components/auth/theme-numpad.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { stationThemeColors } from '../../utils/staff-colors';
import { THEME_NUMPAD, numpadTheme } from './theme-numpad';

const FACE_KEYS = [
  'primaryBg',
  'primaryHover',
  'dotActive',
  'accentText',
  'haloFrom',
  'passkeyHover',
  'ring',
] as const;

describe('THEME_NUMPAD', () => {
  test('covers every StationTheme from staff-colors', () => {
    const staffThemes = Object.keys(stationThemeColors).sort();
    const numpadThemes = Object.keys(THEME_NUMPAD).sort();
    assert.deepEqual(numpadThemes, staffThemes);
  });

  test('every face has the numpad slots (not a chrome token fork)', () => {
    for (const theme of Object.keys(THEME_NUMPAD) as Array<keyof typeof THEME_NUMPAD>) {
      const face = numpadTheme(theme);
      for (const key of FACE_KEYS) {
        assert.equal(typeof face[key], 'string', `${theme}.${key}`);
        assert.ok(face[key].length > 0, `${theme}.${key} empty`);
      }
    }
  });

  test('green identity hue is emerald (shipped map, not a local twin)', () => {
    assert.equal(numpadTheme('green').primaryBg, 'bg-emerald-600');
    assert.equal(numpadTheme('green').dotActive, 'bg-emerald-600');
  });

  test('black identity hue is slate (ds-allow-raw-neutral vocabulary)', () => {
    assert.equal(numpadTheme('black').primaryBg, 'bg-slate-900');
    assert.equal(numpadTheme('black').accentText, 'text-text-default');
  });
});
