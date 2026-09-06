/**
 * The door wiring law, as tests: a never-seen tracking number opens Arrival
 * without minting, and a minted receivingId must never be read as trackingSeen.
 *
 *   npx tsx --test src/lib/scan/mobile-arrival-door.test.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strictEqual, match, doesNotMatch } from 'node:assert';

import {
  arrivalScanIntent,
  isCarrierTrackingScan,
  planDoorScan,
  trackingSeenFromPreview,
} from './mobile-arrival-door';

const UPS = '1Z 999 AA1 01 2345 4471';
const HERE = dirname(fileURLToPath(import.meta.url));

test('a never-seen UPS tracking number opens Arrival and does not mint', () => {
  const plan = planDoorScan(UPS, false);
  strictEqual(plan.openArrival, true);
  strictEqual(plan.card, 'arrival');
  strictEqual(plan.title, 'Intake · UPS 4471');
  strictEqual(plan.destination, 'the door');
  strictEqual(plan.mintOnScan, false);
});

test('a known carton does not re-open Arrival', () => {
  const plan = planDoorScan(UPS, true);
  strictEqual(plan.openArrival, false);
  strictEqual(plan.card, 'carton');
  strictEqual(plan.mintOnScan, false);
});

test('trackingSeen is preview match, never a minted receivingId', () => {
  strictEqual(trackingSeenFromPreview(true), true);
  strictEqual(trackingSeenFromPreview(false), false);
  strictEqual(trackingSeenFromPreview(undefined), false);
  strictEqual(trackingSeenFromPreview(null), false);
});

test('isCarrierTrackingScan is the door gate', () => {
  strictEqual(isCarrierTrackingScan(UPS), true);
  strictEqual(isCarrierTrackingScan('A12'), false);
  strictEqual(isCarrierTrackingScan('R-1234'), false);
});

test('UniversalScan decides trackingSeen from preview, not a minted receivingId', () => {
  const src = readFileSync(
    join(HERE, '../../components/mobile/redesign/UniversalScan.tsx'),
    'utf8',
  );
  match(src, /preview-scan/, 'the door read is preview-scan (creates nothing)');
  match(src, /trackingSeenFromPreview/, 'preview match is the only trackingSeen');
  doesNotMatch(
    src,
    /trackingSeen:\s*verdict\?\.value\.receivingId/,
    'the dump defect: minted receivingId must not count as seen',
  );
});

test('the door classifies a carrier label as tracking, with its carrier', () => {
  const intent = arrivalScanIntent(UPS);
  strictEqual(intent.kind, 'tracking');
  if (intent.kind !== 'tracking') return;
  // The route's canonical value, so the spaces on the sticker never become part
  // of the identity the station writes.
  doesNotMatch(intent.value, /\s/);
  strictEqual(intent.carrier, 'UPS');
});

test('our own carton sticker needs no lookup — the receiving id is in the label', () => {
  const intent = arrivalScanIntent('R-51189');
  strictEqual(intent.kind, 'carton');
  if (intent.kind !== 'carton') return;
  strictEqual(intent.receivingId, 51189);
});

test('a unit label is refused BEFORE anything is written, and says what to scan', () => {
  // Minting a carton for a unit sticker creates a phantom box somebody has to
  // hunt down and delete.
  const intent = arrivalScanIntent('U-100200');
  strictEqual(intent.kind, 'refused');
  if (intent.kind !== 'refused') return;
  match(intent.reason, /unit label/);
  match(intent.reason, /carrier label/);
});

test('an unreadable scan is refused rather than silently dropped', () => {
  // A station that says nothing looks like a station that missed the read.
  const intent = arrivalScanIntent('  ');
  strictEqual(intent.kind, 'refused');
  if (intent.kind !== 'refused') return;
  match(intent.reason, /carrier tracking number/);
});
