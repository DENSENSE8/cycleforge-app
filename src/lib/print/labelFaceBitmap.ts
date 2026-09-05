/**
 * Raster a {@link LabelFaceModel} to raw thermal bytes so Print buttons can
 * send a real WebUSB / Web Serial job instead of only `window.print()`.
 */

import bwipjs from 'bwip-js/browser';
import type { LabelLanguage, PaperSize, PrinterProfile } from '@/lib/print/browserPrint';
import {
  packMonochromeBitmap,
  wrapTsplBitmapJob,
  wrapZplGraphicJob,
} from '@/lib/print/labelCommands';
import type { LabelFaceModel } from '@/lib/print/labelFace';

export type PrintLabelRawSource = {
  face?: LabelFaceModel;
  name?: string;
  hri?: string;
  dataMatrix: LabelFaceModel['matrix'];
};

const DPI = 203;
const LABEL_FACE_FONT_SIZE = Math.round((9 * DPI) / 96);

export function printLabelOptionsToFace(opts: PrintLabelRawSource): LabelFaceModel {
  if (opts.face) return opts.face;
  return {
    kind: 'receiving',
    topLeft: (opts.name ?? '').trim(),
    topRight: '',
    center: (opts.hri ?? opts.dataMatrix.value).trim(),
    bottomLeft: '',
    bottomRight: '',
    matrix: opts.dataMatrix,
    hri: opts.hri,
  };
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  weight = 700,
): void {
  if (!text) return;
  let size = initialSize;
  do {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth || size <= 8) break;
    size -= 1;
  } while (size > 8);
  context.fillText(text, x, y);
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

function rasterFace(
  face: LabelFaceModel,
  size: PaperSize,
): { width: number; height: number; tspl: Uint8Array; zplPacked: Uint8Array } {
  if (typeof document === 'undefined') {
    throw new Error('Bitmap label rendering requires a browser document');
  }
  const heightIn = size.heightIn > 0 ? size.heightIn : 1;
  const width = Math.round(size.widthIn * DPI);
  const height = Math.round(heightIn * DPI);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create label bitmap canvas');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000';
  context.textBaseline = 'top';

  const padding = 10;
  const matrixSize = Math.min(height - 32, 164);
  const matrixX = width - matrixSize - padding;
  const infoWidth = matrixX - padding - 8;

  if (face.kind === 'product') {
    const titleLines = wrapLines(face.topLeft, 28, 2);
    let y = 8;
    for (const line of titleLines) {
      drawFittedText(context, line, padding, y, infoWidth, LABEL_FACE_FONT_SIZE, 700);
      y += 22;
    }
    drawFittedText(
      context,
      face.bottomLeft,
      padding,
      height - 31,
      Math.floor(infoWidth * 0.58),
      LABEL_FACE_FONT_SIZE,
      900,
    );
    context.textAlign = 'right';
    drawFittedText(
      context,
      face.bottomRight,
      matrixX - 8,
      height - 31,
      Math.floor(infoWidth * 0.42),
      LABEL_FACE_FONT_SIZE,
      900,
    );
    context.textAlign = 'left';
  } else {
    drawFittedText(context, face.topLeft, padding, 8, infoWidth - 76, LABEL_FACE_FONT_SIZE, 700);
    context.textAlign = 'right';
    drawFittedText(context, face.topRight, matrixX - 8, 8, 76, LABEL_FACE_FONT_SIZE, 700);
    context.textAlign = 'left';
    let noteY = 51;
    for (const line of wrapLines(face.center, 22, 3)) {
      drawFittedText(context, line, padding, noteY, infoWidth, Math.round((7.5 * DPI) / 96), 600);
      noteY += 22;
    }
    drawFittedText(
      context,
      face.bottomLeft,
      padding,
      height - 31,
      Math.floor(infoWidth * 0.58),
      LABEL_FACE_FONT_SIZE,
      900,
    );
    context.textAlign = 'right';
    drawFittedText(
      context,
      face.bottomRight,
      matrixX - 8,
      height - 31,
      Math.floor(infoWidth * 0.42),
      LABEL_FACE_FONT_SIZE,
      900,
    );
    context.textAlign = 'left';
  }

  const data = face.matrix.value;
  if (data) {
    const matrix = document.createElement('canvas');
    bwipjs.toCanvas(matrix, {
      bcid: face.matrix.symbology === 'gs1datamatrix' ? 'gs1datamatrix' : 'datamatrix',
      text: data,
      scale: face.matrix.scale ?? 4,
      includetext: false,
      paddingwidth: 2,
      paddingheight: 2,
      backgroundcolor: 'FFFFFF',
      barcolor: '000000',
    });
    context.imageSmoothingEnabled = false;
    context.drawImage(matrix, matrixX, 7, matrixSize, matrixSize);
    const hri = (face.hri ?? '').trim();
    if (hri) {
      context.textAlign = 'center';
      drawFittedText(
        context,
        hri,
        matrixX + matrixSize / 2,
        height - 24,
        matrixSize,
        LABEL_FACE_FONT_SIZE,
        800,
      );
      context.textAlign = 'left';
    }
  }

  const rotated = document.createElement('canvas');
  rotated.width = width;
  rotated.height = height;
  const rotatedContext = rotated.getContext('2d', { alpha: false });
  if (!rotatedContext) throw new Error('Unable to rotate label bitmap');
  rotatedContext.fillStyle = '#fff';
  rotatedContext.fillRect(0, 0, width, height);
  rotatedContext.translate(width, height);
  rotatedContext.rotate(Math.PI);
  rotatedContext.drawImage(canvas, 0, 0);

  const image = rotatedContext.getImageData(0, 0, width, height);
  return {
    width,
    height,
    tspl: packMonochromeBitmap(image.data, width, height, true),
    zplPacked: packMonochromeBitmap(image.data, width, height, false),
  };
}

function wrapEscPosRaster(bitmap: Uint8Array, width: number, height: number, copies: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const header = new Uint8Array([
    0x1b,
    0x40,
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);
  const feed = new TextEncoder().encode('\n\n\n');
  const parts = [header, bitmap, feed];
  const n = Math.max(1, copies);
  const once = parts.reduce((len, p) => len + p.length, 0);
  const out = new Uint8Array(once * n);
  let offset = 0;
  for (let c = 0; c < n; c += 1) {
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
  }
  return out;
}

export function buildPrintLabelRawCommands(
  opts: PrintLabelRawSource,
  profile: PrinterProfile,
  paper: PaperSize,
): string | Uint8Array {
  const face = printLabelOptionsToFace(opts);
  const raster = rasterFace(face, paper);
  const copies = profile.copies ?? 1;
  const language: LabelLanguage = profile.language;
  if (language === 'zpl') {
    return wrapZplGraphicJob(raster.zplPacked, raster.width, raster.height, copies);
  }
  if (language === 'escpos') {
    return wrapEscPosRaster(raster.zplPacked, raster.width, raster.height, copies);
  }
  if (language === 'none') {
    return '';
  }
  return wrapTsplBitmapJob(raster.tspl, raster.width, raster.height, paper, copies);
}
