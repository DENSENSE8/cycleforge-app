import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INCOMING_GRID_COLUMNS } from '@/lib/receiving/incoming-grid-layout';
import { RECEIVING_GRID_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import {
  SHARED_LINE_TRACK_META,
  type SharedLineTrackKey,
} from '@/lib/receiving/shared-line-tracks';

/**
 * Inbound ↔ History one family (2026-08-10): the shared column-grammar module is
 * the SINGLE source for label · type · align on every key both the expected
 * (Incoming `/incoming`) and landed (Unbox History) views draw the same way.
 *
 * This pins UNITY — the inverse of the retired fork guards. A future edit that
 * drifts one view's header grammar for a shared key (or forgets to source it
 * from the map) fails here.
 */
describe('SHARED_LINE_TRACK_META — one header grammar for both views', () => {
  const keys = Object.keys(SHARED_LINE_TRACK_META) as SharedLineTrackKey[];

  for (const key of keys) {
    it(`${key}: Incoming resolves label/type/align from the shared grammar`, () => {
      const col = INCOMING_GRID_COLUMNS.find((c) => c.key === key);
      assert.ok(col, `Incoming is missing shared key ${key}`);
      const meta = SHARED_LINE_TRACK_META[key];
      assert.equal(col.label, meta.label);
      assert.equal(col.type, meta.type);
      assert.equal(col.align, meta.align);
    });

    it(`${key}: History resolves label/type/align from the shared grammar`, () => {
      const col = RECEIVING_GRID_COLUMNS.find((c) => c.key === key);
      assert.ok(col, `History is missing shared key ${key}`);
      const meta = SHARED_LINE_TRACK_META[key];
      assert.equal(col.label, meta.label);
      assert.equal(col.type, meta.type);
      assert.equal(col.align, meta.align);
    });
  }

  it('the two views agree on every shared key (no drift)', () => {
    for (const key of keys) {
      const inc = INCOMING_GRID_COLUMNS.find((c) => c.key === key)!;
      const rec = RECEIVING_GRID_COLUMNS.find((c) => c.key === key)!;
      assert.equal(inc.label, rec.label, `${key} label drifted`);
      assert.equal(inc.type, rec.type, `${key} type drifted`);
      assert.equal(inc.align, rec.align, `${key} align drifted`);
    }
  });
});
