/** Row → face classification for {@link printLocationRowLabels}. Run: npx tsx --test src/lib/print/printLocationRows.test.ts */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaceInfoHtml, type LabelFaceModel } from '@/lib/print/labelFace';
import { locationLabelToFace } from '@/lib/print/printLocationLabel';
import {
  groupRackCodesByRack,
  locationLabelPrintSummary,
  locationRowSegments,
  planLocationRowFaces,
  rackLabelToFace,
  type PrintableLocationRow,
} from '@/lib/print/printLocationRows';

const IDENTITY = { gln: '', orgSlug: null };
/** A licensed GLN (same fixture as rack-code.test.ts). */
const GLN = '0850012345671';
const ROOM = 'Back Room';

function row(over: Partial<PrintableLocationRow>): PrintableLocationRow {
  return { id: 1, name: 'x', barcode: null, roomName: null, ...over };
}

test('locationRowSegments reads flat and dashed rack barcodes, not free-form ones', () => {
  assert.deepEqual(locationRowSegments({ barcode: 'C0306401' }), { zone: 'C', aisle: 3, bay: 6, level: 4, position: 1 });
  assert.deepEqual(locationRowSegments({ barcode: 'D-03-04-2-00' }), { zone: 'D', aisle: 3, bay: 4, level: 2, position: 0 });
  assert.equal(locationRowSegments({ barcode: 'QA-SHELF-A01' }), null);
  assert.equal(locationRowSegments({ barcode: null }), null);
});

test('structured rows get the location face; a label carries no caption', () => {
  const plan = planLocationRowFaces(
    [
      row({ id: 1, barcode: 'C0306401' }),
      row({ id: 2, barcode: 'A0101100' }),
    ],
    IDENTITY,
  );
  assert.equal(plan.structured, 2);
  assert.equal(plan.flat, 0);
  assert.equal(plan.skipped, 0);
  const [bin, rackLevel] = plan.faces;
  assert.equal(bin!.kind, 'location');
  assert.equal(bin!.center, 'C-03-06-4-01');
  assert.equal(bin!.bottomLeft, '');
  assert.equal(rackLevel!.kind, 'location');
  assert.equal(rackLevel!.center, 'A-01-01-1');
  assert.equal(rackLevel!.bottomLeft, '');
  assert.equal(buildFaceInfoHtml(rackLevel!).infoHtml, '<div class="lcode">A-01-01-1</div>');
});

test('free-form rows get the flat location face (LOCATION kicker, never urgency); no barcode is skipped', () => {
  const plan = planLocationRowFaces(
    [
      row({ id: 3, name: 'QA Triage Shelf A-01', barcode: 'QA-SHELF-A01', roomName: 'Receiving' }),
      row({ id: 4, name: 'Door shelf', barcode: 'DOOR-1' }),
      row({ id: 5, name: 'Unboxing Area', barcode: null }),
      row({ id: 6, name: 'C-01-01-1-01', barcode: '  ' }),
    ],
    IDENTITY,
  );
  assert.equal(plan.structured, 0);
  assert.equal(plan.flat, 2);
  assert.equal(plan.skipped, 2);
  const [plain, door] = plan.faces;
  assert.equal(plain!.kind, 'receiving');
  assert.equal(plain!.matrix.value, 'QA-SHELF-A01');
  assert.equal(plain!.topLeft, 'LOCATION');
  assert.equal(plain!.center, 'QA Triage Shelf A-01');
  assert.equal(plain!.bottomLeft, 'Receiving');
  assert.equal(door!.matrix.value, 'DOOR-1');
  assert.equal(door!.topLeft, 'LOCATION');
  assert.doesNotMatch(faceText(door!), /ARRIVAL|Arrival/);
});

test('faces keep input order across families', () => {
  const plan = planLocationRowFaces(
    [
      row({ id: 1, barcode: 'A0101101' }),
      row({ id: 2, barcode: 'DOOR-1' }),
      row({ id: 3, barcode: 'A0101102' }),
    ],
    IDENTITY,
  );
  assert.deepEqual(plan.faces.map((f) => f.matrix.value.length > 0 && f.kind), ['location', 'receiving', 'location']);
});

test('locationLabelPrintSummary says what printed, on which channel, and what was skipped', () => {
  assert.equal(
    locationLabelPrintSummary({ rack: 0, structured: 2, flat: 1, skipped: 0, transport: 'usb', rackCodes: [] }),
    'Sent 3 location labels to the label printer',
  );
  assert.equal(
    locationLabelPrintSummary({ rack: 0, structured: 1, flat: 0, skipped: 1, transport: 'iframe', rackCodes: [] }),
    'Opened 1 location label in the print dialog · 1 location skipped (no code to print)',
  );
  assert.equal(
    locationLabelPrintSummary({ rack: 0, structured: 0, flat: 0, skipped: 3, transport: 'skipped', rackCodes: [] }),
    'Nothing was printed · 3 locations skipped (no code to print)',
  );
  assert.equal(
    locationLabelPrintSummary({
      rack: 3,
      structured: 1,
      flat: 0,
      skipped: 0,
      transport: 'usb',
      rackCodes: ['RK12', 'RK12-3', 'RK12-4'],
    }),
    'Sent 3 rack labels and 1 location label to the label printer',
  );
});

/** Every text slot a face paints — the room must appear in none of them. */
function faceText(face: LabelFaceModel): string {
  return [face.topLeft, face.topRight, face.center, face.bottomLeft, face.bottomRight, face.hri ?? '', buildFaceInfoHtml(face).infoHtml].join('\n');
}

test('rack row → placard face: large RACK headline, matrix, no room text', () => {
  const plan = planLocationRowFaces(
    [row({ id: 1, name: 'Rack 12', barcode: 'RK12', roomName: ROOM })],
    IDENTITY,
  );
  assert.equal(plan.rack, 1);
  assert.equal(plan.structured, 0);
  assert.equal(plan.flat, 0);
  assert.deepEqual(plan.rackCodes, ['RK12']);
  const [placard] = plan.faces;
  assert.equal(placard!.kind, 'rack');
  assert.equal(placard!.center, 'RACK 12');
  assert.equal(placard!.topLeft, '');
  assert.equal(placard!.bottomLeft, '');
  assert.equal(placard!.hri, 'RK12');
  assert.deepEqual(placard!.matrix, { value: 'RK12', symbology: 'datamatrix', scale: 4 });
  const { infoHtml, infoCss } = buildFaceInfoHtml(placard!);
  assert.match(infoHtml, /class="rkick"><\/div><div class="rhead">RACK 12</);
  // An empty parent line steps the headline up to placard size.
  assert.match(infoCss, /\.rkick:empty\+\.rhead\{font-size:24px\}/);
  assert.doesNotMatch(faceText(placard!), /Back Room/);
});

test('shelf row → RACK 12 · SHELF 3 face; no caption', () => {
  const plan = planLocationRowFaces(
    [
      row({ id: 2, name: 'Rack 12 Shelf 3', barcode: 'RK12-3', roomName: ROOM }),
      row({ id: 3, name: 'Rack 12 Shelf 4', barcode: 'RK12-4', roomName: ROOM }),
    ],
    IDENTITY,
  );
  assert.equal(plan.rack, 2);
  const [three, four] = plan.faces;
  assert.equal(three!.kind, 'rack');
  assert.equal(three!.topLeft, 'RACK 12');
  assert.equal(three!.center, 'SHELF 3');
  assert.equal(three!.bottomLeft, '');
  assert.equal(buildFaceInfoHtml(three!).infoHtml, '<div class="rkick">RACK 12</div><div class="rhead">SHELF 3</div>');
  assert.equal(four!.topLeft, 'RACK 12');
  assert.equal(four!.center, 'SHELF 4');
  assert.equal(four!.bottomLeft, '');
  for (const face of plan.faces) assert.doesNotMatch(faceText(face), /Back Room/);
});

test('position row → POS face under its rack and shelf', () => {
  const face = rackLabelToFace({ address: { rack: 12, shelf: 3, position: 2 }, gln: '' });
  assert.equal(face.topLeft, 'RACK 12 · SHELF 3');
  assert.equal(face.center, 'POS 2');
  assert.equal(face.matrix.value, 'RK12-3-2');
});

test('rack payload: GS1 (414)<GLN>(254)<code> with a licensed GLN, bare code without', () => {
  const rows = [row({ id: 1, barcode: 'RK12' }), row({ id: 2, barcode: 'RK12-3' })];
  const bare = planLocationRowFaces(rows, IDENTITY);
  assert.deepEqual(bare.faces.map((f) => [f.matrix.value, f.matrix.symbology]), [
    ['RK12', 'datamatrix'],
    ['RK12-3', 'datamatrix'],
  ]);
  const unlicensed = planLocationRowFaces(rows, { gln: '1234567890123', orgSlug: 'acme' });
  assert.deepEqual(unlicensed.faces.map((f) => f.matrix.value), ['RK12', 'RK12-3']);
  const gs1 = planLocationRowFaces(rows, { gln: GLN, orgSlug: 'acme' });
  assert.deepEqual(gs1.faces.map((f) => [f.matrix.value, f.matrix.symbology]), [
    [`(414)${GLN}(254)RK12`, 'gs1datamatrix'],
    [`(414)${GLN}(254)RK12-3`, 'gs1datamatrix'],
  ]);
  // The HRI stays the typeable code on every rung.
  assert.deepEqual(gs1.faces.map((f) => f.hri), ['RK12', 'RK12-3']);
});

test('rack barcodes in any printed spelling resolve to the canonical face', () => {
  const plan = planLocationRowFaces(
    [row({ id: 1, barcode: 'rk0012-03' }), row({ id: 2, barcode: `(414)${GLN}(254)RK12-4` })],
    IDENTITY,
  );
  assert.equal(plan.rack, 2);
  assert.deepEqual(plan.rackCodes, ['RK12-3', 'RK12-4']);
  assert.deepEqual(plan.faces.map((f) => f.center), ['SHELF 3', 'SHELF 4']);
});

test('mixed rack + room-coded + flat rows plan in input order; room-coded faces unchanged', () => {
  const roomRow = row({ id: 2, barcode: 'C0306401', roomName: ROOM });
  const plan = planLocationRowFaces(
    [
      row({ id: 1, barcode: 'RK12' }),
      roomRow,
      row({ id: 3, barcode: 'DOOR-1' }),
      row({ id: 4, barcode: 'RK12-3' }),
      row({ id: 5, barcode: null }),
    ],
    { gln: GLN, orgSlug: null },
  );
  assert.deepEqual(
    { rack: plan.rack, structured: plan.structured, flat: plan.flat, skipped: plan.skipped },
    { rack: 2, structured: 1, flat: 1, skipped: 1 },
  );
  assert.deepEqual(plan.faces.map((f) => f.kind), ['rack', 'location', 'receiving', 'rack']);
  assert.deepEqual(plan.rackCodes, ['RK12', 'RK12-3']);
  assert.equal(plan.faces[3]!.bottomLeft, '');
  // The room-coded face is exactly what the room-coded builder produces alone.
  const expected = locationLabelToFace({
    segments: locationRowSegments(roomRow)!,
    roomName: ROOM,
    gln: GLN,
    orgSlug: null,
  });
  assert.deepEqual(plan.faces[1], expected);
  assert.deepEqual(planLocationRowFaces([roomRow], { gln: GLN, orgSlug: null }).faces[0], expected);
  assert.deepEqual(buildFaceInfoHtml(plan.faces[1]!), buildFaceInfoHtml(expected));
});

test('groupRackCodesByRack files every code under its rack, first-seen order, no repeats', () => {
  assert.deepEqual(
    [...groupRackCodesByRack(['RK12', 'RK12-3', 'RK7-1', 'RK12-3-2', 'RK12-3', 'NOT-A-RACK'])],
    [
      ['RK12', ['RK12', 'RK12-3', 'RK12-3-2']],
      ['RK7', ['RK7-1']],
    ],
  );
});
