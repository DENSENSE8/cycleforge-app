import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLineStatusExacts } from './unbox-notes-status';

test('buildLineStatusExacts omits empty stamps and keeps receive exacts', () => {
  assert.deepEqual(buildLineStatusExacts({}), []);

  const rows = buildLineStatusExacts({
    received_at: '2026-08-18T17:04:00.000Z',
    received_by_name: 'Ada',
    received_done_at: '2026-08-18T18:10:00.000Z',
    label_printed_at: '2026-08-18T17:55:00.000Z',
    staged_at: '2026-08-18T18:00:00.000Z',
    staged_location_barcode: 'A0101101',
  });
  assert.deepEqual(
    rows.map((r) => r.key),
    ['door-scan', 'received', 'printed', 'staged'],
  );
  assert.equal(rows[0].title, 'Door scan');
  assert.match(rows[0].meta, /Ada/);
  assert.equal(rows.find((r) => r.key === 'staged')?.title, 'Staged');
  assert.match(rows.find((r) => r.key === 'staged')?.meta ?? '', /A0101101/);
});

test('buildLineStatusExacts includes opened / unboxed when present', () => {
  const rows = buildLineStatusExacts({
    unbox_opened_at: '2026-08-18T16:00:00.000Z',
    unboxed_at: '2026-08-18T16:05:00.000Z',
    unboxed_by_name: 'Lin',
  });
  assert.equal(rows[0].key, 'opened');
  assert.equal(rows[1].key, 'unboxed');
  assert.match(rows[1].meta, /Lin/);
});

test('staged prefers the stamped code over the live join', () => {
  // The bin was renamed after the fact; the stamp must still read what the
  // operator actually confirmed, not the row's current name.
  const rows = buildLineStatusExacts({
    staged_at: '2026-08-18T18:00:00.000Z',
    staged_location_code: 'A0101101',
    staged_location_barcode: 'RECEIVING-3',
    staged_location_name: 'Renamed later',
  });
  const staged = rows.find((r) => r.key === 'staged');
  assert.match(staged?.meta ?? '', /A0101101/);
  assert.doesNotMatch(staged?.meta ?? '', /RECEIVING-3/);
});

test('staged falls back to the live join for pre-snapshot rows', () => {
  const rows = buildLineStatusExacts({
    staged_at: '2026-08-18T18:00:00.000Z',
    staged_location_barcode: 'B0202202',
  });
  assert.match(rows.find((r) => r.key === 'staged')?.meta ?? '', /B0202202/);
});

test('staged names who confirmed the putaway', () => {
  const rows = buildLineStatusExacts({
    staged_at: '2026-08-18T18:00:00.000Z',
    staged_location_code: 'A0101101',
    staged_by_name: 'Ada',
  });
  const meta = rows.find((r) => r.key === 'staged')?.meta ?? '';
  assert.match(meta, /A0101101/);
  assert.match(meta, /Ada/);
});

test('a stamp with no facts paints no trailing separator', () => {
  const rows = buildLineStatusExacts({ staged_at: '2026-08-18T18:00:00.000Z' });
  assert.doesNotMatch(rows[0].meta, / · $/);
  assert.doesNotMatch(rows[0].meta, / · ·/);
});
