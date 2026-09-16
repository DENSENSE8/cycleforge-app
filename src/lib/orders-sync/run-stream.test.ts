/**
 *   npx tsx --test src/lib/orders-sync/run-stream.test.ts
 *
 * The claim this file defends: the "Demo sync" button and the real
 * `Accept: application/x-ndjson` sync produce the SAME ledger (operator
 * 2026-09-15 — "when I press the input button that's real it would display
 * exactly the same").
 *
 * It proves it the only way that cannot rot: replay the demo script as actual
 * NDJSON through the shipped `streamNdjson` client, fold it with the shipped
 * `applySyncRunEvent`, and compare against the demo driver's own fold. If the
 * two paths ever diverge — a client that drops `detail` lines, a lane that is
 * folded differently — this fails.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { streamNdjson } from './client';
import { DEMO_RUN_SCRIPT } from './demo-run';
import {
  applySyncRunEvent,
  completeSyncRunLane,
  createSyncRun,
  syncRunProgress,
  syncRunRowsSeen,
  syncRunSteps,
  type SyncRunLane,
  type SyncRunState,
} from './run-steps';
import type { SyncStreamEvent } from './types';

const LANES: readonly SyncRunLane[] = ['sheets', 'ecwid', 'exceptions'];

function ndjsonResponse(events: SyncStreamEvent[]): Response {
  return new Response(events.map((e) => JSON.stringify(e)).join('\n'), {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

/** The demo driver's fold: script beats applied directly, in order. */
function foldDirect(): SyncRunState {
  let state = createSyncRun(LANES);
  for (const beat of DEMO_RUN_SCRIPT) {
    state = applySyncRunEvent(state, beat.lane, beat.event);
  }
  return state;
}

/** The production fold: the same events, over the wire, per lane. */
async function foldOverTheWire(): Promise<SyncRunState> {
  let state = createSyncRun(LANES);
  for (const lane of LANES) {
    const events = DEMO_RUN_SCRIPT.filter((beat) => beat.lane === lane).map((beat) => beat.event);
    await streamNdjson<SyncStreamEvent>(
      `/api/integrations/${lane}/sync`,
      { method: 'POST', headers: { Accept: 'application/x-ndjson' } },
      {
        batchSize: 3,
        fetch: async () => ndjsonResponse(events),
        yieldToInput: async () => undefined,
        onBatch: (batch) => {
          for (const event of batch) state = applySyncRunEvent(state, lane, event);
        },
      },
    );
  }
  return state;
}

describe('demo run ≡ streamed run', () => {
  it('folds to the same ledger over NDJSON as it does in the driver', async () => {
    const direct = syncRunSteps(foldDirect());
    const streamed = syncRunSteps(await foldOverTheWire());
    assert.deepEqual(streamed, direct);
  });

  it('reports the numbers the surface paints', async () => {
    const state = await foldOverTheWire();
    const steps = syncRunSteps(state);
    const count = (id: string) => steps.find((step) => step.id === id)?.count;
    assert.equal(count('read_sheet'), 214);
    assert.equal(count('read_ecwid'), 18);
    assert.equal(count('resolve_tracking'), 57, '51 sheet + 6 ecwid');
    assert.equal(count('update'), 12, 'deletes 3 + backfills 9');
    assert.equal(count('insert'), 39, '35 sheet + 4 ecwid');
    assert.equal(count('exceptions'), 4);
    assert.equal(syncRunRowsSeen(state), 232);
    const progress = syncRunProgress(state);
    assert.equal(progress.completed, progress.total, 'every lane reported done');
  });

  it('surfaces a transport failure as an error event on the run', async () => {
    // A 403 (plan ceiling, missing permission) is JSON, not NDJSON — the client
    // turns it into one `error` line, which settles the lane instead of leaving
    // a spinner up forever.
    let state = createSyncRun(['sheets']);
    await streamNdjson<SyncStreamEvent>(
      '/api/integrations/google_sheets/sync',
      { method: 'POST' },
      {
        fetch: async () => new Response('{"error":"PLAN_LIMIT"}', { status: 403 }),
        yieldToInput: async () => undefined,
        onBatch: (batch) => {
          for (const event of batch) state = applySyncRunEvent(state, 'sheets', event);
        },
      },
    );
    assert.equal(state.settled, true);
    assert.equal(state.lanes.sheets.status, 'error');
  });

  it('holds the ledger open until every lane has reported', async () => {
    let state = createSyncRun(LANES);
    state = applySyncRunEvent(state, 'sheets', { type: 'phase', phase: 'fetching_sheet', count: 5 });
    state = completeSyncRunLane(state, 'sheets', { ok: true });
    assert.equal(state.settled, false, 'ecwid + exceptions have not answered');
  });
});
