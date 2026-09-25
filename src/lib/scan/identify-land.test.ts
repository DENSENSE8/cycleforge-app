import { test } from 'node:test';
import { strictEqual } from 'node:assert';

import { routeScan } from '../barcode-routing';
import { dispatchScan, QC_SCAN_SESSION } from './dispatch-table';
import { landScanIdentify } from './identify-land';

const UPS = '1Z999AA10123454471';
const LPN = 'H-12';
const BIN_FLAT = 'A0101101';
const BIN_DASHED = 'A-01-01-1-01';
const PLACEHOLDER_GLN = '0614141000005';
const GS1_BIN = `(414)${PLACEHOLDER_GLN}(254)A0101101`;
const BIN_GUESS = 'A12';

test('never-seen tracking intakes — it does not navigate to a triage page', () => {
  const route = routeScan(UPS);
  const dispatch = dispatchScan({ scan: route!, state: { trackingSeen: false } });
  const land = landScanIdentify(dispatch, route);
  strictEqual(land.kind, 'intake');
});

test('known tracking settles on the identify surface (no door write, no /m/triage)', () => {
  const route = routeScan(UPS);
  const dispatch = dispatchScan({ scan: route!, state: { trackingSeen: true } });
  const land = landScanIdentify(dispatch, route);
  strictEqual(land.kind, 'settle');
});

test('a house licence plate identifies onto its record', () => {
  const route = routeScan(LPN);
  const dispatch = dispatchScan({ scan: route! });
  const land = landScanIdentify(dispatch, route);
  strictEqual(land.kind, 'identify');
  if (land.kind === 'identify') strictEqual(land.href, route?.redirect);
});

function landFor(raw: string) {
  const route = routeScan(raw);
  const dispatch = dispatchScan({ scan: route! });
  return { route, land: landScanIdentify(dispatch, route) };
}

test('a flat location code settles on the identify kernel (not /inventory?bin=)', () => {
  const { route, land } = landFor(BIN_FLAT);
  strictEqual(route?.type, 'bin');
  strictEqual(route?.redirect, '/inventory?bin=A0101101');
  strictEqual(land.kind, 'settle');
});

test('a dashed location code settles on the identify kernel', () => {
  const { land } = landFor(BIN_DASHED);
  strictEqual(land.kind, 'settle');
});

test('a GS1 location payload settles on the identify kernel', () => {
  const { route, land } = landFor(GS1_BIN);
  strictEqual(route?.type, 'bin');
  strictEqual(land.kind, 'settle');
});

test('a letter-guess bin settles (no door intake, no identify hop)', () => {
  const { route, land } = landFor(BIN_GUESS);
  strictEqual(route?.type, 'bin');
  strictEqual(route?.redirect, undefined);
  strictEqual(land.kind, 'settle');
});

test('a unit label lands on the phone unit hub, whatever its frame', () => {
  for (const [raw, href] of [
    ['U-CN1A2B3', '/m/u/CN1A2B3'],
    ['00039-BK-2639-000068', '/m/u/00039-BK-2639-000068'],
    // GS1 routes to /01/…/21/… — the resolver would send it to the DESK page.
    ['(01)00012345678905(21)SER-9', '/m/u/SER-9'],
  ] as const) {
    const { route, land } = landFor(raw);
    strictEqual(route?.type, 'serial-unit', raw);
    strictEqual(land.kind, 'identify', raw);
    if (land.kind === 'identify') strictEqual(land.href, href, raw);
  }
});

test('the kernel armed for QC lands a unit label on its checklist, a line on its unit pick', () => {
  for (const [raw, href] of [
    ['U-CN1A2B3', '/m/u/CN1A2B3/qc'],
    ['(01)00012345678905(21)SER-9', '/m/u/SER-9/qc'],
    ['L-32545', '/m/qc/line/32545'],
    ['r/32545', '/m/r/32545/qc'],
  ] as const) {
    const route = routeScan(raw);
    const land = landScanIdentify(dispatchScan({ scan: route!, armedSession: QC_SCAN_SESSION }), route);
    strictEqual(land.kind, 'identify', raw);
    if (land.kind === 'identify') strictEqual(land.href, href, raw);
  }
  // A stray label under QC previews exactly as it would unarmed — no second router.
  const bin = routeScan(BIN_FLAT);
  strictEqual(landScanIdentify(dispatchScan({ scan: bin!, armedSession: QC_SCAN_SESSION }), bin).kind, 'settle');
});
