/**
 *   node --import tsx --test src/components/station/scan-bar/scan-type-keybinds.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWedgeBurst,
  railHint,
  resolveTypeKeybind,
  WEDGE_MAX_INTER_KEY_MS,
} from './scan-type-keybinds';

const focused = {
  fieldEmpty: true,
  scanInputFocused: true,
  overlayOpen: false,
  capturing: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  modeCount: 3,
  wedgeBurst: false,
};

test('1/2/3 arm nth type after Auto when empty', () => {
  assert.deepEqual(resolveTypeKeybind({ ...focused, key: '1' }), {
    kind: 'arm',
    index: 0,
  });
  assert.deepEqual(resolveTypeKeybind({ ...focused, key: '3' }), {
    kind: 'arm',
    index: 2,
  });
  assert.deepEqual(resolveTypeKeybind({ ...focused, key: '4' }), {
    kind: 'none',
  });
});

test('4 arms when the rail has 4 types', () => {
  assert.deepEqual(
    resolveTypeKeybind({ ...focused, modeCount: 4, key: '4' }),
    { kind: 'arm', index: 3 },
  );
});

test('0 and backtick release to Auto', () => {
  assert.deepEqual(resolveTypeKeybind({ ...focused, key: '0' }), {
    kind: 'auto',
  });
  assert.deepEqual(resolveTypeKeybind({ ...focused, key: '`' }), {
    kind: 'auto',
  });
});

test('P toggles preview only when empty', () => {
  assert.deepEqual(resolveTypeKeybind({ ...focused, key: 'p' }), {
    kind: 'toggle-stance',
  });
  assert.deepEqual(
    resolveTypeKeybind({ ...focused, fieldEmpty: false, key: 'P' }),
    { kind: 'none' },
  );
});

test('digits type normally when the field has text', () => {
  assert.deepEqual(
    resolveTypeKeybind({ ...focused, fieldEmpty: false, key: '1' }),
    { kind: 'none' },
  );
});

test('wedge burst yields — do not arm', () => {
  assert.deepEqual(
    resolveTypeKeybind({ ...focused, wedgeBurst: true, key: '1' }),
    { kind: 'none' },
  );
});

test('isWedgeBurst uses the HID inter-key window', () => {
  assert.equal(isWedgeBurst(0, 10), false);
  assert.equal(isWedgeBurst(100, 100 + WEDGE_MAX_INTER_KEY_MS), true);
  assert.equal(isWedgeBurst(100, 100 + WEDGE_MAX_INTER_KEY_MS + 1), false);
});

test('railHint names the digit range', () => {
  assert.equal(railHint(3), '1–3 type · Esc Auto · P preview');
  assert.equal(railHint(4), '1–4 type · Esc Auto · P preview');
});

test('modifiers / overlay / unfocused do not bind', () => {
  assert.equal(
    resolveTypeKeybind({ ...focused, key: '1', metaKey: true }).kind,
    'none',
  );
  assert.equal(
    resolveTypeKeybind({ ...focused, key: '1', overlayOpen: true }).kind,
    'none',
  );
  assert.equal(
    resolveTypeKeybind({ ...focused, key: '1', scanInputFocused: false }).kind,
    'none',
  );
});
