/**
 * Barcodes off a label that has no text layer. Most UPS labels on file
 * (ShipStation `ups_walleted`, 2026-10-03: 54 of 100) are one embedded raster
 * with no text at all; the 1Z tracking number is still printed as Code 128.
 * This decodes the raster pdf.js already unpacked — no canvas, no OCR, pure
 * JS — so it runs inside the upload route on any host.
 *
 * Thermal labels print the barcodes across the 4×6 stock, so each image is
 * read upright and turned a quarter, in overlapping horizontal bands (one
 * Code 128 per band; a label carries the routing barcode and the tracking
 * barcode stacked).
 */

import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';

/** pdf.js `ImageKind`: 1 = 1-bit grayscale, 2 = RGB, 3 = RGBA. */
export interface LabelRaster {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Below this a raster is a logo or a glyph, not a label. */
const MIN_LABEL_EDGE = 300;

function luminance(raster: LabelRaster): Uint8ClampedArray | null {
  const { width, height, kind, data } = raster;
  const out = new Uint8ClampedArray(width * height);
  if (kind === 1) {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) out[y * width + x] = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1 ? 255 : 0;
    }
    return out;
  }
  const step = kind === 3 ? 4 : kind === 2 ? 3 : 0;
  if (!step || data.length < width * height * step) return null;
  for (let p = 0, q = 0; p < width * height; p += 1, q += step) out[p] = (data[q]! * 299 + data[q + 1]! * 587 + data[q + 2]! * 114) / 1000;
  return out;
}

/** Every Code 128 / PDF417 / Data Matrix value readable on the raster, de-duplicated, in read order. */
export function decodeLabelRaster(raster: LabelRaster): string[] {
  if (Math.min(raster.width, raster.height) < MIN_LABEL_EDGE) return [];
  const lum = luminance(raster);
  if (!lum) return [];
  const { width, height } = raster;
  const turned = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) turned[(width - 1 - x) * height + y] = lum[y * width + x]!;
  }
  const reader = new MultiFormatReader();
  reader.setHints(new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.PDF_417, BarcodeFormat.DATA_MATRIX]],
  ]));
  const values = new Set<string>();
  for (const [pixels, w, h] of [[lum, width, height], [turned, height, width]] as const) {
    const source = new RGBLuminanceSource(pixels, w, h);
    const band = Math.max(40, Math.floor(h / 8));
    for (let top = 0; top + 20 <= h; top += Math.floor(band / 2)) {
      try {
        values.add(reader.decode(new BinaryBitmap(new HybridBinarizer(source.crop(0, top, w, Math.min(band, h - top))))).getText());
      } catch {
        // NotFoundException: no barcode in this band.
      }
    }
  }
  return [...values];
}
