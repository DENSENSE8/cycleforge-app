import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRIORITY_OVERRIDE_TIERS, priorityOverrideTiersForHeader, priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { platformClassifyOptions, typeClassifyOptions } from './classify-pill-options';

test('urgency bookmark shorts stay ≤4 chars', () => {
  for (const t of PRIORITY_OVERRIDE_TIERS) {
    assert.ok(t.short.length <= 4, `${t.label} short="${t.short}"`);
  }
});

test('urgency picker escalates Low → Priority under Auto (platform first)', () => {
  const picker = priorityOverrideTiersForPicker();
  assert.deepEqual(
    picker.map((t) => t.label),
    ['Low', 'Medium', 'High', 'Priority'],
  );
  // Storage / facet order stays most-urgent-first.
  assert.equal(PRIORITY_OVERRIDE_TIERS[0].label, 'Priority');
});

test('header urgency list is Low → Medium → High (no Auto, no Priority)', () => {
  const header = priorityOverrideTiersForHeader();
  assert.deepEqual(
    header.map((t) => t.label),
    ['Low', 'Medium', 'High'],
  );
  const medium = header.find((t) => t.label === 'Medium');
  assert.ok(medium?.dotClass.includes('yellow'), 'Medium has a yellow identity dot');
});

test('platform classify options have no letter shortLabel', () => {
  const options = platformClassifyOptions({
    catalogOptions: [
      { value: 'ebay', label: 'eBay' },
      { value: 'amazon', label: 'Amazon' },
    ],
    isUnmatched: false,
  });
  for (const option of options) {
    assert.equal(option.shortLabel, undefined, `${option.label} must be a colored dot, not ${option.shortLabel}`);
  }
});

test('type classify options carry no letter shortLabel — the display name is the face', () => {
  const options = typeClassifyOptions({
    catalogOptions: [
      { value: 'PO', label: 'PO' },
      { value: 'RETURN', label: 'Return' },
      { value: 'TRADE_IN', label: 'Trade In' },
    ],
  });
  for (const option of options) {
    assert.equal(option.shortLabel, undefined, `${option.label} must show its name, not ${option.shortLabel}`);
  }
});
