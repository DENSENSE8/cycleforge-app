/**
 *   npx tsx --test src/lib/assistant/tools/chat-writes.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractIdentifierTokens } from './order-status-tools';
import { matchStaff } from './task-tools';

test('a paste yields each order / item # once, never the words or times around them', () => {
  assert.deepEqual(
    extractIdentifierTokens('Mark these out of stock now: #111-2207049-1422606, 15-15111-45139\nB01F8DKUSA; 111-2207049-1422606 before 3pm'),
    ['111-2207049-1422606', '15-15111-45139', 'B01F8DKUSA'],
  );
  assert.deepEqual(extractIdentifierTokens('mark all the packed orders as scanned out'), []);
});

const roster = [
  { id: 1, name: 'Michael' },
  { id: 3, name: 'Sang' },
  { id: 4, name: 'Tuan' },
  { id: 16, name: 'Hoàng Lê Bách' },
  { id: 66, name: 'Van Anh' },
];

test('staff names resolve exactly, by unique first name, accent-insensitively, and "me" is the caller', () => {
  const r = matchStaff('Sang and tuan, hoang & me', roster, 1);
  assert.deepEqual(r.staff.map((s) => s.id), [3, 4, 16, 1]);
  assert.deepEqual(r.unmatched, []);
  assert.deepEqual(matchStaff('Van Anh', roster, 1).staff.map((s) => s.id), [66]);
});

test('an unknown name is reported, never guessed to a near match', () => {
  const r = matchStaff('Sang and Tom', roster, 1);
  assert.deepEqual(r.staff.map((s) => s.id), [3]);
  assert.deepEqual(r.unmatched, ['Tom']);
});
