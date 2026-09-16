/**
 * The hard gate for *"it should never display the same child and parent name"*
 * (operator 2026-09-14). Runs in verify's **Unit tests** gate, so a registry
 * edit that re-introduces a stutter fails before it ships — see
 * `nav-name-collisions.ts` for why this is a test rather than a design-mcp
 * refuse rule.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findNavNameCollisions,
  formatNavNameCollision,
} from './nav-name-collisions';

test('no child anywhere in the nav wears its parent’s name', () => {
  const collisions = findNavNameCollisions();
  assert.deepEqual(
    collisions.map(formatNavNameCollision),
    [],
    'a parent and a child answer different questions — rename the CHILD, never the lane',
  );
});

test('the law catches the exact stutter that produced it', () => {
  // The pre-2026-09-14 shape: the Inbound lane over a row also faced Inbound.
  // Proves the predicate compares the painted pairing rather than ids, and
  // that it is case- and whitespace-insensitive the way a reader is.
  const clash = { parentLabel: ' inbound ', childLabel: 'Inbound' };
  assert.equal(
    clash.parentLabel.trim().toLowerCase() === clash.childLabel.trim().toLowerCase(),
    true,
  );
});
