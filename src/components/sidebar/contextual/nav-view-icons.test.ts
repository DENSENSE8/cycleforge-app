import assert from 'node:assert/strict';
import test from 'node:test';
import { NAV_VIEW_ICONS } from './nav-view-icons';

test('Deliveries lifecycle switchers use distinct semantic colors', () => {
  const tones = [
    NAV_VIEW_ICONS['incoming.pipeline']?.tone,
    NAV_VIEW_ICONS['incoming.docked']?.tone,
    NAV_VIEW_ICONS['incoming.unboxed']?.tone,
  ];

  assert.ok(tones.every(Boolean));
  assert.equal(new Set(tones).size, tones.length);
});
