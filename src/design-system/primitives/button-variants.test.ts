/** Drives the shipped Button variant map (Phase 2a). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUTTON_VARIANTS } from './button-variants';

describe('Button semantic intents (2a)', () => {
  it('success and execute exist as Button variants', () => {
    assert.ok('success' in BUTTON_VARIANTS, 'success (Add) must be a Button variant');
    assert.ok('execute' in BUTTON_VARIANTS, 'execute (Check) must be a Button variant');
  });

  it('execute is the shared Check face', () => {
    assert.match(BUTTON_VARIANTS.execute, /bg-surface-hover/);
    assert.doesNotMatch(
      BUTTON_VARIANTS.execute,
      /ring-1/,
      'Check is flush on the chrome band — no cell hairline',
    );
  });

  it('warning is the amber recoverable intent', () => {
    // The four-tone feedback state machine (loading · success · warning ·
    // error) needs an amber CTA. Without this intent the only way to paint one
    // is a `className` hue override on <Button>, which the DS bans.
    assert.ok('warning' in BUTTON_VARIANTS, 'warning (recoverable) must be a Button variant');
  });

  it('dangerSoft is the rose outline face of danger, matching primarySoft', () => {
    assert.ok('dangerSoft' in BUTTON_VARIANTS);
    assert.match(BUTTON_VARIANTS.dangerSoft, /bg-rose-50/);
    assert.match(BUTTON_VARIANTS.dangerSoft, /text-rose-700/);
    assert.match(BUTTON_VARIANTS.dangerSoft, /ring-1/);
    assert.match(BUTTON_VARIANTS.primarySoft, /ring-1/);
  });

  it('yellow is a filled yellow pill, not amber', () => {
    assert.ok('yellow' in BUTTON_VARIANTS);
    assert.match(BUTTON_VARIANTS.yellow, /bg-yellow-400/);
    assert.doesNotMatch(BUTTON_VARIANTS.yellow, /amber/);
    assert.doesNotMatch(BUTTON_VARIANTS.yellow, /ring-1/, 'filled pill, not outline');
  });

  it('glass is white ink on a bar that owns the scrim, never a fill of its own', () => {
    // The mobile camera panel's chrome sits ON the viewfinder.
    assert.ok('glass' in BUTTON_VARIANTS, 'glass (chrome on live media) must be a Button variant');
    assert.match(BUTTON_VARIANTS.glass, /text-white/);
    assert.match(BUTTON_VARIANTS.glass, /hover:bg-glass\//, 'press feedback is a faint white wash');
    assert.doesNotMatch(
      BUTTON_VARIANTS.glass,
      /(^|\s)bg-(scrim|surface)/,
      'the bar owns the scrim — a second one is a box inside a box',
    );
  });

  it('every variant is a non-empty class string', () => {
    for (const [name, classes] of Object.entries(BUTTON_VARIANTS)) {
      assert.ok(typeof classes === 'string' && classes.length > 8, `${name} fill is empty`);
    }
  });
});
