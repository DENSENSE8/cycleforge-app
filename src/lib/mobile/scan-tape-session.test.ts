import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StationTapeEntry } from './station-tape';
import type { StockAdjustEntry } from './stock-adjust-session';
import { withStockAdjusts } from './scan-tape-session';

const row = (id: string, dedupeKey: string | null, at: string): StationTapeEntry => ({
  id, tone: 'ok', verb: 'Location', title: 'Location', identifier: id, recordId: null, conditionGrade: null,
  imageUrl: null, actor: null, actorId: null, message: 'Opened the location record', at, dedupeKey, live: true,
});
const adjust = (code: string, sku: string, delta: number, at: string, undone = false): StockAdjustEntry => ({
  id: `${code}-${sku}-${at}`, code, face: `face-${code}`, sku, title: null, imageUrl: null, delta, at, proof: 'p', undone,
});

test('a scanned location row reads what was adjusted there, matching the code case-insensitively', () => {
  const tape = [row('loc', 'location:A0202800', '2026-10-05T10:00:00Z'), row('box', 'carton:9', '2026-10-05T09:00:00Z')];
  const shown = withStockAdjusts(tape, [adjust('a0202800', 'TMP-1', 2, '2026-10-05T10:01:00Z')]);
  assert.deepEqual(shown.map((r) => [r.id, r.verb, r.title]), [
    ['loc', 'Adjusted', 'TMP-1 +2'],
    ['box', 'Location', 'Location'],
  ]);
});

test('a location adjusted without a scan row gets one row, newest first; an undone-only location gets none', () => {
  const tape = [row('loc', 'location:A1', '2026-10-05T10:00:00Z')];
  const adjusts = [
    adjust('C2', 'X', -1, '2026-10-05T10:05:00Z'),
    adjust('C2', 'Y', 3, '2026-10-05T10:04:00Z'),
    adjust('D3', 'Z', 1, '2026-10-05T10:03:00Z', true),
  ];
  const shown = withStockAdjusts(tape, adjusts);
  assert.deepEqual(shown.map((r) => [r.dedupeKey, r.message]), [
    ['location:C2', 'Y +3 · X −1'],
    ['location:A1', 'Opened the location record'],
  ]);
});
