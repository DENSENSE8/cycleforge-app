/**
 * Signature GEOMETRY — one law for the pad that captures the ink and the band that prints it.
 * Operator 2026-09-15: *"the customer will sign their signature with their
 */

/** The printed signature band on `/api/repair-service/print/[id]` — drop-off and pick-up rows both. */
export const REPAIR_PRINT_SIGNATURE_BAND = {
  /** Row height of the ruled line the signature sits on. */
  lineHeightPx: 96,
  /** Height the `<img>` is drawn at inside that row. */
  inkHeightPx: 90,
  /** Measured width of the band on paper. */
  bandWidthPx: 420,
} as const;

/** Width ÷ height the capture pad is held at, everywhere it is mounted. */
export const SIGNATURE_CAPTURE_ASPECT = 5;

/** Capture box and ruled guide shared by every repair signature surface. */
export const REPAIR_SIGNATURE_PAD_CLASS = 'aspect-[5/1] w-full max-h-full';
export const REPAIR_SIGNATURE_GUIDE_CLASS =
  'pointer-events-none absolute inset-x-6 bottom-[18%] border-b-2 border-dashed border-border-soft';

/** Guards on the cropped export. */
export const SIGNATURE_EXPORT_CROP = {
  /** CSS px of slack around the ink so stroke caps survive the crop. */
  padPx: 6,
  /** Narrowest allowed export, W÷H — a single vertical stroke is squared up. */
  minAspect: 1,
  /** Widest allowed export, W÷H — bounded by the canvas (see the docblock). */
  maxAspect: 6,
} as const;

interface SignatureBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The shape of one `signature_pad` stroke group, structurally. */
export interface SignatureStrokeGroup {
  points: readonly { x: number; y: number }[];
}

interface SignatureCanvasSize {
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

/** The region of the canvas the export should keep: */
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

/** `object-fit: contain` — the rendered size of `src` inside `box`. */
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
