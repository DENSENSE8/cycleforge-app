/**
 * Unit tests for station scan-type Auto + Esc release.
 *   node --import tsx --test src/components/station/scan-bar/scan-mode.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { nextArmedMode, shouldHandleScanModeEsc } from './scan-mode';

test('nextArmedMode: Auto always releases to null', () => {
  assert.equal(nextArmedMode('ticket', 'auto'), null);
  assert.equal(nextArmedMode(null, 'auto'), null);
});

test('nextArmedMode: click a type arms it; click the armed type releases to Auto', () => {
  assert.equal(nextArmedMode(null, 'tracking'), 'tracking');
  assert.equal(nextArmedMode('ticket', 'tracking'), 'tracking');
  assert.equal(nextArmedMode('tracking', 'tracking'), null);
});

test('shouldHandleScanModeEsc: only when focused, armed, and no overlay/rebind', () => {
  const base = {
    key: 'Escape',
    armed: true,
    overlayOpen: false,
    capturing: false,
    scanInputFocused: true,
  };
  assert.equal(shouldHandleScanModeEsc(base), true);
  assert.equal(shouldHandleScanModeEsc({ ...base, armed: false }), false);
  assert.equal(shouldHandleScanModeEsc({ ...base, overlayOpen: true }), false);
  assert.equal(shouldHandleScanModeEsc({ ...base, capturing: true }), false);
  assert.equal(shouldHandleScanModeEsc({ ...base, scanInputFocused: false }), false);
  assert.equal(shouldHandleScanModeEsc({ ...base, key: 'Enter' }), false);
});
