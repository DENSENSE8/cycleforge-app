import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_TONE, toneFor } from './goal-chip/goal-chip-shared';
import { isOnWorkOrderSourcePath } from './header-work-order-shared';

describe('toneFor', () => {
  it('treats zero progress as Not started, not Behind', () => {
    const tone = toneFor(0, 0);
    assert.equal(tone.label, 'Not started');
    assert.equal(tone.ring, IDLE_TONE.ring);
  });

  it('marks low progress with scans as Behind', () => {
    const tone = toneFor(10, 1);
    assert.equal(tone.label, 'Behind');
  });

  it('marks completed goals as Hit goal', () => {
    assert.equal(toneFor(100, 10).label, 'Hit goal');
  });
});

describe('isOnWorkOrderSourcePath', () => {
  it('matches exact and nested paths', () => {
    assert.equal(isOnWorkOrderSourcePath('/o/ABC', '/o/ABC'), true);
    assert.equal(isOnWorkOrderSourcePath('/o/ABC/edit', '/o/ABC'), true);
  });

  it('ignores query on sourcePath and does not false-match siblings', () => {
    assert.equal(isOnWorkOrderSourcePath('/o/ABC', '/o/ABC?pending='), true);
    assert.equal(isOnWorkOrderSourcePath('/o/ABCD', '/o/ABC'), false);
    assert.equal(isOnWorkOrderSourcePath('/tech', '/o/ABC'), false);
  });

  it('rejects root or empty source paths', () => {
    assert.equal(isOnWorkOrderSourcePath('/', '/'), false);
    assert.equal(isOnWorkOrderSourcePath('/tech', ''), false);
  });
});
