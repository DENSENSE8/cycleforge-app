import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetActiveSessionForTests,
  clearActiveSession,
  getActiveSession,
  getArmedScanSession,
  isSameSession,
  setActiveSession,
  subscribeActiveSession,
  updateActiveSession,
  type ActiveSession,
} from './store';

const unbox: ActiveSession = {
  id: 'scan:unbox:1',
  kind: 'scan',
  scanType: 'unbox',
  title: 'Unbox',
};

const packing: ActiveSession = {
  id: 'scan:packing:1',
  kind: 'scan',
  scanType: 'packing',
  title: 'Pack',
};

const task: ActiveSession = {
  id: 'task:count:9',
  kind: 'task',
  title: 'Cycle count',
};

describe('active-session store', () => {
  beforeEach(() => {
    __resetActiveSessionForTests();
  });

  it('is empty until a surface publishes', () => {
    assert.equal(getActiveSession(), null);
    assert.equal(getArmedScanSession(), null);
  });

  it('arming a second scan session disarms the first', () => {
    // The whole scan-ownership model: one slot, so there is no race to win.
    setActiveSession(unbox);
    setActiveSession(packing);
    assert.equal(getArmedScanSession()?.scanType, 'packing');
  });

  it('a task session arms no scan', () => {
    setActiveSession(unbox);
    setActiveSession(task);
    assert.equal(getActiveSession()?.id, 'task:count:9');
    assert.equal(getArmedScanSession(), null);
  });

  it('re-publishing field-identical data does not emit', () => {
    let emits = 0;
    subscribeActiveSession(() => {
      emits += 1;
    });
    setActiveSession(unbox);
    // A fresh object literal with the same values — what a parent re-render
    // hands the publish hook every time.
    setActiveSession({ ...unbox, entity: { type: 'carton', id: '7', label: 'AB12' } });
    setActiveSession({ ...unbox, entity: { type: 'carton', id: '7', label: 'AB12' } });
    assert.equal(emits, 2);
  });

  it('clear only fires for the session that owns the slot', () => {
    setActiveSession(unbox);
    // A stale unmount from the session that already handed off.
    clearActiveSession('scan:packing:1');
    assert.equal(getActiveSession()?.id, 'scan:unbox:1');
    clearActiveSession('scan:unbox:1');
    assert.equal(getActiveSession(), null);
  });

  it('updates patch the live session without restating identity', () => {
    setActiveSession(unbox);
    updateActiveSession('scan:unbox:1', {
      status: { label: 'Scanning', tone: 'green', progress: 0.5 },
    });
    const live = getActiveSession();
    assert.equal(live?.kind, 'scan');
    assert.equal(live?.status?.label, 'Scanning');
    assert.equal(live?.status?.progress, 0.5);
    // Identity survived the patch.
    assert.equal(live?.id, 'scan:unbox:1');
    assert.equal(getArmedScanSession()?.scanType, 'unbox');
  });

  it('a background session cannot narrate over the focused one', () => {
    setActiveSession(unbox);
    updateActiveSession('task:count:9', { title: 'Hijacked' });
    assert.equal(getActiveSession()?.title, 'Unbox');
  });

  it('value equality covers nested entity and status', () => {
    const a: ActiveSession = {
      ...unbox,
      entity: { type: 'carton', id: '7', label: 'AB12' },
      status: { label: 'Open', tone: 'blue' },
    };
    const b: ActiveSession = {
      ...unbox,
      entity: { type: 'carton', id: '7', label: 'AB12' },
      status: { label: 'Open', tone: 'blue' },
    };
    assert.equal(isSameSession(a, b), true);
    assert.equal(
      isSameSession(a, { ...b, status: { label: 'Open', tone: 'red' } }),
      false,
    );
    assert.equal(isSameSession(a, null), false);
  });
});
