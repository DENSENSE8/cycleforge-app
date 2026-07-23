/**
 * Pure tests for timeline rail glyph resolve — Support ACTIVITY screenshot set
 * + fallbacks. Icons live in the UI map; this asserts id + tooltip only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTimelineGlyph } from './timeline-glyphs';

test('resolveTimelineGlyph: Support ACTIVITY screenshot event set', () => {
  assert.deepEqual(resolveTimelineGlyph('UNBOX_CONFIRMED'), {
    id: 'unbox',
    tooltip: 'Unbox',
  });
  assert.deepEqual(resolveTimelineGlyph('TICKET_LINKED'), {
    id: 'support',
    tooltip: 'Support',
  });
  assert.deepEqual(resolveTimelineGlyph('UNBOX_SCAN_OPENED'), {
    id: 'unbox',
    tooltip: 'Unbox',
  });
  assert.deepEqual(resolveTimelineGlyph('TRACKING_SCANNED'), {
    id: 'tracking-scan',
    tooltip: 'Tracking scan',
  });
  assert.deepEqual(resolveTimelineGlyph('SIGNAL_RECORDED'), {
    id: 'signal',
    tooltip: 'Signal',
  });
});

test('resolveTimelineGlyph: missing / unknown → quiet signal fallback', () => {
  assert.deepEqual(resolveTimelineGlyph(undefined), { id: 'signal', tooltip: 'Signal' });
  assert.deepEqual(resolveTimelineGlyph(null), { id: 'signal', tooltip: 'Signal' });
  assert.deepEqual(resolveTimelineGlyph(''), { id: 'signal', tooltip: 'Signal' });
  assert.deepEqual(resolveTimelineGlyph('TOTALLY_NEW_EVENT'), {
    id: 'signal',
    tooltip: 'Signal',
  });
});

test('resolveTimelineGlyph: carrier + thread + pack families', () => {
  assert.equal(resolveTimelineGlyph('CARRIER_EVENT').id, 'carrier');
  assert.equal(resolveTimelineGlyph('THREAD_MESSAGE').id, 'team-note');
  assert.equal(resolveTimelineGlyph('PACK_COMPLETED').id, 'packing');
  assert.equal(resolveTimelineGlyph('SHIP_CONFIRM').id, 'shipping');
  assert.equal(resolveTimelineGlyph('TEST_PASS').id, 'testing');
});

test('resolveTimelineGlyph: UNBOX_* prefix heuristic', () => {
  assert.deepEqual(resolveTimelineGlyph('UNBOX_SOMETHING_NEW'), {
    id: 'unbox',
    tooltip: 'Unbox',
  });
});
