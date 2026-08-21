import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASE_RADIUS,
  FALLBACK_IDLE,
  IDLE_ALPHA,
  dotAlpha,
  dotFill,
  latticeStyle,
  parseCssColor,
  type RGB,
} from './universal-loader-field';

const ACTIVE: RGB = [37, 99, 235];

describe('parseCssColor', () => {
  it('reads the hex forms our themes actually write', () => {
    assert.deepEqual(parseCssColor('#94a3b8', FALLBACK_IDLE), [148, 163, 184]);
    assert.deepEqual(parseCssColor('  #2563eb  ', FALLBACK_IDLE), [37, 99, 235]);
    assert.deepEqual(parseCssColor('#abc', FALLBACK_IDLE), [170, 187, 204]);
  });

  it('drops the alpha byte of an 8-digit hex — the field owns its own alpha', () => {
    assert.deepEqual(parseCssColor('#2563eb80', FALLBACK_IDLE), [37, 99, 235]);
  });

  it('reads rgb() / rgba() and rounds to whole channels', () => {
    assert.deepEqual(parseCssColor('rgb(1, 2, 3)', FALLBACK_IDLE), [1, 2, 3]);
    assert.deepEqual(parseCssColor('rgba(10, 20, 30, 0.5)', FALLBACK_IDLE), [10, 20, 30]);
    assert.deepEqual(parseCssColor('rgb(1.4 2.6 3.5)', FALLBACK_IDLE), [1, 3, 4]);
  });

  it('falls back rather than painting NaN when the var is unresolvable', () => {
    // An unset custom property resolves to the empty string, not to a color.
    assert.deepEqual(parseCssColor('', FALLBACK_IDLE), FALLBACK_IDLE);
    assert.deepEqual(parseCssColor('#12345', FALLBACK_IDLE), FALLBACK_IDLE);
    assert.deepEqual(parseCssColor('#zzzzzz', FALLBACK_IDLE), FALLBACK_IDLE);
    assert.deepEqual(parseCssColor('transparent', FALLBACK_IDLE), FALLBACK_IDLE);
  });
});

describe('dot alpha + fill', () => {
  it('idle dots are NOT the near-invisible 0.2 this pattern usually ships', () => {
    // Regression pin: at 0.2 against the canvas plane the field measured blank.
    assert.ok(IDLE_ALPHA >= 0.4, 'idle dots must read against surface-canvas');
    assert.equal(dotAlpha(0), IDLE_ALPHA);
    assert.equal(dotAlpha(1), 1);
  });

  it('blends idle → active across the intensity range', () => {
    // Derived from IDLE_ALPHA, not a copy of it: this pins the SHAPE (idle is
    // pure idle-colour at idle alpha, full intensity is pure active at 1), so
    // retuning the field's density or opacity does not fail a colour test.
    assert.equal(dotFill(FALLBACK_IDLE, ACTIVE, 0), `rgba(148, 163, 184, ${IDLE_ALPHA})`);
    assert.equal(dotFill(FALLBACK_IDLE, ACTIVE, 1), 'rgba(37, 99, 235, 1)');
    // Halfway sits between the two, and never leaves 8-bit range.
    const mid = dotFill(FALLBACK_IDLE, ACTIVE, 0.5);
    const [r, g, b] = mid.match(/\d+/g)!.slice(0, 3).map(Number);
    assert.ok(r > 37 && r < 148, `red between endpoints, got ${r}`);
    assert.ok(g > 99 && g < 163, `green between endpoints, got ${g}`);
    assert.ok(b > 184 && b < 235, `blue between endpoints, got ${b}`);
  });
});

describe('latticeStyle', () => {
  it('draws the pre-hydration field from the theme token, never a literal', () => {
    const style = latticeStyle(24);
    assert.match(style.backgroundImage, /var\(--ds-color-text-faint\)/);
    assert.doesNotMatch(style.backgroundImage, /#[0-9a-f]{3,8}/i);
  });

  it('matches the canvas lattice pitch and dot radius', () => {
    const style = latticeStyle(32);
    assert.equal(style.backgroundSize, '32px 32px');
    assert.ok(
      style.backgroundImage.includes(`${BASE_RADIUS}px`),
      'CSS dot must be the same radius the canvas draws, or the handoff pops',
    );
  });
});
