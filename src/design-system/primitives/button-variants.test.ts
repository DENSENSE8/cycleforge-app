/**
 * Drives the shipped Button variant map (Phase 2a).
 *
 * Imports the isolated fill map — not a reimplementation — so a missing
 * `success` / `execute` intent fails here the same way a chrome CTA would
 * fail at the call site.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUTTON_VARIANTS } from './button-variants';

describe('Button semantic intents (2a)', () => {
  it('success and execute exist as Button variants', () => {
    assert.ok('success' in BUTTON_VARIANTS, 'success (Add) must be a Button variant');
    assert.ok('execute' in BUTTON_VARIANTS, 'execute (Check) must be a Button variant');
  });

  it('success is the emerald Add fill; execute is the shared Check face', () => {
    assert.match(BUTTON_VARIANTS.success, /bg-emerald-600/);
    assert.match(BUTTON_VARIANTS.success, /hover:bg-emerald-500/);
    assert.match(BUTTON_VARIANTS.execute, /bg-surface-card/);
    assert.match(BUTTON_VARIANTS.execute, /ring-1 ring-border-soft/);
  });

  it('every variant is a non-empty class string', () => {
    for (const [name, classes] of Object.entries(BUTTON_VARIANTS)) {
      assert.ok(typeof classes === 'string' && classes.length > 8, `${name} fill is empty`);
    }
  });
});
