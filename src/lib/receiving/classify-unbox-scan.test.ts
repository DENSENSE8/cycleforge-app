/**
 * Unit tests for the surface-aware unbox scan classifier. Pure / DB-free.
 *   node --import tsx --test src/lib/receiving/classify-unbox-scan.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cartonNeedsSerials,
  classifyUnboxScan,
  lineNeedsSerials,
  shouldConfirmCartonSwitch,
} from './classify-unbox-scan';

test('base classification passes through with the right intent', () => {
  // A SKU scan (`:`), a repair ticket, a command word.
  assert.deepEqual(
    classifyUnboxScan('SKU:ABC-123', { surface: 'unbox' }),
    { type: 'SKU', intent: 'sku_lookup', reclassified: false },
  );
  assert.deepEqual(
    classifyUnboxScan('RS-42', { surface: 'unbox' }),
    { type: 'REPAIR', intent: 'repair', reclassified: false },
  );
  assert.deepEqual(
    classifyUnboxScan('YES', { surface: 'unbox' }),
    { type: 'COMMAND', intent: 'command', reclassified: false },
  );
});

test('context override: mid-carton, carrier-unknown TRACKING → SERIAL on a scan surface', () => {
  // A long numeric barcode classifies as TRACKING by the string heuristic…
  const raw = '9400111899223817200000';
  const base = classifyUnboxScan(raw, { surface: 'unbox' });
  // …but with an active carton short on serials and no known carrier, it's a serial.
  const overridden = classifyUnboxScan(raw, {
    surface: 'unbox',
    activeCartonNeedsSerials: true,
    knownCarrier: false,
  });
  if (base.type === 'TRACKING') {
    assert.equal(overridden.type, 'SERIAL');
    assert.equal(overridden.intent, 'add_serial');
    assert.equal(overridden.reclassified, true);
  }
});

test('a KNOWN carrier stays TRACKING even mid-carton', () => {
  const raw = '9400111899223817200000';
  const res = classifyUnboxScan(raw, {
    surface: 'unbox',
    activeCartonNeedsSerials: true,
    knownCarrier: true, // recognized carrier prefix → still a carton
  });
  assert.equal(res.reclassified, false);
  assert.notEqual(res.intent, 'add_serial');
});

test('the override only applies on scan surfaces (unbox/triage), not others', () => {
  const raw = '9400111899223817200000';
  const base = classifyUnboxScan(raw, { surface: 'unbox' });
  if (base.type === 'TRACKING') {
    // `incoming` is a Workbench surface (scan: null) — no context override.
    const res = classifyUnboxScan(raw, {
      surface: 'incoming',
      activeCartonNeedsSerials: true,
      knownCarrier: false,
    });
    assert.equal(res.reclassified, false);
    assert.equal(res.type, 'TRACKING');
  }
});

test('triage surface does NOT reclassify tracking as serial (serials are inside the box)', () => {
  const raw = '9400111899223817200000';
  const base = classifyUnboxScan(raw, { surface: 'triage' });
  if (base.type === 'TRACKING') {
    const res = classifyUnboxScan(raw, {
      surface: 'triage',
      activeCartonNeedsSerials: true,
      knownCarrier: false,
    });
    assert.equal(res.type, 'TRACKING');
    assert.equal(res.reclassified, false);
  }
});

test('shouldConfirmCartonSwitch: only known-carrier open_carton while serials owed', () => {
  assert.equal(
    shouldConfirmCartonSwitch({
      intent: 'open_carton',
      knownCarrier: true,
      activeCartonNeedsSerials: true,
    }),
    true,
  );
  assert.equal(
    shouldConfirmCartonSwitch({
      intent: 'open_carton',
      knownCarrier: false,
      activeCartonNeedsSerials: true,
    }),
    false,
  );
  assert.equal(
    shouldConfirmCartonSwitch({
      intent: 'add_serial',
      knownCarrier: true,
      activeCartonNeedsSerials: true,
    }),
    false,
  );
  assert.equal(
    shouldConfirmCartonSwitch({
      intent: 'open_carton',
      knownCarrier: true,
      activeCartonNeedsSerials: false,
    }),
    false,
  );
});

test('lineNeedsSerials: expected qty vs accounted serials + per-unit waiver', () => {
  assert.equal(lineNeedsSerials({ quantity_expected: 2, serials: [] }), true);
  assert.equal(
    lineNeedsSerials({
      quantity_expected: 2,
      serials: [{ serial_number: 'A' }, { serial_number: 'B' }],
    }),
    false,
  );
  assert.equal(
    lineNeedsSerials({
      quantity_expected: 2,
      serials: [{ serial_number: 'A' }],
      units: [{ serial: null, serial_absent: true }],
    }),
    false,
  );
  assert.equal(lineNeedsSerials({ quantity_expected: 2, serial_absent: true }), false);
  assert.equal(lineNeedsSerials({ quantity_expected: null, serials: [] }), false);
  assert.equal(lineNeedsSerials({ quantity_expected: 0, serials: [] }), false);
});

test('cartonNeedsSerials: any sibling line still owing', () => {
  assert.equal(
    cartonNeedsSerials([
      { quantity_expected: 1, serials: [{ serial_number: 'DONE' }] },
      { quantity_expected: 2, serials: [{ serial_number: 'ONE' }] },
    ]),
    true,
  );
  assert.equal(
    cartonNeedsSerials([
      { quantity_expected: 1, serials: [{ serial_number: 'A' }] },
      { quantity_expected: 1, serials: [{ serial_number: 'B' }] },
    ]),
    false,
  );
});
