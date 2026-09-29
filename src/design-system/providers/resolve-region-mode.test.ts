/** The route declares the mode on every device (owner 2026-09-28, HANDOFF-remove-desk-floor.md). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRegionMode } from './resolve-region-mode';

test('triage paints triage on a triage route and off the registry — no device collapse', () => {
  assert.equal(resolveRegionMode('triage', 'triage'), 'triage');
  assert.equal(resolveRegionMode('triage', null), 'triage');
});

test('a triage region on an industrial route takes the route mode; a form region keeps triage', () => {
  assert.equal(resolveRegionMode('triage', 'industrial'), 'industrial');
  assert.equal(resolveRegionMode('triage', 'industrial', { form: true }), 'triage');
});

test('an explicit industrial region is never lifted to triage (Mode C hardware mirror)', () => {
  assert.equal(resolveRegionMode('industrial', 'triage'), 'industrial');
  assert.equal(resolveRegionMode('industrial', null), 'industrial');
});

test('counter and assistant keep their own identity on every route', () => {
  for (const routeMode of ['triage', 'industrial', null] as const) {
    assert.equal(resolveRegionMode('counter', routeMode), 'counter');
    assert.equal(resolveRegionMode('assistant', routeMode), 'assistant');
  }
});
