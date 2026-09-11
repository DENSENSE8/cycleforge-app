import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compoundSlotAgeFace,
  compoundSlotFaceFor,
  compoundSlotInstantFace,
} from './compound-slot-face';

/**
 * The faces the inventory-events cell map used to own, now engine capability.
 * The test exists because the port that added the cell map was rejected for
 * adding it — so the replacement has to be provably the same behaviour, chosen
 * by display type rather than by family.
 */
describe('compound slot faces', () => {
  const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
  const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it('reads a date fact as an age, not an instant', () => {
    assert.equal(compoundSlotAgeFace(at(30_000), NOW), 'just now');
    assert.equal(compoundSlotAgeFace(at(16 * 60_000), NOW), '16m ago');
    assert.equal(compoundSlotAgeFace(at(3 * 3_600_000), NOW), '3h ago');
    assert.equal(compoundSlotAgeFace(at(2 * 86_400_000), NOW), '2d ago');
  });

  it('falls back to the civil day once "Nd ago" stops being actionable', () => {
    const face = compoundSlotAgeFace(at(40 * 86_400_000), NOW);
    assert.ok(face && !face.endsWith('ago'), face ?? 'null');
  });

  it('keeps the absolute instant available as the hover detail', () => {
    const tip = compoundSlotInstantFace('2026-09-02T17:30:00.000Z');
    assert.ok(tip && tip.includes('2026'), tip ?? 'null');
  });

  it('says nothing about a value that is not an instant', () => {
    assert.equal(compoundSlotAgeFace('not a date'), null);
    assert.equal(compoundSlotInstantFace('not a date'), null);
  });

  it('picks the face from the DISPLAY TYPE, never from a field id', () => {
    assert.equal(compoundSlotFaceFor('date'), 'age');
    assert.equal(compoundSlotFaceFor('tag'), 'tag');
    assert.equal(compoundSlotFaceFor('id'), 'code');
    assert.equal(compoundSlotFaceFor('tracking'), 'code');
    assert.equal(compoundSlotFaceFor('text'), 'plain');
    assert.equal(compoundSlotFaceFor('person'), 'person');
    assert.equal(compoundSlotFaceFor(undefined), 'plain');
  });
});
