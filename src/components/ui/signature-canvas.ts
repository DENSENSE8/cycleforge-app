/** Canvas plumbing for {@link SignaturePad} — DPR scaling and the cropped export. */

import { signatureInkBox, type SignatureStrokeGroup } from '@/lib/repair/signature-geometry';

/**
 * Scale a canvas for Retina/HiDPI displays so strokes are crisp on iPad.
 * Sets the internal resolution to match devicePixelRatio while keeping the CSS
 * display size at the container's dimensions.
 */
export function scaleSignatureCanvas(canvas: HTMLCanvasElement): void {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(ratio, ratio);
}

/**
 * PNG of the INK, not of the canvas.
 * was anchored to (operator 2026-09-15). Cropping to the ink is what makes the
 */
export function exportSignaturePng(
  canvas: HTMLCanvasElement,
  groups: readonly SignatureStrokeGroup[],
  whole: () => string,
): string {
  const box = signatureInkBox(groups, {
    width: canvas.offsetWidth,
    height: canvas.offsetHeight,
  });
  if (!box) return whole();

  // The backing store carries devicePixelRatio (see `scaleSignatureCanvas`);
  // the box is in CSS px, the space `signature_pad` reports points in.
  const ratio = canvas.offsetWidth > 0 ? canvas.width / canvas.offsetWidth : 1;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.width * ratio));
  out.height = Math.max(1, Math.round(box.height * ratio));
  const ctx = out.getContext('2d');
  if (!ctx) return whole();

  ctx.drawImage(
    canvas,
    box.x * ratio,
    box.y * ratio,
    box.width * ratio,
    box.height * ratio,
    0,
    0,
    out.width,
    out.height,
  );
  return out.toDataURL('image/png');
}
