/**
 * Pure tests for timeline rail glyph resolve — Support ACTIVITY screenshot set
 * + fallbacks. Icons live in the UI map; this asserts id + tooltip only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveStationGlyph, resolveTimelineGlyph } from './timeline-glyphs';

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
  // Split 2026-08-02: a note is written down (paper), a message is said (bubble).
  assert.equal(resolveTimelineGlyph('THREAD_MESSAGE').id, 'thread-message');
  assert.equal(resolveTimelineGlyph('NOTE').id, 'team-note');
  assert.equal(resolveTimelineGlyph('NOTE_ADDED').id, 'team-note');
  // Heuristic order matters — an unmapped *_NOTE_* must not fall to the bubble.
  assert.equal(resolveTimelineGlyph('THREAD_NOTE_PINNED').id, 'team-note');
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

test('resolveStationGlyph: a bench resolves to the glyph operators learned in nav', () => {
  // RECEIVING → `unbox` because `StationReceiving` IS `PackageOpen`. If this
  // ever drifts, the rail and MasterNav are showing two shapes for one bench.
  assert.deepEqual(resolveStationGlyph('RECEIVING'), { id: 'unbox', tooltip: 'Receiving' });
  assert.deepEqual(resolveStationGlyph('testing'), { id: 'testing', tooltip: 'Testing' });
  // Honest absence — never paint `signal` on a bench we simply do not map.
  assert.equal(resolveStationGlyph('SOME_NEW_BENCH'), null);
  assert.equal(resolveStationGlyph(''), null);
  assert.equal(resolveStationGlyph(null), null);
});
