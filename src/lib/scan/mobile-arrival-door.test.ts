/**
 * The door wiring law, as tests: a never-seen tracking number opens Arrival
 * without minting, and a minted receivingId must never be read as trackingSeen.
 *
 *   npx tsx --test src/lib/scan/mobile-arrival-door.test.ts
 */

import { test } from 'node:test';
import { strictEqual, match, doesNotMatch, deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';

import {
  arrivalScanIntent,
  isCarrierTrackingScan,
  planDoorScan,
  trackingSeenFromPreview,
  type ScanInputSource,
} from './mobile-arrival-door';

const UPS = '1Z 999 AA1 01 2345 4471';

function trackingIntent(raw: string, source: ScanInputSource = 'scanned') {
  const intent = arrivalScanIntent(raw, source);
  if (intent.kind !== 'tracking') throw new Error(`${JSON.stringify(raw)} is ${intent.kind}, not tracking`);
  return intent;
}

test('a never-seen UPS tracking number opens Arrival and does not mint', () => {
  const plan = planDoorScan(trackingIntent(UPS), false);
  strictEqual(plan.openArrival, true);
  strictEqual(plan.card, 'arrival');
  strictEqual(plan.title, 'Intake · UPS 4471');
  strictEqual(plan.destination, 'the door');
  strictEqual(plan.mintOnScan, false);
});

test('a known carton does not re-open Arrival', () => {
  const plan = planDoorScan(trackingIntent(UPS), true);
  strictEqual(plan.openArrival, false);
  strictEqual(plan.card, 'carton');
  strictEqual(plan.mintOnScan, false);
});

test('an unconfirmed value the door sends on still opens Arrival when unseen', () => {
  // `SPXSNA…` routes as a bin; the door sends it to the server's last-8
  // resolver, and the plan must not re-route it into a "known" settle.
  const intent = trackingIntent('SPXSNA039708475305');
  strictEqual(intent.carrier, 'Unknown');
  strictEqual(intent.value, 'SPXSNA039708475305');
  strictEqual(planDoorScan(intent, false).openArrival, true);
  strictEqual(planDoorScan(intent, true).openArrival, false);
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


test('the door classifies a carrier label as tracking, with its carrier', () => {
  const intent = arrivalScanIntent(UPS, 'scanned');
  strictEqual(intent.kind, 'tracking');
  if (intent.kind !== 'tracking') return;
  // The route's canonical value, so the spaces on the sticker never become part
  // of the identity the station writes.
  doesNotMatch(intent.value, /\s/);
  strictEqual(intent.carrier, 'UPS');
});

test('our own carton sticker needs no lookup — the receiving id is in the label', () => {
  const intent = arrivalScanIntent('R-51189', 'scanned');
  strictEqual(intent.kind, 'carton');
  if (intent.kind !== 'carton') return;
  strictEqual(intent.receivingId, 51189);
});

test('a unit label is refused BEFORE anything is written, and says what to scan', () => {
  // Minting a carton for a unit sticker creates a phantom box somebody has to
  // hunt down and delete.
  const intent = arrivalScanIntent('U-100200', 'scanned');
  strictEqual(intent.kind, 'refused');
  if (intent.kind !== 'refused') return;
  match(intent.reason, /unit label/);
  match(intent.reason, /carrier label/);
});

test('an unreadable scan is refused rather than silently dropped', () => {
  // A station that says nothing looks like a station that missed the read.
  const intent = arrivalScanIntent('  ', 'scanned');
  strictEqual(intent.kind, 'refused');
  if (intent.kind !== 'refused') return;
  match(intent.reason, /carrier tracking number/);
});

test('the four named carrier labels are tracking, unwrapped', () => {
  const cases: Array<[string, string, string]> = [
    ['420900019361289711068322544977', '9361289711068322544977', 'USPS'],
    ['96119123456789012345678', '96119123456789012345678', 'FedEx'],
    ['1Z1789958595615058', '1Z1789958595615058', 'UPS'],
    ['TBA334518688254', 'TBA334518688254', 'Amazon'],
  ];
  for (const [raw, value, carrier] of cases) {
    const intent = trackingIntent(raw);
    deepStrictEqual([intent.value, intent.carrier], [value, carrier], raw);
  }
});

test('marketplace order numbers are refused as order numbers', () => {
  for (const raw of ['04-14902-05990', '113-1528397-8163447', '11124560724717854']) {
    const intent = arrivalScanIntent(raw, 'scanned');
    strictEqual(intent.kind, 'refused', raw);
    if (intent.kind !== 'refused') continue;
    match(intent.reason, /Nothing arrives under an order number\./);
  }
});

test('product barcodes stay refused: EAN-8, EAN-13, GTIN-14, short SKUs', () => {
  for (const raw of ['62326295', '0725181870133', '02000000000275', '260075437', '00179']) {
    strictEqual(arrivalScanIntent(raw, 'scanned').kind, 'refused', raw);
  }
});

test('typed last 8 of a tracking number is tracking, and runs the door plan', () => {
  // Operator 2026-10-04: a label that will not scan is keyed as its last 8.
  for (const raw of ['36912965', ' 36912965 ', '3691 2965']) {
    const intent = trackingIntent(raw, 'typed');
    deepStrictEqual([intent.value, intent.carrier], ['36912965', 'Unknown'], JSON.stringify(raw));
  }
  const intent = trackingIntent('36912965', 'typed');
  strictEqual(planDoorScan(intent, false).openArrival, true);
  strictEqual(planDoorScan(intent, true).openArrival, false);
  strictEqual(planDoorScan(intent, true).card, 'carton');
});

test('a scanned bare 8-digit label stays refused — it is a house label, not a tracking tail', () => {
  // Real phone scans of 8-digit labels are Goodwill order / PO numbers
  // (mobile_scan_events: 62326295 → PO 62326295), never a tracking tail.
  for (const raw of ['62326295', '64793692', '36912965']) {
    strictEqual(arrivalScanIntent(raw, 'scanned').kind, 'refused', raw);
  }
});

test('typing never widens the door past exactly 8 digits', () => {
  // 7 / 9 digits and letters keep the scanned rule; a typed full tracking
  // number is still tracking, a typed unit label still refused.
  for (const raw of ['3691296', '260075437', '3691296A', '62326295-1']) {
    strictEqual(arrivalScanIntent(raw, 'typed').kind, arrivalScanIntent(raw, 'scanned').kind, raw);
    strictEqual(arrivalScanIntent(raw, 'typed').kind, 'refused', raw);
  }
  deepStrictEqual(arrivalScanIntent(UPS, 'typed'), arrivalScanIntent(UPS, 'scanned'));
  strictEqual(arrivalScanIntent('U-100200', 'typed').kind, 'refused');
  strictEqual(arrivalScanIntent('R-51189', 'typed').kind, 'carton');
});

interface CorpusRow {
  value: string;
  class: 'carrier' | 'house' | 'noise';
  pattern: string;
  expect: 'tracking' | 'carton' | 'refused';
  tracking?: string;
  carrier?: string;
  noun?: string | null;
  before?: string;
  exception?: string;
  note?: string;
}

const corpus = JSON.parse(
  readFileSync(new URL('./fixtures/arrival-door-corpus.json', import.meta.url), 'utf8'),
) as { rows: CorpusRow[] };

test('corpus: every carrier label is tracking, except the documented exceptions', () => {
  const carrier = corpus.rows.filter((row) => row.class === 'carrier');
  for (const row of carrier) {
    const intent = arrivalScanIntent(row.value, 'scanned');
    strictEqual(intent.kind, row.exception ? 'refused' : 'tracking', `${row.pattern}: ${JSON.stringify(row.value)}`);
    if (intent.kind === 'tracking') {
      deepStrictEqual([intent.value, intent.carrier], [row.tracking, row.carrier], JSON.stringify(row.value));
    }
  }
  deepStrictEqual(
    carrier.filter((row) => row.exception).map((row) => row.value).sort(),
    ['1Z', '42060137', '42092647'],
  );
});

test('corpus: house labels keep their outcome, except order numbers and documented carrier reads', () => {
  for (const row of corpus.rows.filter((r) => r.class === 'house')) {
    const intent = arrivalScanIntent(row.value, 'scanned');
    strictEqual(intent.kind, row.expect, `${row.pattern}: ${JSON.stringify(row.value)}`);
    if (row.pattern.startsWith('eBay order no.')) {
      strictEqual(row.before, 'tracking');
      strictEqual(row.noun, 'an order number');
    } else if (!row.note) {
      strictEqual(intent.kind, row.before, JSON.stringify(row.value));
    }
  }
});

test('corpus: a multi-line pack-slip read takes its first tracking line', () => {
  for (const row of corpus.rows.filter((r) => r.pattern === 'multiline-packslip')) {
    const intent = trackingIntent(row.value);
    strictEqual(intent.value, row.value.split('\n')[0].replace(/\s/g, ''));
  }
});
