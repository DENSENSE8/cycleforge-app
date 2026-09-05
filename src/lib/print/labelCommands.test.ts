import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReceivingLabelPayload } from '@/lib/print/printReceivingLabel';
import { resolvePaperSize } from '@/lib/print/browserPrint';
import {
  buildReceivingLabelCommands,
  packMonochromeBitmap,
  wrapTsplBitmapJob,
  wrapZplGraphicJob,
} from '@/lib/print/labelCommands';

const payload: ReceivingLabelPayload = {
  receivingId: 1234,
  scanValue: 'PO-987654',
  platform: 'eBay',
  notes: 'Silent print geometry',
  conditionCode: 'NEW',
  receivingType: 'PO',
  date: '06/15/26',
};

test('TSPL receiving labels use exact 2x1 geometry at 203 DPI', () => {
  const commands = buildReceivingLabelCommands(payload, 'tspl', resolvePaperSize('2x1'));

  assert.match(commands, /^SIZE 50\.8 mm,25\.4 mm\r\n/);
  assert.match(commands, /\r\nGAP 3\.0 mm,0 mm\r\n/);
  assert.match(commands, /\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\n/);
  assert.match(commands, /\r\nDMATRIX 225,10,171,171,"R-1234"\r\n/);
  assert.match(commands, /\r\nPRINT 1,1\r\n$/);
  assert.equal(commands.includes('\n') && !commands.includes('\r\n'), false);
});

test('monochrome bitmap packing uses the CX418 inverse raster polarity', () => {
  const rgba = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
    0, 0, 0, 255,
  ]);

  assert.deepEqual([...packMonochromeBitmap(rgba, 8, 1)], [0x5e]);
});

test('TSPL BITMAP wrapper frames a real print job', () => {
  const size = resolvePaperSize('2x1');
  const bitmap = new Uint8Array([0xaa, 0x55]);
  const job = wrapTsplBitmapJob(bitmap, 16, 1, size, 2);
  const text = new TextDecoder().decode(job);
  assert.match(text, /^SIZE 50\.8 mm,25\.4 mm\r\n/);
  assert.match(text, /BITMAP 0,0,2,1,1,/);
  assert.match(text, /\r\nPRINT 2,1\r\n$/);
  assert.equal(job[job.length - bitmap.length - '\r\nPRINT 2,1\r\n'.length], bitmap[0]);
});

test('ZPL graphic wrapper is a sendable ^XA job', () => {
  const zpl = wrapZplGraphicJob(new Uint8Array([0x0f]), 8, 1, 1);
  assert.match(zpl, /^\^XA\r\n/);
  assert.match(zpl, /\^GFA,1,1,1,0f/);
  assert.match(zpl, /\^PQ1\r\n\^XZ$/);
});
