/**
 * DB-free unit tests for the receiving_photo.reassign payload shape.
 *
 * Run: node --test --require ./scripts/register-server-only-shim.cjs --import tsx src/lib/assistant/mutations/reassign-payload.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_REASSIGN_MOVES,
  normalizeReassignPayload,
} from './reassign-payload';

test('single-photo sugar normalises to one move', () => {
  const out = normalizeReassignPayload({
    photoId: 900,
    targetEntityType: 'RECEIVING_LINE',
    targetEntityId: 800,
  });
  assert.deepEqual(out, {
    ok: true,
    moves: [{ photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 }],
  });
});

test('many photos to ONE destination — the shape a model will actually write', () => {
  const out = normalizeReassignPayload({
    photoIds: [1, 2, 3],
    targetEntityType: 'RECEIVING_LINE',
    targetEntityId: 800,
  });
  assert.ok(out.ok);
  assert.equal(out.moves.length, 3);
  assert.ok(out.moves.every((m) => m.targetEntityId === 800));
});

test('the canonical per-photo form supports DIFFERENT destinations', () => {
  // This is what an inverse always looks like: five photos moved onto one line
  // may have come from five different places, so the undo names one
  // destination per photo.
  const out = normalizeReassignPayload({
    moves: [
      { photoId: 1, targetEntityType: 'RECEIVING_LINE', targetEntityId: 700 },
      { photoId: 2, targetEntityType: 'RECEIVING', targetEntityId: 42 },
    ],
  });
  assert.ok(out.ok);
  assert.equal(out.moves[0]!.targetEntityId, 700);
  assert.equal(out.moves[1]!.targetEntityType, 'RECEIVING');
});

test('a repeated photo is REJECTED, not silently last-write-wins', () => {
  const out = normalizeReassignPayload({
    moves: [
      { photoId: 1, targetEntityType: 'RECEIVING_LINE', targetEntityId: 700 },
      { photoId: 1, targetEntityType: 'RECEIVING', targetEntityId: 42 },
    ],
  });
  assert.equal(out.ok, false);
  assert.match((out as { error: string }).error, /appears more than once/);
});

test('the batch cap refuses rather than truncating', () => {
  // Silently moving the first 50 of 60 is the failure mode that leaves an
  // operator diffing a carton by hand to find out what happened.
  const out = normalizeReassignPayload({
    photoIds: Array.from({ length: MAX_REASSIGN_MOVES + 1 }, (_, i) => i + 1),
    targetEntityType: 'RECEIVING',
    targetEntityId: 42,
  });
  assert.equal(out.ok, false);
  assert.match((out as { error: string }).error, /limit is 50/);
  assert.match((out as { error: string }).error, /Split it into batches/);
});

test('exactly the cap is allowed', () => {
  const out = normalizeReassignPayload({
    photoIds: Array.from({ length: MAX_REASSIGN_MOVES }, (_, i) => i + 1),
    targetEntityType: 'RECEIVING',
    targetEntityId: 42,
  });
  assert.ok(out.ok);
  assert.equal(out.moves.length, MAX_REASSIGN_MOVES);
});

test('an empty batch is an error, not a silent no-op', () => {
  assert.equal(normalizeReassignPayload({ moves: [] }).ok, false);
  assert.equal(
    normalizeReassignPayload({
      photoIds: [],
      targetEntityType: 'RECEIVING',
      targetEntityId: 42,
    }).ok,
    false,
  );
});

test('a bad entity type is rejected with the two legal values named', () => {
  const out = normalizeReassignPayload({
    photoId: 1,
    targetEntityType: 'ORDER',
    targetEntityId: 5,
  });
  assert.equal(out.ok, false);
  assert.match((out as { error: string }).error, /RECEIVING_LINE/);
});

test('non-numeric ids are rejected, not coerced', () => {
  assert.equal(
    normalizeReassignPayload({
      photoId: 'the first one',
      targetEntityType: 'RECEIVING',
      targetEntityId: 42,
    }).ok,
    false,
  );
  assert.equal(
    normalizeReassignPayload({
      photoIds: [1, 2.5],
      targetEntityType: 'RECEIVING',
      targetEntityId: 42,
    }).ok,
    false,
  );
  assert.equal(
    normalizeReassignPayload({
      photoIds: [1],
      targetEntityType: 'RECEIVING',
      targetEntityId: 0,
    }).ok,
    false,
  );
});

test('an error names WHICH element failed so the model can fix that one', () => {
  const out = normalizeReassignPayload({
    moves: [
      { photoId: 1, targetEntityType: 'RECEIVING', targetEntityId: 42 },
      { photoId: 2, targetEntityType: 'nope', targetEntityId: 42 },
    ],
  });
  assert.match((out as { error: string }).error, /moves\[1\]/);
});
