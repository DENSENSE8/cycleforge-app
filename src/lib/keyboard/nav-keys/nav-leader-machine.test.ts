/**
 *   node --import tsx --test src/lib/keyboard/nav-keys/nav-leader-machine.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NAV_IDLE, navReduce, type NavMode } from './nav-leader-machine';

const PICK: NavMode = { phase: 'pick' };
const ARMED_RIGHT: NavMode = { phase: 'armed', region: 'right' };

describe('navReduce — leader', () => {
  it('idle + leader → pick, consumed', () => {
    const s = navReduce(NAV_IDLE, { type: 'leader', editable: false });
    assert.deepEqual(s.mode, PICK);
    assert.equal(s.consumed, true);
  });

  it('refuses to arm while a text input is focused (yields the chord)', () => {
    const s = navReduce(NAV_IDLE, { type: 'leader', editable: true });
    assert.deepEqual(s.mode, NAV_IDLE);
    assert.equal(s.consumed, false);
  });

  it('re-arms (restarts to pick) from an armed region', () => {
    const s = navReduce(ARMED_RIGHT, { type: 'leader', editable: false });
    assert.deepEqual(s.mode, PICK);
    assert.equal(s.consumed, true);
  });
});

describe('navReduce — region pick', () => {
  it('pick + available region key → armed(region), consumed', () => {
    const s = navReduce(PICK, { type: 'regionKey', region: 'right', available: true });
    assert.deepEqual(s.mode, ARMED_RIGHT);
    assert.equal(s.consumed, true);
  });

  it('pick + unregistered region → idle, NOT consumed (key passes through)', () => {
    const s = navReduce(PICK, { type: 'regionKey', region: 'left', available: false });
    assert.deepEqual(s.mode, NAV_IDLE);
    assert.equal(s.consumed, false);
  });

  it('pick + unnamed key → idle, NOT consumed', () => {
    const s = navReduce(PICK, { type: 'regionKey', region: null, available: false });
    assert.deepEqual(s.mode, NAV_IDLE);
    assert.equal(s.consumed, false);
  });

  it('a region key while idle does nothing (not consumed)', () => {
    const s = navReduce(NAV_IDLE, { type: 'regionKey', region: 'right', available: true });
    assert.deepEqual(s.mode, NAV_IDLE);
    assert.equal(s.consumed, false);
  });
});

describe('navReduce — commit + cancel', () => {
  it('armed + commit → idle, consumed', () => {
    const s = navReduce(ARMED_RIGHT, { type: 'commit' });
    assert.deepEqual(s.mode, NAV_IDLE);
    assert.equal(s.consumed, true);
  });

  it('cancel from a live session is consumed (owns Escape)', () => {
    assert.equal(navReduce(PICK, { type: 'cancel' }).consumed, true);
    assert.equal(navReduce(ARMED_RIGHT, { type: 'cancel' }).consumed, true);
  });

  it('cancel while idle is a no-op that passes through', () => {
    const s = navReduce(NAV_IDLE, { type: 'cancel' });
    assert.deepEqual(s.mode, NAV_IDLE);
    assert.equal(s.consumed, false);
  });
});
