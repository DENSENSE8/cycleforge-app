import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScanProbeKeys,
  pickCartonMatch,
  pickLocalPoId,
  scanVerdictFromProbe,
  type ProbeCartonRow,
  type ScanMatchProbe,
} from './scan-match-probe';

const carton = (over: Partial<ProbeCartonRow> = {}): ProbeCartonRow => ({
  shipment_id: 1,
  receiving_id: 10,
  receiving_source: 'unmatched',
  po_id: null,
  line_count: 0,
  ...over,
});

const probe = (over: Partial<ScanMatchProbe> = {}): ScanMatchProbe => ({
  keys: buildScanProbeKeys('1Z999AA10123456784'),
  stnExact: [],
  stnLast8: [],
  stnPrefix: [],
  inbound: [],
  scanLast8: [],
  poRef: [],
  poNear: [],
  ...over,
});

test('keys: values under 8 digits leave every lossy tier off', () => {
  const k = buildScanProbeKeys('AB12');
  assert.equal(k.stnLast8, '');
  assert.equal(k.stnDigits, '');
  assert.equal(k.scanLast8, '');
  assert.equal(k.poDigits, '');
  assert.equal(k.poRef, 'AB12');
});

test('STN exact outranks every other tier', () => {
  const m = pickCartonMatch(
    probe({
      stnExact: [carton({ receiving_id: 1 })],
      stnLast8: [carton({ receiving_id: 2 })],
      inbound: [carton({ receiving_id: 3 })],
    }),
  );
  assert.equal(m?.tier, 'stn_exact');
  assert.equal(m?.receivingId, 1);
});

test('an exact STN row with no carton skips the lossy STN tiers but still reaches Incoming', () => {
  const m = pickCartonMatch(
    probe({
      stnExact: [carton({ receiving_id: null })],
      stnLast8: [carton({ receiving_id: 2 })],
      inbound: [carton({ receiving_id: 3, receiving_source: 'zoho_po' })],
    }),
  );
  assert.equal(m?.tier, 'inbound');
  assert.equal(m?.receivingId, 3);
  assert.equal(m?.receivingSource, 'unmatched');
});

test('ambiguous last-8 is a miss and falls to a single digit-prefix hit', () => {
  const m = pickCartonMatch(
    probe({
      stnLast8: [carton({ receiving_id: 2 }), carton({ receiving_id: 4 })],
      stnPrefix: [carton({ receiving_id: 5 })],
    }),
  );
  assert.equal(m?.tier, 'stn_prefix');
  assert.equal(m?.receivingId, 5);
});

test('a single prior scan reuses that scan row', () => {
  const m = pickCartonMatch(
    probe({
      inbound: [carton({ receiving_id: 3 }), carton({ receiving_id: 6 })],
      scanLast8: [{ scan_id: 77, receiving_id: 8, po_id: 'P8', line_count: 2 }],
    }),
  );
  assert.deepEqual(m, {
    tier: 'scan_last8',
    receivingId: 8,
    receivingSource: 'unmatched',
    scanId: 77,
    poId: 'P8',
    lineCount: 2,
  });
});

test('PO id: carton first, then Reference# exact, then a single near-miss', () => {
  assert.equal(pickLocalPoId(probe({ poRef: ['R'], poNear: ['N'] }), 'C'), 'C');
  assert.equal(pickLocalPoId(probe({ poRef: ['R'], poNear: ['N'] }), null), 'R');
  assert.equal(pickLocalPoId(probe({ poNear: ['N'] }), null), 'N');
  assert.equal(pickLocalPoId(probe({ poNear: ['N', 'M'] }), null), null);
});

test('verdict: an empty unfound carton stays unfound; lines, Incoming or a PO make it found', () => {
  assert.equal(scanVerdictFromProbe(probe()).verdict, 'unfound');
  assert.equal(scanVerdictFromProbe(probe({ stnExact: [carton()] })).verdict, 'unfound');
  assert.equal(scanVerdictFromProbe(probe({ stnExact: [carton({ line_count: 3 })] })).verdict, 'found');
  assert.equal(scanVerdictFromProbe(probe({ inbound: [carton()] })).verdict, 'found');
  const byRef = scanVerdictFromProbe(probe({ poRef: ['R'] }));
  assert.equal(byRef.verdict, 'found');
  assert.equal(byRef.poId, 'R');
  assert.equal(byRef.receivingId, null);
});
