/**
 * Round-trip guard for printed handles: every `*Handle()` factory must scan
 * back through `routeScan()` to the right entity type. This test is the
 * standing guard for the "if I can generate it I can scan it back" invariant —
 * if someone adds a new handle prefix without a matching `routeScan` branch,
 * the `every generated handle round-trips` test fails.
 */

import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';

import {
  routeScan,
  receivingHandle,
  receivingLineHandle,
  serialUnitHandle,
  handlingUnitHandle,
  repairHandle,
  ticketHandle,
  scannedUnitKey,
  locationLabelPayload,
  type LocationSegments,
} from './barcode-routing';

test('every generated handle round-trips to its entity type (not bin/sku fallback)', () => {
  const cases: Array<[string, string]> = [
    [receivingHandle(42), 'receiving'],
    [receivingLineHandle(900), 'receiving-line'],
    [serialUnitHandle(451), 'serial-unit'],
    [handlingUnitHandle(12), 'handling-unit'],
    [repairHandle(33), 'receiving'], // repair routes via the mobile repair page
    [ticketHandle(9395), 'support-ticket'],
  ];
  for (const [payload, expectedType] of cases) {
    const r = routeScan(payload);
    ok(r, `${payload} should route`);
    strictEqual(r!.type, expectedType, `${payload} → type`);
  }
});

test('T-{id} ticket label scans to Support deep-link', () => {
  const r = routeScan(ticketHandle(9395));
  strictEqual(r!.redirect, '/support?ticket=9395');
});

test('REP-{id} repair label scans back to the working /m/rs/{id} page (not the dead /repair/{id})', () => {
  const r = routeScan(repairHandle(33));
  strictEqual(r!.redirect, '/m/rs/33');
});

test('U- unit handle resolves an ALPHANUMERIC serial (regression: used to mis-route to /inventory)', () => {
  const phys = routeScan(serialUnitHandle('CN1A2B3'));
  strictEqual(phys!.type, 'serial-unit');
  strictEqual(phys!.redirect, '/m/u/CN1A2B3', 'prefix stripped, serial preserved');

  const numeric = routeScan(serialUnitHandle('451'));
  strictEqual(numeric!.redirect, '/m/u/451');

  // U- wrapping a minted unit_uid strips the prefix so the API resolves by unit_uid.
  const uid = routeScan(serialUnitHandle('00098-2621-000142'));
  strictEqual(uid!.type, 'serial-unit');
  strictEqual(uid!.redirect, '/m/u/00098-2621-000142');
});

test('zone-letter location codes are NOT swallowed by the broadened U- handle parser', () => {
  // U-zone bin/location codes must still classify as bins (the location guard).
  strictEqual(routeScan('U-01-02-3')!.type, 'bin');
  strictEqual(routeScan('U-01-02-3-04')!.type, 'bin');
  // A plain leading-letter bin is unaffected too.
  strictEqual(routeScan('A-01-01-1')!.type, 'bin');
});

test('bare minted unit-id (no prefix) still routes to the unit page', () => {
  const r = routeScan('00098-2621-000142');
  strictEqual(r!.type, 'serial-unit');
});

// ── scannedUnitKey — the packer testing-photo scan gate ──────────────────────
// Fire the phone camera ONLY on a genuine printed unit label; extract the
// resolvable key (bare serial / minted unit_uid) for /api/serial-units/[id].

test('scannedUnitKey extracts the bare serial from a U- handle', () => {
  strictEqual(scannedUnitKey('U-SN12345'), 'SN12345');
  // The prefix-stripped handle a printed unit label carries.
  strictEqual(scannedUnitKey(serialUnitHandle('SN999')), 'SN999');
});

test('scannedUnitKey extracts the minted unit_uid from a bare minted-id label', () => {
  strictEqual(scannedUnitKey('00098-2621-000142'), '00098-2621-000142');
});

test('scannedUnitKey extracts the serial from a GS1 (01)(21) unit frame', () => {
  strictEqual(scannedUnitKey('(01)00860008260013(21)SN12345'), 'SN12345');
});

test('scannedUnitKey returns null for a non-unit-label scan (the gate)', () => {
  // A bare/partial serial the tech types at the bench must NOT trip the camera.
  strictEqual(scannedUnitKey('12345'), null);
  // A zone-letter location code is a bin, not a unit.
  strictEqual(scannedUnitKey('U-01-02-3'), null);
  // A SKU-with-colon is a SKU, not a unit.
  strictEqual(scannedUnitKey('1809:A03'), null);
  // Empty input.
  strictEqual(scannedUnitKey(''), null);
});

// ─── Location labels: the borrowed-GLN fix ──────────────────────────────────

const BIN: LocationSegments = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 1 };
const RACK: LocationSegments = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 0 };

/** GS1's documentation GLN — what every location label used to fall back to. */
const PLACEHOLDER_GLN = '0614141000005';
/** Licensed-SHAPED GLN: not a real registration, just not an example prefix. */
const LICENSED_GLN = '0812345000009';

/** The FNC1 (GS, 0x1D) byte an industrial scanner emits between AIs. */
const FNC1 = String.fromCharCode(0x1d);

test('with no GLN a location label emits the bare code, never a borrowed AI 414', () => {
  const p = locationLabelPayload(BIN);
  strictEqual(p.symbology, 'datamatrix', 'plain DataMatrix, not gs1datamatrix');
  strictEqual(p.value, 'A0101101', 'the internal code, encoded as an internal code');
  strictEqual(p.gln, null, 'the label asserts no GLN at all');
  ok(!p.value.includes('414'), 'AI 414 means GLN — never emit it without one');
});

test('the placeholder GLN is refused even when explicitly configured', () => {
  // The regression that matters: DEFAULT_GLN is gone, but an admin — or a
  // stale localStorage printer config written before this change — can still
  // hand the old value in.
  const p = locationLabelPayload(BIN, { gln: PLACEHOLDER_GLN });
  strictEqual(p.symbology, 'datamatrix');
  strictEqual(p.gln, null);
  strictEqual(p.value, 'A0101101');
});

test('a licensed GLN produces a proper GS1 location label', () => {
  const p = locationLabelPayload(BIN, { gln: LICENSED_GLN });
  strictEqual(p.symbology, 'gs1datamatrix');
  strictEqual(p.value, `(414)${LICENSED_GLN}(254)A0101101`);
  strictEqual(p.gln, LICENSED_GLN);
});

test('a malformed GLN degrades to the bare code rather than printing garbage', () => {
  for (const gln of ['', '   ', '123', 'not-a-gln', '08123450000099999']) {
    const p = locationLabelPayload(BIN, { gln });
    strictEqual(p.symbology, 'datamatrix', `"${gln}" must not produce an AI 414`);
    strictEqual(p.gln, null);
  }
});

test('both label forms scan back to the SAME destination — bin', () => {
  const bare = locationLabelPayload(BIN);
  const gs1 = locationLabelPayload(BIN, { gln: LICENSED_GLN });
  const a = routeScan(bare.value);
  const b = routeScan(gs1.value);
  strictEqual(a?.type, 'bin');
  strictEqual(a?.value, 'A0101101');
  strictEqual(a?.redirect, '/inventory?bin=A0101101');
  strictEqual(a?.redirect, b?.redirect, 'dropping the GLN must not change where a scan lands');
});

test('both label forms scan back to the SAME destination — rack (position=00)', () => {
  // The defect this closes: a bare rack code used to fall through to the
  // letter fallback, which returns NO redirect — so a rack sticker opened the
  // bin view. Rack-vs-bin is decided by the code, never by the symbology.
  const bare = locationLabelPayload(RACK);
  const gs1 = locationLabelPayload(RACK, { gln: LICENSED_GLN });
  const a = routeScan(bare.value);
  const b = routeScan(gs1.value);
  strictEqual(a?.redirect, '/warehouse?tab=racks&code=A0101100');
  strictEqual(a?.redirect, b?.redirect);
});

test('a flat code is case-normalised, like the GS1 form always was', () => {
  const r = routeScan('a0101101');
  strictEqual(r?.value, 'A0101101');
  strictEqual(r?.redirect, '/inventory?bin=A0101101');
});

test('labels ALREADY on the racks keep scanning — all three legacy forms', () => {
  // A warehouse full of stickers carries the borrowed GLN. Nothing is
  // re-printed by this change, so the parser must keep resolving them.
  strictEqual(
    routeScan(`(414)${PLACEHOLDER_GLN}(254)A0101101`)?.redirect,
    '/inventory?bin=A0101101',
  );
  strictEqual(
    routeScan(`414${PLACEHOLDER_GLN}${FNC1}254A0101100`)?.redirect,
    '/warehouse?tab=racks&code=A0101100',
  );
  strictEqual(
    routeScan(`/414/${PLACEHOLDER_GLN}/254/A0101100`)?.redirect,
    '/warehouse?tab=racks&code=A0101100',
  );
});

test('short legacy bin barcodes are untouched by the flat-code branch', () => {
  // `A12` / `B04` predate the flat code and must keep their old behaviour.
  const r = routeScan('A12');
  strictEqual(r?.type, 'bin');
  strictEqual(r?.value, 'A12');
  strictEqual(r?.redirect, undefined);
});

test('the flat-code branch does not swallow other printed handles', () => {
  strictEqual(routeScan('R-1234')?.type, 'receiving');
  strictEqual(routeScan('U-CN1A2B3')?.type, 'serial-unit');
  strictEqual(routeScan('H-12')?.type, 'handling-unit');
  strictEqual(routeScan('T-9395')?.type, 'support-ticket');
  strictEqual(routeScan('IPH13-128-BLU-2601-000042')?.type, 'serial-unit');
});
