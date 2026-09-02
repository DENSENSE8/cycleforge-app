/**
 * Goal schema + Host load/branch rules (D7 item 6).
 *
 * Run: node --import tsx --test src/lib/eval/goal.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  classifyGoalFile,
  detectHopAsks,
  hop0Decision,
  isAllowlistedEvalCommand,
  isRunnerInfraFailure,
  nextHopDecision,
  parseCycleForgeGoal,
  readPackageScripts,
  resolveEvalCommand,
  VERIFY_ATTEMPT_CAP,
} from './goal';

const ROOT = join(process.cwd());
const EXAMPLE = join(ROOT, 'docs/eval/goals/data-headers-sortable.goal.json');

describe('CycleForgeGoal (D7 item 6)', () => {
  it('parses data-headers-sortable.goal.json against package.json scripts', () => {
    const raw = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as unknown;
    const scripts = readPackageScripts(ROOT);
    const goal = parseCycleForgeGoal(raw, { scripts });
    assert.equal(goal.id, 'data-headers-sortable');
    assert.equal(goal.createdBy, 'human');
    assert.equal(goal.stopConditions.onUnmeasured, 'block');
    assert.ok(goal.stopConditions.maxRepairs <= VERIFY_ATTEMPT_CAP);
    assert.ok(goal.stopConditions.maxHops <= 12);
    const evals = goal.successPredicates.filter((p) => p.kind === 'eval');
    for (const p of evals) {
      assert.ok(isAllowlistedEvalCommand(p.command, scripts), p.command);
    }
  });

  it('rejects extra keys (strict)', () => {
    const raw = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as Record<string, unknown>;
    assert.throws(() => parseCycleForgeGoal({ ...raw, extra: true }));
  });

  it('rejects createdBy other than human', () => {
    const raw = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as Record<string, unknown>;
    assert.throws(() => parseCycleForgeGoal({ ...raw, createdBy: 'agent' }));
  });

  it('rejects an invented eval script head', () => {
    const raw = JSON.parse(readFileSync(EXAMPLE, 'utf8')) as {
      successPredicates: unknown[];
    };
    const scripts = readPackageScripts(ROOT);
    raw.successPredicates = [{ kind: 'eval', command: 'eval:overlay', expect: 'exit0' }];
    assert.throws(() => parseCycleForgeGoal(raw, { scripts }));
  });

  it('classifyGoalFile: missing HEAD → not committed', () => {
    const r = classifyGoalFile({ headText: null, worktreeText: '{}\n' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, 'missing');
      assert.match(r.message, /not committed/);
    }
  });

  it('classifyGoalFile: dirty vs HEAD → refuse', () => {
    const r = classifyGoalFile({ headText: '{"id":"a"}\n', worktreeText: '{"id":"b"}\n' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, 'dirty');
      assert.equal(r.message, 'goal file dirty; commit it');
    }
  });

  it('classifyGoalFile: HEAD matches worktree → load', () => {
    const json = '{"id":"data-headers-sortable"}\n';
    const r = classifyGoalFile({ headText: json, worktreeText: json });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.json, json);
  });

  it('hop 0 all-green + empty diff short-circuits land.apply', () => {
    const r = hop0Decision({
      unrouted: false,
      allGreen: true,
      diffEmpty: true,
      unmeasured: false,
      repairsLeft: 2,
      onRed: 'repair',
    });
    assert.equal(r.action, 'already_met');
    assert.equal(r.sentence, 'goal already met, nothing to land');
  });

  it('hop 0 unmeasured blocks, does not repair', () => {
    const r = hop0Decision({
      unrouted: false,
      allGreen: false,
      diffEmpty: true,
      unmeasured: true,
      repairsLeft: 2,
      onRed: 'repair',
    });
    assert.equal(r.action, 'unmeasured');
    assert.match(r.sentence, /not repairing/);
  });

  it('resolveEvalCommand expands pnpm scripts to their node body', () => {
    const scripts = readPackageScripts(ROOT);
    const r = resolveEvalCommand('eval:cohort slot-table', scripts);
    assert.equal(r.argv[0], 'node');
    assert.ok(r.argv.includes('tools/eval-ledger/run-cohort-eval.mjs'));
    assert.equal(r.argv[r.argv.length - 1], 'slot-table');
    assert.equal(r.label, 'pnpm run eval:cohort slot-table');
    const unknown = resolveEvalCommand('eval:nope', {});
    assert.deepEqual(unknown.argv.slice(0, 3), ['pnpm', '--config.verify-deps-before-run=false', 'run']);
  });

  it('runner infra failures are unmeasured, not red', () => {
    assert.equal(isRunnerInfraFailure('[ERROR] Command failed with exit code 1: pnpm install'), true);
    assert.equal(isRunnerInfraFailure('ERR_PNPM_OUTDATED_LOCKFILE'), true);
    assert.equal(isRunnerInfraFailure('✖ 3 FAIL rows in the LEDGER'), false);
  });

  it('nextHopDecision: progress resets the streak, three flat hops ask goal.stop', () => {
    const stop = { maxHops: 8, maxHours: 6, maxNoProgressHops: 3, onUnmeasured: 'block' as const, onRed: 'repair' as const, maxRepairs: 2 };
    const base = { diffEmpty: false, elapsedHours: 0.5, stop };
    let d = nextHopDecision({ ...base, hop: 0, measure: { failing: ['a', 'b'], unmeasured: false }, previous: null, noProgressStreak: 0 });
    assert.equal(d.action, 'coder');
    d = nextHopDecision({ ...base, hop: 1, measure: { failing: ['a'], unmeasured: false }, previous: { failing: ['a', 'b'], unmeasured: false }, noProgressStreak: 0 });
    assert.equal(d.action, 'coder');
    assert.equal(d.noProgressStreak, 0);
    let streak = 0;
    let action = '';
    for (let hop = 2; hop <= 4; hop += 1) {
      d = nextHopDecision({ ...base, hop, measure: { failing: ['a'], unmeasured: false }, previous: { failing: ['a'], unmeasured: false }, noProgressStreak: streak });
      streak = d.noProgressStreak;
      action = d.action;
    }
    assert.equal(streak, 3);
    assert.equal(action, 'stop.no_progress');
    d = nextHopDecision({ ...base, hop: 2, measure: { failing: [], unmeasured: false }, previous: { failing: ['a'], unmeasured: false }, noProgressStreak: 0 });
    assert.equal(d.action, 'land.apply');
    d = nextHopDecision({ ...base, hop: 0, diffEmpty: true, measure: { failing: [], unmeasured: false }, previous: null, noProgressStreak: 0 });
    assert.equal(d.action, 'already_met');
    d = nextHopDecision({ ...base, hop: 3, measure: { failing: ['a'], unmeasured: true }, previous: null, noProgressStreak: 0 });
    assert.equal(d.action, 'block.unmeasured');
    d = nextHopDecision({ ...base, hop: 8, measure: { failing: ['a'], unmeasured: false }, previous: { failing: ['b', 'a'], unmeasured: false }, noProgressStreak: 0 });
    assert.equal(d.action, 'stop.max_hops');
  });

  it('detectHopAsks names known_debt.append, cohort.append_row and grep.retire from a diff', () => {
    const diff = [
      'diff --git a/src/lib/tables/slot-table-discover.ts b/src/lib/tables/slot-table-discover.ts',
      '--- a/src/lib/tables/slot-table-discover.ts',
      '+++ b/src/lib/tables/slot-table-discover.ts',
      '@@',
      " export const KNOWN_DEBT = [",
      "+  'hand:orders-grid-legacy',",
      ' ]',
      'diff --git a/src/lib/station/scan-station-overlay-cohort.ts b/src/lib/station/scan-station-overlay-cohort.ts',
      '--- a/src/lib/station/scan-station-overlay-cohort.ts',
      '+++ b/src/lib/station/scan-station-overlay-cohort.ts',
      '@@',
      "+  {",
      "+    id: 'kitting',",
      "+    label: 'Kitting',",
      'diff --git a/src/lib/tables/slot-table-cohort.ts b/src/lib/tables/slot-table-cohort.ts',
      '--- a/src/lib/tables/slot-table-cohort.ts',
      '+++ b/src/lib/tables/slot-table-cohort.ts',
      '@@',
      '-  headerClickUsesIsSortable: /layout\\.isSortable\\(column\\.key\\)/,',
      '',
    ].join('\n');
    const asks = detectHopAsks(diff, ['src/lib/tables/slot-table-discover.ts', 'src/lib/station/scan-station-overlay-cohort.ts', 'src/lib/tables/slot-table-cohort.ts', 'src/design-system/components/grid/LedgerGridColumnHeader.test.ts']);
    assert.deepEqual(asks.map((a) => a.kind), ['known_debt.append', 'cohort.append_row', 'grep.retire']);
    assert.equal(asks[0]!.recommendation, 'no');
    assert.equal(asks[1]!.recommendation, 'no');
    assert.equal(asks[2]!.recommendation, 'yes');
    assert.match(asks[2]!.summary, /headerClickUsesIsSortable/);
    const noTest = detectHopAsks(diff, ['src/lib/tables/slot-table-cohort.ts']);
    assert.equal(noTest.find((a) => a.kind === 'grep.retire')!.recommendation, 'no');
    assert.deepEqual(detectHopAsks('', []), []);
  });
});
