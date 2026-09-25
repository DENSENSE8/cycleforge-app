/**
 *   npx tsx --test src/lib/orders-sync/run-steps.test.ts
 *
 * Drives the shipped ledger fold with the event sequences the REAL emitters
 * produce, including the two that break a naive fold: a phase that repeats
 * (bare, then counted), and a lane that finishes having never touched a step.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySyncRunEvent,
  cancelSyncRun,
  completeSyncRunLane,
  createSyncRun,
  syncRunProgress,
  syncRunRowsSeen,
  syncRunSteps,
  type SyncRunLane,
  type SyncRunState,
  type SyncRunStepId,
} from './run-steps';
import type { SyncStreamEvent } from './types';

type Emission = [SyncRunLane, SyncStreamEvent];

function drive(state: SyncRunState, events: Emission[]): SyncRunState {
  return events.reduce((acc, [lane, event]) => applySyncRunEvent(acc, lane, event), state);
}

function step(state: SyncRunState, id: SyncRunStepId) {
  const found = syncRunSteps(state).find((s) => s.id === id);
  assert.ok(found, `no step ${id}`);
  return found;
}

describe('sync run ledger', () => {
  it('accumulates a step count across repeated emissions of the same phase', () => {
    // The ShipStation connector reports its read bare, then again with the count.
    const state = drive(createSyncRun(), [
      ['shipstation', { type: 'phase', phase: 'fetching_shipstation' }],
      ['shipstation', { type: 'phase', phase: 'fetching_shipstation', count: 40 }],
      ['shipstation', { type: 'phase', phase: 'updating', count: 3 }],
      ['shipstation', { type: 'phase', phase: 'updating', count: 9 }],
    ]);
    assert.equal(step(state, 'read_shipstation').count, 40);
    assert.equal(step(state, 'update').count, 12);
    assert.equal(syncRunRowsSeen(state), 40, 'ShipStation orders are the headline');
  });

  it('never drags a finished step back when an earlier phase repeats late', () => {
    const state = drive(createSyncRun(), [
      ['shipstation', { type: 'phase', phase: 'resolving_tracking', count: 4 }],
      ['shipstation', { type: 'phase', phase: 'inserting', count: 20 }],
      ['shipstation', { type: 'phase', phase: 'resolving_tracking', count: 1 }],
    ]);
    assert.equal(step(state, 'insert').state, 'running');
    assert.equal(step(state, 'resolve_tracking').state, 'done');
    assert.equal(step(state, 'resolve_tracking').count, 5);
  });

  it('reports an untouched step on a finished lane as a measured zero', () => {
    let state = createSyncRun(['shipstation']);
    state = drive(state, [['shipstation', { type: 'phase', phase: 'fetching_shipstation', count: 214 }]]);
    state = completeSyncRunLane(state, 'shipstation', { ok: true });
    const update = step(state, 'update');
    assert.equal(update.state, 'done');
    assert.equal(update.count, 0, 'nothing to update is an answer, not a blank');
  });

  it('never fabricates a count for an unmeasured step', () => {
    // `publish` emits no count. Defaulting it to 0 on completion would paint
    // "Publish to the desk — 0 orders" on a run that published plenty.
    let unmeasured = createSyncRun(['shipstation']);
    unmeasured = drive(unmeasured, [['shipstation', { type: 'phase', phase: 'publishing' }]]);
    unmeasured = completeSyncRunLane(unmeasured, 'shipstation', { ok: true });
    assert.equal(step(unmeasured, 'publish').state, 'done');
    assert.equal(step(unmeasured, 'publish').count, undefined);
    // …while a measured step still says zero out loud.
    assert.equal(step(unmeasured, 'insert').count, 0);
  });

  it('counts completed steps, not the index of the step in view (PG6)', () => {
    const state = drive(createSyncRun(), [
      ['shipstation', { type: 'phase', phase: 'fetching_shipstation', count: 10 }],
      ['shipstation', { type: 'phase', phase: 'resolving_tracking', count: 4 }],
    ]);
    const progress = syncRunProgress(state);
    assert.equal(progress.completed, 1, 'read is done, resolve is in flight');
    assert.equal(progress.currentLabel, 'Resolve tracking numbers');
    assert.ok(progress.total >= progress.completed);
  });

  it('counts scanned exceptions from row events', () => {
    const row = { exceptionId: 1, tracking: '1Z' };
    const state = drive(createSyncRun(['exceptions']), [
      ['exceptions', { type: 'phase', phase: 'scanning_exceptions', count: 0 }],
      ['exceptions', { type: 'exception', kind: 'resolved', row }],
      ['exceptions', { type: 'exception', kind: 'open', row: { ...row, exceptionId: 2 } }],
    ]);
    assert.equal(step(state, 'exceptions').count, 2);
  });

  it('settles only when no lane is still running', () => {
    let state = createSyncRun();
    state = completeSyncRunLane(state, 'shipstation', { ok: true });
    assert.equal(state.settled, false, 'the exceptions pass has not answered');
    state = completeSyncRunLane(state, 'exceptions', { ok: true });
    assert.equal(state.settled, true);
    assert.ok(typeof state.endedAt === 'number');
  });

  it('pins a lane error to the step that was in flight', () => {
    let state = drive(createSyncRun(['shipstation']), [
      ['shipstation', { type: 'phase', phase: 'fetching_shipstation', count: 3 }],
      ['shipstation', { type: 'phase', phase: 'inserting', count: 3 }],
    ]);
    state = drive(state, [['shipstation', { type: 'error', error: 'ShipStation 503' }]]);
    assert.equal(step(state, 'insert').state, 'error');
    assert.equal(step(state, 'insert').error, 'ShipStation 503');
    // The read really did finish; a failure downstream must not rewrite it.
    assert.equal(step(state, 'read_shipstation').state, 'done');
    assert.equal(step(state, 'read_shipstation').count, 3);
    assert.equal(state.settled, true);
  });

  it('keeps what already landed when the operator cancels', () => {
    let state = drive(createSyncRun(), [
      ['shipstation', { type: 'phase', phase: 'fetching_shipstation', count: 120 }],
      ['shipstation', { type: 'phase', phase: 'inserting', count: 20 }],
    ]);
    state = cancelSyncRun(state);
    assert.equal(step(state, 'insert').count, 20, 'cancel must not erase what landed');
    // Cancel lands on the IN-FLIGHT step only: ShipStation had moved on to
    // inserting, so its finished read stands.
    assert.equal(step(state, 'insert').state, 'error');
    assert.equal(step(state, 'read_shipstation').state, 'done');
    assert.equal(syncRunRowsSeen(state), 120);
    assert.equal(state.settled, true, 'the queued exceptions pass is cancelled too');
  });

  it('is immutable — a fold returns a new state and leaves the old one intact', () => {
    const first = createSyncRun();
    const second = applySyncRunEvent(first, 'shipstation', {
      type: 'phase',
      phase: 'inserting',
      count: 7,
    });
    assert.notEqual(first, second);
    assert.equal(first.counts.insert, undefined);
    assert.equal(second.counts.insert, 7);
  });
});
