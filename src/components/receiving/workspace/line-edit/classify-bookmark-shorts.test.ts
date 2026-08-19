import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRIORITY_OVERRIDE_TIERS, priorityOverrideTiersForHeader, priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { sourcePlatformMark } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';

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

test('platform marks stay ≤2 chars for equal-width bookmark', () => {
  assert.equal(sourcePlatformMark('aliexpress'), 'AE');
  assert.ok(sourcePlatformMark('aliexpress').length <= 2);
  assert.ok(sourcePlatformMark('goodwill').length <= 2);
});

test('receiving type shorts stay compact for bookmark chrome', () => {
  assert.equal(receivingTypeMeta('PO').short, 'PO');
  assert.equal(receivingTypeMeta('RETURN').short, 'Ret');
  assert.equal(receivingTypeMeta('TRADE_IN').short, 'Trade');
  assert.ok(receivingTypeMeta('TRADE_IN').short.length <= 5);
});
