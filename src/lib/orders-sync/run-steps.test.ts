/**
 *   npx tsx --test src/lib/orders-sync/run-steps.test.ts
 *
 * Drives the shipped ledger fold with the event sequences the REAL emitters
 * produce, including the three that break a naive fold: `updating` twice per
 * lane (deletes + backfills), two lanes interleaving, and a lane that
 * finishes having never touched a step.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySyncRunEvent,
  cancelSyncRun,
  completeSyncRunLane,
  createSyncRun,
  skipSyncRunLane,
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
    // ingest-canonical-orders emits `updating` for deletes AND for backfills.
    const state = drive(createSyncRun(), [
      ['sheets', { type: 'phase', phase: 'updating', count: 3 }],
      ['sheets', { type: 'phase', phase: 'updating', count: 9 }],
    ]);
    assert.equal(step(state, 'update').count, 12);
  });

  it('accumulates the same step across parallel lanes', () => {
    const state = drive(createSyncRun(), [
      ['sheets', { type: 'phase', phase: 'inserting', count: 20 }],
      ['ecwid', { type: 'phase', phase: 'inserting', count: 15 }],
    ]);
    assert.equal(step(state, 'insert').count, 35);
  });

  it('never regresses a finished step when a slower lane arrives late', () => {
    let state = drive(createSyncRun(), [
      ['sheets', { type: 'phase', phase: 'inserting', count: 20 }],
      ['sheets', { type: 'phase', phase: 'publishing' }],
    ]);
    state = completeSyncRunLane(state, 'sheets', { ok: true });
    // Ecwid is still behind: insert is legitimately in flight again, but the
    // SHEET lane's publish must not fall back to pending.
    state = drive(state, [['ecwid', { type: 'phase', phase: 'inserting', count: 5 }]]);
    assert.equal(step(state, 'insert').state, 'running');
    assert.equal(step(state, 'publish').state, 'running', 'ecwid has not published yet');

    state = completeSyncRunLane(state, 'ecwid', { ok: true });
    assert.equal(step(state, 'insert').state, 'done');
    assert.equal(step(state, 'publish').state, 'done');
  });

  it('reports an untouched step on a finished lane as a measured zero', () => {
    let state = createSyncRun(['sheets']);
    state = drive(state, [['sheets', { type: 'phase', phase: 'fetching_sheet', count: 214 }]]);
    state = completeSyncRunLane(state, 'sheets', { ok: true, tabName: 'Sept' });
    const update = step(state, 'update');
    assert.equal(update.state, 'done');
    assert.equal(update.count, 0, 'nothing to update is an answer, not a blank');
    assert.equal(state.tabName, 'Sept');
  });

  it('never fabricates a count for an unmeasured step', () => {
    // `match` and `publish` emit no count. Defaulting them to 0 on completion
    // painted "Match against existing orders — 0 orders", which reads as
    // "matched nothing" on a run that matched plenty.
    let unmeasured = createSyncRun(['sheets']);
    unmeasured = drive(unmeasured, [
      ['sheets', { type: 'phase', phase: 'matching_orders' }],
      ['sheets', { type: 'phase', phase: 'publishing' }],
    ]);
    unmeasured = completeSyncRunLane(unmeasured, 'sheets', { ok: true });
    assert.equal(step(unmeasured, 'match').state, 'done');
    assert.equal(step(unmeasured, 'match').count, undefined);
    assert.equal(step(unmeasured, 'publish').count, undefined);
    // …while a measured step still says zero out loud.
    assert.equal(step(unmeasured, 'insert').count, 0);
  });

  it('marks an unconnected lane skipped and keeps it off the progress board', () => {
    let state = skipSyncRunLane(createSyncRun(), 'ecwid');
    assert.equal(step(state, 'read_ecwid').state, 'skipped');
    state = drive(state, [['ecwid', { type: 'phase', phase: 'inserting', count: 99 }]]);
    assert.equal(step(state, 'insert').count, undefined, 'a skipped lane cannot report counts');

    const before = syncRunProgress(state).total;
    const withEcwid = syncRunProgress(createSyncRun()).total;
    assert.ok(before < withEcwid, 'skipped steps leave the denominator');
  });

  it('counts completed steps, not the index of the step in view (PG6)', () => {
    const state = drive(createSyncRun(['sheets', 'exceptions']), [
      ['sheets', { type: 'phase', phase: 'fetching_sheet', count: 10 }],
      ['sheets', { type: 'phase', phase: 'resolving_tracking', count: 4 }],
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
    let state = createSyncRun(['sheets', 'ecwid']);
    state = completeSyncRunLane(state, 'sheets', { ok: true });
    assert.equal(state.settled, false);
    state = completeSyncRunLane(state, 'ecwid', { ok: true });
    assert.equal(state.settled, true);
    assert.ok(typeof state.endedAt === 'number');
  });

  it('pins a lane error to the step that was in flight', () => {
    let state = drive(createSyncRun(['sheets']), [
      ['sheets', { type: 'phase', phase: 'fetching_sheet', count: 3 }],
      ['sheets', { type: 'phase', phase: 'inserting', count: 3 }],
    ]);
    state = drive(state, [['sheets', { type: 'error', error: 'Sheet API 503' }]]);
    assert.equal(step(state, 'insert').state, 'error');
    assert.equal(step(state, 'insert').error, 'Sheet API 503');
    // The read really did finish; a failure downstream must not rewrite it.
    assert.equal(step(state, 'read_sheet').state, 'done');
    assert.equal(step(state, 'read_sheet').count, 3);
    assert.equal(state.settled, true);
  });

  it('keeps what already landed when the operator cancels', () => {
    let state = drive(createSyncRun(['sheets', 'ecwid']), [
      ['sheets', { type: 'phase', phase: 'fetching_sheet', count: 120 }],
      ['ecwid', { type: 'phase', phase: 'fetching_ecwid', count: 18 }],
      ['sheets', { type: 'phase', phase: 'inserting', count: 20 }],
    ]);
    state = cancelSyncRun(state);
    assert.equal(step(state, 'insert').count, 20, 'cancel must not erase what landed');
    // Cancel lands on each lane's IN-FLIGHT step only. The sheet lane had moved
    // on to inserting, so its finished read stands; the Ecwid lane was still
    // mid-read, so that read is the one that got cut.
    assert.equal(step(state, 'insert').state, 'error');
    assert.equal(step(state, 'read_sheet').state, 'done');
    assert.equal(step(state, 'read_ecwid').state, 'error');
    assert.equal(step(state, 'read_ecwid').count, 18, 'rows read before the cut still count');
    assert.equal(syncRunRowsSeen(state), 138);
  });

  it('is immutable — a fold returns a new state and leaves the old one intact', () => {
    const first = createSyncRun();
    const second = applySyncRunEvent(first, 'sheets', {
      type: 'phase',
      phase: 'inserting',
      count: 7,
    });
    assert.notEqual(first, second);
    assert.equal(first.counts.insert, undefined);
    assert.equal(second.counts.insert, 7);
  });
});
