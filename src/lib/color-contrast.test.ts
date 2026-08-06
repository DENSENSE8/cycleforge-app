/**
 * WCAG contrast SoT — luminance, ink pick, platform paint kit.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INK_DARK,
  INK_LIGHT,
  contrastRatio,
  inkForBackground,
  normalizeHex,
  parseHex,
  platformPaintFromHex,
  relativeLuminance,
} from './color-contrast';

describe('color-contrast', () => {
  it('parseHex / normalizeHex accept #RRGGBB and lowercase', () => {
    assert.deepEqual(parseHex('#FF9900'), { r: 255, g: 153, b: 0 });
    assert.equal(normalizeHex('#FF9900'), '#ff9900');
    assert.equal(normalizeHex('not-a-color'), null);
    assert.equal(parseHex('#fff'), null);
  });

  it('relativeLuminance: black ≈ 0, white ≈ 1, mid yellow is bright', () => {
    assert.ok((relativeLuminance('#000000') ?? 1) < 0.01);
    assert.ok((relativeLuminance('#ffffff') ?? 0) > 0.99);
    const yellow = relativeLuminance('#ffff00');
    assert.ok(yellow != null && yellow > 0.8);
  });

  it('contrastRatio: black/white is 21', () => {
    const r = contrastRatio('#000000', '#ffffff');
    assert.ok(r != null);
    assert.ok(Math.abs(r - 21) < 0.01);
  });

  it('inkForBackground: dark fills get white ink; light fills get dark ink', () => {
    assert.equal(inkForBackground('#351C15'), INK_LIGHT); // UPS brown
    assert.equal(inkForBackground('#4D148C'), INK_LIGHT); // FedEx purple
    assert.equal(inkForBackground('#ffff00'), INK_DARK); // pure yellow
    assert.equal(inkForBackground('#FFCC00'), INK_DARK); // DHL yellow
    assert.equal(inkForBackground('#ffffff'), INK_DARK);
    assert.equal(inkForBackground('#0f172a'), INK_LIGHT);
  });

  it('platformPaintFromHex returns kit with AA soft ink; invalid → null', () => {
    assert.equal(platformPaintFromHex('nope'), null);

    const yellow = platformPaintFromHex('#FFFF00');
    assert.ok(yellow);
    assert.equal(yellow.accent, '#ffff00');
    assert.equal(yellow.ink, INK_DARK);
    assert.ok((contrastRatio(yellow.softFill, yellow.softInk) ?? 0) >= 4.5);

    const navy = platformPaintFromHex('#1e3a8a');
    assert.ok(navy);
    assert.equal(navy.ink, INK_LIGHT);
    assert.ok((contrastRatio(navy.softFill, navy.softInk) ?? 0) >= 4.5);

    const orange = platformPaintFromHex('#FF9900');
    assert.ok(orange);
    assert.ok((contrastRatio(orange.accent, orange.ink) ?? 0) >= 4.5);
  });
});
