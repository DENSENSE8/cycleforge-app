import assert from 'node:assert/strict';
import test from 'node:test';
import type { StationTapeEntry } from './station-tape';
import { projectMobileV2ScanRecents } from './v2-scan-recent';

function entry(id: string, overrides: Partial<StationTapeEntry> = {}): StationTapeEntry {
  return {
    id,
    tone: 'ok',
    verb: 'Matched',
    title: `Package ${id}`,
    identifier: `R-${id}`,
    recordId: null,
    conditionGrade: null,
    imageUrl: null,
    actor: null,
    actorId: null,
    message: null,
    at: '2026-10-01T12:00:00.000Z',
    dedupeKey: id,
    live: true,
    ...overrides,
  };
}

test('scan recents preserve the station newest-first order and mark only the head latest', () => {
  const rows = projectMobileV2ScanRecents([entry('2'), entry('1')], 'Package');
  assert.deepEqual(rows.map((row) => row.id), ['2', '1']);
  assert.deepEqual(rows.map((row) => row.isLatest), [true, false]);
});

test('scan recents provide an honest title and identifier fallback for SwiftUI parity', () => {
  const [row] = projectMobileV2ScanRecents(
    [entry('3', { title: ' ', identifier: null, recordId: 'PO-300' })],
    'Package',
  );
  assert.equal(row.title, 'Package');
  assert.equal(row.identifier, 'PO-300');
});
