/**
 * Signature GEOMETRY — one law for the pad that captures the ink and the band
 * that prints it. Pure; no React, no DOM, no canvas.
 *
 * ## The defect this module exists to kill
 *
 * Operator 2026-09-15: *"the customer will sign their signature with their
 * finger and they will move the signature up to the most above the second half
 * of the signature and then it will display off the page when printed out. It
 * should be half height and so it has a more centered more width than
 * height."*
 *
 * Both ends of the pipe were wrong, and each one alone hid the other:
 *
 * 1. **Capture.** `SignaturePad` held a fixed 200px-tall canvas inside the
 *    512px form measure (≈2.5:1) and `signature_pad.toDataURL()` exports the
 *    WHOLE canvas, empty regions included. A finger signature that landed in
 *    the upper half shipped a PNG that was half dead pixels.
 * 2. **Print.** The paperwork draws that PNG at `height:90px;max-width:100%;
 *    object-fit:contain`, anchored `bottom:2px` against the ruled line. The
 *    box fits (contain never overflows) but the INK inside it floats: a 2.5:1
 *    capture is height-limited in a ≈4.7:1 band, so it is scaled to 45% and
 *    the strokes ride ~45px above the line they were supposed to sit on.
 *
 * So the print CSS is right and stays untouched (`object-fit:contain` +
 * `max-width:100%` is the defensive half). Two things change on the capture
 * side, and this module is the single source for both:
 *
 * - {@link SIGNATURE_CAPTURE_ASPECT} holds the pad WIDER THAN TALL at the
 *   band's own aspect, so ink maps into the band at ~1:1 instead of 45%, and
 *   there is no tall dead half to float in.
 * - {@link signatureInkBox} crops the export to the ink itself, so *wherever*
 *   on the pad the customer signed, the strokes print seated on the line. This
 *   is what makes the acceptance ("a stroke drawn near the TOP of the pad
 *   prints inside the signature band") true rather than merely likelier.
 *
 * Existing rows are untouched — an old, tall PNG still `contain`s into the
 * band, it just keeps its old floating look. No migration, no backfill.
 *
 * Callers: `src/components/ui/SignaturePad.tsx` (capture),
 * `src/lib/repair/repair-paper-html.ts` (print band),
 * `src/components/ui/SignaturePad.tsx` (capture surface classes).
 * Affected API: none. Schemas: none (the stored `signatureDataUrl` gets
 * tighter, not differently shaped).
 */

/**
 * The printed signature band on `/api/repair-service/print/[id]` — drop-off
 * and pick-up rows both. `bandWidthPx` is the measured middle grid track of
 * {@link REPAIR_SIGNATURE_ROW_GRID_STYLE} on a letter page (≈7.5in of content
 * minus the 5.75rem label track, the 11rem date track and two 1rem gaps).
 * It is a MEASUREMENT, not a knob: changing it does not move the paper.
 */
export const REPAIR_PRINT_SIGNATURE_BAND = {
  /** Row height of the ruled line the signature sits on. */
  lineHeightPx: 96,
  /** Height the `<img>` is drawn at inside that row. */
  inkHeightPx: 90,
  /** Measured width of the band on paper. */
  bandWidthPx: 420,
} as const;

/**
 * Width ÷ height the capture pad is held at, everywhere it is mounted.
 *
 * 5 rather than the band's own ≈4.67 so the capture is always the WIDER of the
 * two: `object-fit: contain` then fits by WIDTH, the printed box spans the full
 * band, and the scale factor stays near 1. One aspect for both `variant`s —
 * the staff pad and the drop-off pad print through the same 90px band, so a
 * second height would be a second law for one piece of paper.
 */
export const SIGNATURE_CAPTURE_ASPECT = 5;

/** Capture box and ruled guide shared by every repair signature surface. */
export const REPAIR_SIGNATURE_PAD_CLASS = 'aspect-[5/1] w-full max-h-full';
export const REPAIR_SIGNATURE_GUIDE_CLASS =
  'pointer-events-none absolute inset-x-6 bottom-[18%] border-b-2 border-dashed border-border-soft';

/**
 * Guards on the cropped export.
 *
 * `padPx` is slack around the point hull: `signature_pad` interpolates Bezier
 * curves between points and draws them up to `maxWidth` thick, so a tight hull
 * shaves the stroke caps.
 *
 * The aspect clamp is a CONSUMER guard, not taste. Not every surface that
 * renders this PNG constrains both axes — `/api/walk-in/receipt/[id]` sets
 * `.sig-img { height: 48px }` and no `max-width` — so an un-clamped crop of a
 * horizontal dash (200:1) would print a 9600px-wide image across the receipt.
 * The clamp grows the crop toward the canvas edges; it never crops ink.
 */
export const SIGNATURE_EXPORT_CROP = {
  /** CSS px of slack around the ink so stroke caps survive the crop. */
  padPx: 6,
  /** Narrowest allowed export, W÷H — a single vertical stroke is squared up. */
  minAspect: 1,
  /** Widest allowed export, W÷H — bounded by the canvas (see the docblock). */
  maxAspect: 6,
} as const;

export interface SignatureBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The shape of one `signature_pad` stroke group, structurally. */
export interface SignatureStrokeGroup {
  points: readonly { x: number; y: number }[];
}

export interface SignatureCanvasSize {
  /** CSS width of the canvas — NOT `canvas.width`, which carries the DPR. */
  width: number;
  /** CSS height of the canvas. */
  height: number;
}

/** Grow `size` toward `target` around its own centre, clipped to `[0, limit]`. */
function growCentred(
  start: number,
  size: number,
  target: number,
  limit: number,
): { start: number; size: number } {
  if (!(target > size)) return { start, size };
  const want = Math.min(target, limit);
  const centre = start + size / 2;
  let next = centre - want / 2;
  if (next < 0) next = 0;
  if (next + want > limit) next = limit - want;
  return { start: next, size: want };
}

/**
 * The region of the canvas the export should keep: the ink's own bounds,
 * padded, aspect-clamped and clipped to the canvas. `null` when there is no
 * ink (the caller then has nothing to export).
 *
 * Coordinates are CSS px, matching `signature_pad`'s point space — the caller
 * multiplies by `devicePixelRatio` to address the backing store.
 *
 * The aspect clamp is best-effort by construction: it may only grow the box,
 * and it may not grow past the canvas, so a canvas that is itself wider than
 * `maxAspect` cannot produce a compliant crop. That is deliberate — shrinking
 * to hit a ratio would mean cutting the customer's signature.
 */
export function signatureInkBox(
  groups: readonly SignatureStrokeGroup[],
  canvas: SignatureCanvasSize,
): SignatureBox | null {
  if (!(canvas.width > 0) || !(canvas.height > 0)) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const group of groups) {
    for (const point of group.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const { padPx, minAspect, maxAspect } = SIGNATURE_EXPORT_CROP;
  let x = Math.max(0, minX - padPx);
  let y = Math.max(0, minY - padPx);
  let width = Math.min(canvas.width, maxX + padPx) - x;
  let height = Math.min(canvas.height, maxY + padPx) - y;
  width = Math.max(1, width);
  height = Math.max(1, height);

  const aspect = width / height;
  if (aspect > maxAspect) {
    const grown = growCentred(y, height, width / maxAspect, canvas.height);
    y = grown.start;
    height = grown.size;
  } else if (aspect < minAspect) {
    const grown = growCentred(x, width, height * minAspect, canvas.width);
    x = grown.start;
    width = grown.size;
  }

  return { x, y, width, height };
}

/**
 * `object-fit: contain` — the rendered size of `src` inside `box`.
 *
 * Here to make the print side measurable in a unit test: the whole defect was
 * a capture aspect that made this fit HEIGHT-limited (letterboxed, ink scaled
 * to 45%) where the fixed geometry makes it WIDTH-limited.
 */
export function containBox(
  src: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number } {
  if (!(src.width > 0) || !(src.height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(box.width / src.width, box.height / src.height);
  return { width: src.width * scale, height: src.height * scale };
}

/** How the printed band consumes a capture of this size. */
export function printedSignatureFit(src: { width: number; height: number }): {
  width: number;
  height: number;
  /** Fraction of the band's width the ink image actually covers. */
  bandWidthUsed: number;
  /** `contain` was limited by width (good) or by height (letterboxed). */
  limitedBy: 'width' | 'height';
} {
  const band = {
    width: REPAIR_PRINT_SIGNATURE_BAND.bandWidthPx,
    height: REPAIR_PRINT_SIGNATURE_BAND.inkHeightPx,
  };
  const fit = containBox(src, band);
  return {
    ...fit,
    bandWidthUsed: band.width > 0 ? fit.width / band.width : 0,
    limitedBy:
      src.width / src.height >= band.width / band.height ? 'width' : 'height',
  };
}
