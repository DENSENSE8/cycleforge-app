/** Inventory 2×1 location face — coordinate-only (no room / zone kicker / Lv). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { locationCode, rackCode } from '@/lib/barcode-routing';
import { buildFaceInfoHtml } from '@/lib/print/labelFace';
import { locationLabelToFace } from '@/lib/print/printLocationLabel';

const GLN = '0812345000009';
const BIN = { zone: 'C', aisle: 1, bay: 1, level: 1, position: 1 };
const RACK = { zone: 'C', aisle: 1, bay: 1, level: 1, position: 0 };

test('location sticker is coordinate-only: no room, no zone kicker, no level gloss', () => {
  const face = locationLabelToFace({
    segments: BIN,
    roomName: 'Zone 3 - Parts',
    gln: GLN,
  });
  const code = locationCode(BIN);
  assert.equal(face.kind, 'location');
  assert.equal(face.center, code);
  assert.equal(face.hri, undefined);
  assert.equal(face.topLeft, '');
  assert.equal(face.topRight, '');
  assert.equal(face.bottomLeft, '');
  assert.equal(face.bottomRight, '');

  const html = buildFaceInfoHtml(face);
  assert.equal(html.infoAlign, 'center');
  assert.match(html.infoHtml, /class="lcode"/);
  assert.match(html.infoHtml, new RegExp(code.replace(/-/g, '\\-')));
  assert.doesNotMatch(html.infoHtml, /Zone 3/);
  assert.doesNotMatch(html.infoHtml, /Warehouse/);
  assert.doesNotMatch(html.infoHtml, /Lv /);
  assert.doesNotMatch(html.infoHtml, /class="tr"/);
  assert.match(html.infoCss, /font-size:16px/);
});

test('rack sticker uses rack code and still omits room / kicker', () => {
  const face = locationLabelToFace({
    segments: RACK,
    roomName: 'Zone 3 - Parts',
    gln: GLN,
  });
  const code = rackCode({ zone: 'C', aisle: 1, bay: 1, level: 1 });
  assert.equal(face.center, code);
  assert.equal(face.hri, undefined);
  assert.doesNotMatch(buildFaceInfoHtml(face).infoHtml, /RACK|BIN|Lv /);
});

test('caption paints bottom-left under the code; blank caption paints nothing', () => {
  const face = locationLabelToFace({ segments: BIN, gln: GLN, caption: '  Arrival · Priority ' });
  assert.equal(face.bottomLeft, 'Arrival · Priority');
  assert.equal(face.center, locationCode(BIN));
  const html = buildFaceInfoHtml(face);
  assert.match(html.infoHtml, /<div class="lcode">[^<]+<\/div><div class="lcap">Arrival · Priority<\/div>/);
  assert.match(html.infoCss, /\.lcap:empty\{display:none\}/);

  const bare = locationLabelToFace({ segments: BIN, gln: GLN, caption: null });
  assert.equal(bare.bottomLeft, '');
  assert.match(buildFaceInfoHtml(bare).infoHtml, /<div class="lcap"><\/div>/);
});
