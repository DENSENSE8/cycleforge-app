/** Signature geometry — the capture side of the printed signature band. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPAIR_PRINT_SIGNATURE_BAND,
  SIGNATURE_CAPTURE_ASPECT,
  SIGNATURE_EXPORT_CROP,
  containBox,
  printedSignatureFit,
  signatureInkBox,
  type SignatureStrokeGroup,
} from './signature-geometry';

/** The pad as it renders inside KIOSK_POS_FORM_MEASURE (max-w-lg = 512px). */
const PAD = { width: 512, height: 512 / SIGNATURE_CAPTURE_ASPECT };
/** The pad as it was before 2026-09-15 — a bare `PAD_HEIGHT = 200` literal. */
const OLD_PAD = { width: 512, height: 200 };

function stroke(points: readonly [number, number][]): SignatureStrokeGroup {
  return { points: points.map(([x, y]) => ({ x, y })) };
}

test('no ink means nothing to export', () => {
  assert.equal(signatureInkBox([], PAD), null);
  assert.equal(signatureInkBox([stroke([])], PAD), null);
  assert.equal(signatureInkBox([{ points: [{ x: NaN, y: 3 }] }], PAD), null);
});

/**
 * THE fix. A signature drawn in the top third of the pad used to export the
 * whole canvas, so two thirds of the PNG were empty and the printed ink floated
 * that same proportion above the line.
 */
test('the export is cropped to the ink, not to the canvas', () => {
  const high = signatureInkBox([stroke([[120, 8], [300, 24], [180, 30]])], PAD);
  assert.ok(high);
  // Bounds hug the strokes (plus the stroke-cap pad), and stop well short of
  // the pad floor — the dead lower band is not in the PNG at all.
  assert.equal(high.x, 120 - SIGNATURE_EXPORT_CROP.padPx);
  assert.equal(high.y, 8 - SIGNATURE_EXPORT_CROP.padPx);
  assert.equal(high.width, 300 + SIGNATURE_EXPORT_CROP.padPx - high.x);
  assert.ok(high.y + high.height < PAD.height, 'the crop still reaches the pad floor');
});

test('the crop pads the stroke caps and never leaves the canvas', () => {
  // Ink pressed into the corner: padding must clip, not go negative, or
  // drawImage reads outside the backing store and returns transparent pixels.
  const corner = signatureInkBox([stroke([[0, 0], [2, 1]])], PAD);
  assert.ok(corner);
  assert.equal(corner.x, 0);
  assert.equal(corner.y, 0);
  const edge = signatureInkBox([stroke([[PAD.width, PAD.height], [PAD.width - 2, PAD.height - 1]])], PAD);
  assert.ok(edge);
  assert.ok(edge.x + edge.width <= PAD.width);
  assert.ok(edge.y + edge.height <= PAD.height);
});

/**
 * `/api/walk-in/receipt/[id]` styles the signature `height: 48px` with NO
 * `max-width`, so the export's aspect is that receipt's layout. An un-clamped
 * crop of a horizontal dash would be ~200:1 and print 9600px wide.
 */
test('a flat dash is grown to a printable aspect instead of exported 200:1', () => {
  const dash = signatureInkBox([stroke([[40, 60], [440, 61]])], PAD);
  assert.ok(dash);
  assert.ok(
    dash.width / dash.height <= SIGNATURE_EXPORT_CROP.maxAspect,
    `dash exported at ${dash.width / dash.height}:1`,
  );
  assert.ok(dash.y >= 0 && dash.y + dash.height <= PAD.height, 'grew past the canvas');
});

test('a single vertical stroke is squared up rather than exported as a tower', () => {
  const tick = signatureInkBox([stroke([[250, 10], [252, 95]])], PAD);
  assert.ok(tick);
  assert.ok(tick.width / tick.height >= SIGNATURE_EXPORT_CROP.minAspect);
  assert.ok(tick.x >= 0 && tick.x + tick.width <= PAD.width);
});

/**
 * Why the pad aspect changed, stated as the print measurement rather than as
 * taste: the same strokes, captured on the two geometries, land in the band
 * completely differently.
 */
test('the fixed pad fills the printed band; the 200px pad letterboxed it', () => {
  const now = printedSignatureFit(PAD);
  const before = printedSignatureFit(OLD_PAD);

  assert.equal(now.limitedBy, 'width');
  assert.equal(before.limitedBy, 'height');
  assert.ok(now.bandWidthUsed >= 0.99, `only ${now.bandWidthUsed} of the band used`);
  assert.ok(before.bandWidthUsed < 0.6, 'the old capture used to fill the band');
});

test('a contained signature can never print taller than the band', () => {
  const band = REPAIR_PRINT_SIGNATURE_BAND;
  for (const src of [PAD, OLD_PAD, { width: 90, height: 90 }, { width: 600, height: 100 }]) {
    const fit = containBox(src, { width: band.bandWidthPx, height: band.inkHeightPx });
    assert.ok(fit.height <= band.inkHeightPx + 1e-9, `${src.width}x${src.height} overflows the band`);
    assert.ok(fit.width <= band.bandWidthPx + 1e-9);
  }
  assert.deepEqual(containBox({ width: 0, height: 0 }, { width: 10, height: 10 }), {
    width: 0,
    height: 0,
  });
});
