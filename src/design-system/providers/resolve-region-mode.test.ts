/** Industrial on phones, triage on desktop — BRIEF §12 (owner 2026-09-26). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { modeDeviceOf, resolveRegionMode } from './resolve-region-mode';

test('a /m/* route or a touch pointer is the phone; a fine pointer off /m is the desk', () => {
  assert.equal(modeDeviceOf('/m', false), 'phone');
  assert.equal(modeDeviceOf('/m/pick', false), 'phone');
  assert.equal(modeDeviceOf('/shipping/orders', true), 'phone');
  assert.equal(modeDeviceOf('/shipping/orders', false), 'desktop');
  // `/media` is not the handheld tree.
  assert.equal(modeDeviceOf('/media', false), 'desktop');
  assert.equal(modeDeviceOf(null, false), 'desktop');
});

test('triage paints triage on the desk and industrial on the phone', () => {
  assert.equal(resolveRegionMode('triage', 'desktop'), 'triage');
  assert.equal(resolveRegionMode('triage', 'phone'), 'industrial');
});

test('a form region keeps triage on the phone; an operation still collapses', () => {
  assert.equal(resolveRegionMode('triage', 'phone', { form: true }), 'triage');
  assert.equal(resolveRegionMode('triage', 'phone', { form: false }), 'industrial');
});

test('an explicit industrial region is never lifted to triage (Mode C hardware mirror)', () => {
  assert.equal(resolveRegionMode('industrial', 'desktop'), 'industrial');
  assert.equal(resolveRegionMode('industrial', 'phone'), 'industrial');
});

test('counter and assistant keep their own identity on every device', () => {
  for (const device of ['desktop', 'phone'] as const) {
    assert.equal(resolveRegionMode('counter', device), 'counter');
    assert.equal(resolveRegionMode('assistant', device), 'assistant');
  }
});
