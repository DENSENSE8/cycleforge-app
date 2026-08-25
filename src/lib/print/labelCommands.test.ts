import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReceivingLabelPayload } from '@/lib/print/printReceivingLabel';
import { resolvePaperSize } from '@/lib/print/browserPrint';
import {
  buildReceivingLabelCommands,
  packMonochromeBitmap,
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

/**
 * The note rows of a TSPL job, in order. Notes start at y=50; the platform row
 * shares the same x and font but sits at y=10.
 */
function tsplNoteRows(commands: string): string[] {
  return [...commands.matchAll(/TEXT 10,(\d+),"2",0,1,1,"([^"]*)"/g)]
    .filter((m) => Number(m[1]) >= 50)
    .map((m) => m[2]!);
}

test('TSPL note rows fit the 12-dot firmware font, not a 22-character guess', () => {
  const commands = buildReceivingLabelCommands(
    {
      ...payload,
      notes: 'Cracked bezel and a missing charger plus a swollen battery cell',
    },
    'tspl',
    resolvePaperSize('2x1'),
  );

  // 2"x1" at 203 DPI leaves 207 dots between the padding and the DataMatrix.
  // Font "2" is 12 dots per cell, so 17 fit — the old flat 22 was 264 dots.
  const rows = tsplNoteRows(commands);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok([...row].length <= 17, `note row "${row}" is ${[...row].length} cells`);
  }
});

test('a spaceless CJK note breaks across rows instead of running off the label', () => {
  const commands = buildReceivingLabelCommands(
    { ...payload, notes: '联想笔记本电脑全新未拆封含原装电源适配器与保修卡' },
    'tspl',
    resolvePaperSize('2x1'),
  );

  const rows = tsplNoteRows(commands);
  assert.ok(rows.length > 1, 'CJK note must occupy more than one row');
  for (const row of rows) assert.ok([...row].length <= 17);
});

test('an over-long note is marked as cut, in ASCII the CODEPAGE 1252 stream can carry', () => {
  const commands = buildReceivingLabelCommands(
    {
      ...payload,
      notes:
        'Cracked bezel, missing charger, swollen battery, screen burn-in, sold as-is for parts, do not restock',
    },
    'tspl',
    resolvePaperSize('2x1'),
  );

  const rows = tsplNoteRows(commands);
  assert.equal(rows.length, 3, 'notes are capped at three rows');
  assert.ok(rows[2]!.endsWith('...'), 'the last row says the text was cut');
  assert.ok(!commands.includes('…'), 'no U+2026 in a UTF-8-encoded 1252 stream');
});
