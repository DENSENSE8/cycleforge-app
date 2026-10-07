import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PICKED_BY_LATERAL,
  PICKED_BY_SOURCES,
  pickedByFromRow,
  sqlOrderIsPicked,
  sqlOrderPickedById,
} from './picked-by';

test('precedence: inventory event › picking session › pick scan › serial pull, one winner by rank', () => {
  assert.deepEqual([...PICKED_BY_SOURCES], ['inventory_event', 'picking_session', 'pick_scan', 'serial_pull']);
  // Each arm carries its precedence rank; the lateral keeps the lowest.
  const ranks = [...PICKED_BY_LATERAL.matchAll(/SELECT (\d+) AS rank, '([a-z_]+)'::text/g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(ranks, PICKED_BY_SOURCES.map((source, rank) => [rank, source]));
  assert.match(PICKED_BY_LATERAL, /ORDER BY pk_arm\.rank\s+LIMIT 1/);
  // The `?pickedBy=` scalar is the same winner, not a second COALESCE.
  assert.match(sqlOrderPickedById('o'), /ORDER BY pk_arm\.rank\s+LIMIT 1/);
});

test('an open picking session is a pick in progress, not a pick', () => {
  assert.match(PICKED_BY_LATERAL, /pk_ps\.ended_at IS NOT NULL\s+AND NOT pk_ps\.abandoned/);
  assert.match(sqlOrderIsPicked('o'), /pk_ps\.ended_at IS NOT NULL/);
});

test('"has been picked" reads every resolver source and never the pick assignment', () => {
  const sql = sqlOrderIsPicked('ord');
  for (const table of ['inventory_events', 'picking_sessions', 'station_activity_logs', 'tech_serial_numbers']) {
    assert.match(sql, new RegExp(`FROM ${table}|JOIN ${table}`), table);
  }
  assert.equal(sql.match(/EXISTS \(SELECT 1/g)?.length, PICKED_BY_SOURCES.length);
  assert.doesNotMatch(sql, /work_assignments/);
  assert.doesNotMatch(PICKED_BY_LATERAL, /work_assignments/);
  assert.match(sql, /pk_oua\.order_id\s+= ord\.id/);
});

test('pickedByFromRow: a source names the picker; no or unknown source is not picked', () => {
  assert.deepEqual(pickedByFromRow({ picked_by: 4, picked_by_name: ' Tuan ', picked_source: 'pick_scan' }), {
    id: 4,
    name: 'Tuan',
    source: 'pick_scan',
  });
  assert.deepEqual(pickedByFromRow({ picked_by: 0, picked_by_name: null, picked_source: 'serial_pull' }), {
    id: null,
    name: null,
    source: 'serial_pull',
  });
  assert.equal(pickedByFromRow({ picked_by: 4, picked_by_name: 'Tuan', picked_source: null }), null);
  assert.equal(pickedByFromRow({ picked_by: 4, picked_by_name: 'Tuan', picked_source: 'assignment' }), null);
});
