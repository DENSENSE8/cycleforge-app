import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseColors } from '@/design-system/tokens/colors';
import {
  BASE_RADIUS,
  IDLE_ALPHA,
  PASTEL_PALETTE,
  dotAlpha,
  dotFill,
  latticeStyle,
  pastelFor,
} from './universal-loader-field';

describe('the pastel palette', () => {
  it('is built from base tokens, never from literals', () => {
    // Pin the token PATH, not the hex: re-tuning `baseColors.blue[300]` should
    // move the field with it rather than fail this test.
    const hex = (c: readonly [number, number, number]) =>
      `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    const blue = PASTEL_PALETTE.find((s) => s.name === 'blue')!;
    assert.equal(hex(blue.idle), baseColors.blue[300]);
    assert.equal(hex(blue.active), baseColors.blue[500]);
  });

  it('every stop deepens within its OWN family', () => {
    // A cross-family blend drags a green dot through grey on its way to blue.
    for (const stop of PASTEL_PALETTE) {
      const lift = stop.idle.map((c, i) => stop.active[i] - c);
      assert.ok(
        lift.some((d) => d !== 0),
        `${stop.name}: active must differ from idle`,
      );
      const family = (baseColors as Record<string, Record<number, string>>)[stop.name];
      assert.ok(family, `${stop.name} must name a real base scale`);
    }
  });

  it('has enough hues to read as a mix, not a two-tone', () => {
    assert.ok(PASTEL_PALETTE.length >= 4);
    assert.equal(new Set(PASTEL_PALETTE.map((s) => s.name)).size, PASTEL_PALETTE.length);
  });
});

describe('pastelFor', () => {
  it('does not colour by (col + row) — that is the sweep axis', () => {
    // The front is the line x+y. Colouring by the same sum would make every
    // instant of the wave one solid hue and stripe the resting field.
    const onOneDiagonal = new Set<string>();
    for (let col = 0; col <= 8; col += 1) onOneDiagonal.add(pastelFor(col, 8 - col).name);
    assert.ok(
      onOneDiagonal.size > 1,
      `one diagonal must carry several hues, got ${[...onOneDiagonal]}`,
    );
  });

  it('is deterministic and total over the grid', () => {
    assert.equal(pastelFor(3, 5), pastelFor(3, 5));
    for (let col = 0; col < 20; col += 1) {
      for (let row = 0; row < 20; row += 1) {
        assert.ok(PASTEL_PALETTE.includes(pastelFor(col, row)));
      }
    }
  });
});

describe('dot alpha + fill', () => {
  it('idle dots are NOT the near-invisible 0.2 this pattern usually ships', () => {
    assert.ok(IDLE_ALPHA >= 0.4, 'idle dots must read against the white plane');
    assert.equal(dotAlpha(0), IDLE_ALPHA);
    assert.equal(dotAlpha(1), 1);
  });

  it('rests on the pastel and peaks on its deeper sibling', () => {
    const stop = PASTEL_PALETTE[0];
    const [r0, g0, b0] = stop.idle;
    const [r1, g1, b1] = stop.active;
    assert.equal(dotFill(stop, 0), `rgba(${r0}, ${g0}, ${b0}, ${IDLE_ALPHA})`);
    assert.equal(dotFill(stop, 1), `rgba(${r1}, ${g1}, ${b1}, 1)`);
  });

  it('stays inside the two endpoints halfway through', () => {
    const stop = PASTEL_PALETTE[0];
    const mid = dotFill(stop, 0.5).match(/\d+/g)!.slice(0, 3).map(Number);
    mid.forEach((c, i) => {
      const lo = Math.min(stop.idle[i], stop.active[i]);
      const hi = Math.max(stop.idle[i], stop.active[i]);
      assert.ok(c >= lo && c <= hi, `channel ${i}: ${c} outside [${lo}, ${hi}]`);
    });
  });
});

describe('latticeStyle', () => {
  it('lands on the canvas pitch, so the handoff is a swap not a jump', () => {
    const style = latticeStyle(16);
    assert.equal(style.backgroundSize, '32px 32px');
    assert.equal(style.backgroundPosition, '0 0, 16px 0, 0 16px, 16px 16px');
    assert.equal(style.backgroundImage.split('radial-gradient').length - 1, 4);
    assert.ok(style.backgroundImage.includes(`${BASE_RADIUS}px`));
  });

  it('carries several pastels, so pre-hydration is not one flat colour', () => {
    const style = latticeStyle(16);
    const colours = new Set(style.backgroundImage.match(/rgba\([^)]+\)/g));
    assert.ok(colours.size >= 3, `expected a mix, got ${colours.size}`);
  });
});
