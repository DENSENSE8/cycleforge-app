import assert from 'node:assert/strict';
import test from 'node:test';
import { nextAvailableRoomZoneLetter, ROOM_ZONE_LETTERS } from './room-zone-letter';

test('automatic room zones take the first unused letter', () => {
  assert.equal(nextAvailableRoomZoneLetter([]), 'A');
  assert.equal(nextAvailableRoomZoneLetter(['A', 'c']), 'B');
  assert.equal(nextAvailableRoomZoneLetter(['A', null, 'not-a-letter', 'B']), 'C');
});

test('automatic room zones report an exhausted one-letter namespace', () => {
  assert.equal(nextAvailableRoomZoneLetter(ROOM_ZONE_LETTERS), null);
});
