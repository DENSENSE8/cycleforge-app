import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StaffTodoPatchBody } from '@/lib/schemas/staff-todos';

/**
 * The PATCH vocabulary of /api/staff-todos. `rename` is the U in this list's
 * CRUD — the discriminated union is what keeps it from being a free-form
 * update that could reach any column.
 */

test('rename carries an id and non-empty trimmed text', () => {
  const ok = StaffTodoPatchBody.safeParse({ action: 'rename', id: 7, text: '  Sweep bench  ' });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.success && ok.data, { action: 'rename', id: 7, text: 'Sweep bench' });
});

test('rename refuses blank text and non-positive ids', () => {
  assert.equal(StaffTodoPatchBody.safeParse({ action: 'rename', id: 7, text: '   ' }).success, false);
  assert.equal(StaffTodoPatchBody.safeParse({ action: 'rename', id: 0, text: 'x' }).success, false);
});

test('rename cannot smuggle another field past the union', () => {
  const parsed = StaffTodoPatchBody.safeParse({
    action: 'rename',
    id: 7,
    text: 'x',
    station: 'TECH',
    done: true,
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(Object.keys(parsed.success ? parsed.data : {}).sort(), ['action', 'id', 'text']);
});

test('the other actions still parse — rename is an addition, not a replacement', () => {
  for (const body of [
    { action: 'toggle', id: 1, done: true },
    { action: 'unarchive', id: 1 },
    { action: 'set_interval', station: 'PACK', intervalMs: 3_600_000 },
  ]) {
    assert.equal(StaffTodoPatchBody.safeParse(body).success, true, JSON.stringify(body));
  }
});
