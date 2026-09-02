/**
 * Session receipt schema — Host-produced, never model-authored.
 *
 * Run: node --import tsx --test src/lib/eval/session-receipt.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chainPayload,
  formatOutcomeSentence,
  parseCycleForgeSessionReceipt,
  SESSION_RECEIPT_VERSION,
} from './session-receipt';

const base = {
  v: SESSION_RECEIPT_VERSION,
  session_id: 'goal:cfg_demo:0',
  run_id: 'cfg_demo_1',
  goal_id: 'data-headers-sortable',
  host: 'goal-run' as const,
  started_at: '2026-09-02T00:00:00Z',
  finished_at: '2026-09-02T00:01:00Z',
  prompt_raw: 'sort the image column',
  prompt_expanded: {
    routes: [
      {
        cohort: 'slot-table',
        evalCommand: 'pnpm run eval:cohort slot-table',
        graphSymbols: ['isSlotTableChromeTrack'],
        engineFiles: ['src/lib/tables/slot-table-header-sort.ts'],
        refuse: ['slot-table.sortable-false-on-fact'],
        mounts: [],
      },
    ],
    unrouted: false,
  },
  oracles_called: [],
  files_touched: ['src/utils/queue-display-sort.ts'],
  files_refused: [],
  eval_runs: [
    {
      command: 'pnpm run eval:cohort slot-table',
      exitCode: 0,
      durationMs: 12,
      snapshots: [],
      ok: true,
    },
  ],
  outcome: 'pass' as const,
  outcome_sentence: 'goal-run did slot-table for goal data-headers-sortable because headerSort; pnpm run eval:cohort slot-table exit 0; pass',
  system_upgrade: [],
  law_hash: 'abc',
  prev_hash: null,
  entry_hash: null,
};

describe('session receipt (D7 item 5)', () => {
  it('parses a strict cf-session:v1 object', () => {
    const r = parseCycleForgeSessionReceipt(base);
    assert.equal(r.v, SESSION_RECEIPT_VERSION);
    assert.equal(r.outcome, 'pass');
  });

  it('chainPayload omits hash fields so the writer can fill them', () => {
    const payload = chainPayload({ ...base, prev_hash: 'p', entry_hash: 'e' });
    assert.equal('prev_hash' in payload, false);
    assert.equal('entry_hash' in payload, false);
    assert.equal(payload.session_id, base.session_id);
  });

  it('formatOutcomeSentence matches the operator template', () => {
    const line = formatOutcomeSentence({
      host: 'goal-run',
      goal_id: 'data-headers-sortable',
      cohort: 'slot-table',
      predicate: 'headerSort',
      evalCommand: 'pnpm run eval:cohort slot-table',
      evalExit: 0,
      outcome: 'pass',
    });
    assert.equal(
      line,
      'goal-run did slot-table for goal data-headers-sortable because headerSort; pnpm run eval:cohort slot-table exit 0; pass',
    );
  });

  it('rejects extra keys (strict)', () => {
    assert.throws(() => parseCycleForgeSessionReceipt({ ...base, extra: true }));
  });
});
