/** DB-free unit tests for the serial-projection module (Tier B2 of the immediate-serial-display plan). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchSerialsForLines,
  toSerialProjection,
  refreshLineSerialProjection,
  type LineSerial,
  type SerialProjectionEntry,
  type FetchSerialsDeps,
  type RefreshProjectionDeps,
} from './serial-projection';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function serial(id: number, sn: string, extra: Partial<LineSerial> = {}): LineSerial {
  return {
    id,
    serial_number: sn,
    current_status: 'RECEIVED',
    sku_catalog_id: null,
    condition_grade: null,
    created_at: `2026-07-13T00:00:0${id}.000Z`,
    handling_unit_id: null,
    unit_uid: null,
    ...extra,
  };
}

test('toSerialProjection: keeps only id/serial_number/condition_grade/unit_uid', () => {
  const out = toSerialProjection([
    serial(1, 'SN-A', { condition_grade: 'USED_A', current_status: 'IN_TEST', unit_uid: 'U-1' }),
    serial(2, 'SN-B'),
  ]);
  assert.deepEqual(out, [
    { id: 1, serial_number: 'SN-A', condition_grade: 'USED_A', unit_uid: 'U-1' },
    { id: 2, serial_number: 'SN-B', condition_grade: null, unit_uid: null },
  ]);
});

test('fetchSerialsForLines: groups candidates by their CURRENT line, dropping cross-line', async () => {
  // Two candidate serials; serial 1 currently on line 10, serial 2's current
  // line resolved to 99 (not in the requested set) → dropped.
  const deps: FetchSerialsDeps = {
    query: (async (_org: OrgId, _sql: string, _params?: unknown[]) => ({
      rows: [
        { id: 1, serial_number: 'SN-1', current_status: 'RECEIVED', sku_catalog_id: null,
          condition_grade: 'USED_A', handling_unit_id: null, unit_uid: null,
          origin_receiving_line_id: 10, created_at: '2026-07-13T00:00:01.000Z' },
        { id: 2, serial_number: 'SN-2', current_status: 'RECEIVED', sku_catalog_id: null,
          condition_grade: null, handling_unit_id: null, unit_uid: null,
          origin_receiving_line_id: 10, created_at: '2026-07-13T00:00:02.000Z' },
      ],
    })) as unknown as FetchSerialsDeps['query'],
    // serial 1 stays on 10; serial 2 moved to 99 (re-received under another PO)
    resolveCurrentLines: async (ids: number[]) => {
      const m = new Map<number, number>();
      if (ids.includes(1)) m.set(1, 10);
      if (ids.includes(2)) m.set(2, 99);
      return m;
    },
  };

  const grouped = await fetchSerialsForLines([10], ORG, deps);
  assert.deepEqual([...grouped.keys()], [10]);
  assert.equal(grouped.get(10)?.length, 1);
  assert.equal(grouped.get(10)?.[0].id, 1);
});

test('fetchSerialsForLines: empty lineIds short-circuits with no query', async () => {
  let called = false;
  const deps: FetchSerialsDeps = {
    query: (async () => { called = true; return { rows: [] }; }) as unknown as FetchSerialsDeps['query'],
    resolveCurrentLines: async () => new Map(),
  };
  const grouped = await fetchSerialsForLines([], ORG, deps);
  assert.equal(grouped.size, 0);
  assert.equal(called, false);
});

test('refreshLineSerialProjection: writes the expected jsonb per line (attach)', async () => {
  const writes: Array<{ lineId: number; projection: SerialProjectionEntry[] }> = [];
  const deps: RefreshProjectionDeps = {
    fetchSerials: async (lineIds) => {
      const m = new Map<number, LineSerial[]>();
      if (lineIds.includes(10)) m.set(10, [serial(1, 'SN-1', { condition_grade: 'USED_A' })]);
      return m;
    },
    writeProjection: async (_org, lineId, projection) => { writes.push({ lineId, projection }); },
  };

  await refreshLineSerialProjection(ORG, 10, deps);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].lineId, 10);
  assert.deepEqual(writes[0].projection, [{ id: 1, serial_number: 'SN-1', condition_grade: 'USED_A', unit_uid: null }]);
});

test('refreshLineSerialProjection: a line with no serials writes an empty projection (detach to zero)', async () => {
  const writes: Array<{ lineId: number; projection: SerialProjectionEntry[] }> = [];
  const deps: RefreshProjectionDeps = {
    fetchSerials: async () => new Map(), // no serials left on the line
    writeProjection: async (_org, lineId, projection) => { writes.push({ lineId, projection }); },
  };
  await refreshLineSerialProjection(ORG, 10, deps);
  assert.deepEqual(writes, [{ lineId: 10, projection: [] }]);
});

test('refreshLineSerialProjection: current-line move refreshes BOTH old and new line', async () => {
  const writes: Array<{ lineId: number; projection: SerialProjectionEntry[] }> = [];
  const deps: RefreshProjectionDeps = {
    fetchSerials: async (lineIds) => {
      const m = new Map<number, LineSerial[]>();
      // serial left line 10 (now empty) and landed on line 20.
      if (lineIds.includes(20)) m.set(20, [serial(5, 'SN-5')]);
      return m;
    },
    writeProjection: async (_org, lineId, projection) => { writes.push({ lineId, projection }); },
  };
  await refreshLineSerialProjection(ORG, [10, 20], deps);
  const byLine = new Map(writes.map((w) => [w.lineId, w.projection]));
  assert.deepEqual(byLine.get(10), []); // old line cleared
  assert.deepEqual(byLine.get(20), [{ id: 5, serial_number: 'SN-5', condition_grade: null, unit_uid: null }]);
});

test('refreshLineSerialProjection: de-dupes + ignores non-positive ids', async () => {
  const seen: number[] = [];
  const deps: RefreshProjectionDeps = {
    fetchSerials: async () => new Map(),
    writeProjection: async (_org, lineId) => { seen.push(lineId); },
  };
  await refreshLineSerialProjection(ORG, [10, 10, 0, -1, 20], deps);
  assert.deepEqual(seen.sort((a, b) => a - b), [10, 20]);
});
