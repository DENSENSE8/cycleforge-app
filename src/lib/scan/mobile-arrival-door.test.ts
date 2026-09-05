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
  strictEqual(plan.title, 'Arrival · UPS 4471');
  strictEqual(plan.destination, 'Arrival');
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
