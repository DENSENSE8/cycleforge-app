/**
 * Cycle Forge goal object — human-authored JSON, Host-validated.
 *
 * The Host loads `docs/eval/goals/<id>.goal.json` from HEAD (`git show`), never
 * from a dirty working tree. Agents never commit, so a worktree-only file is
 * invisible. Zod `.strict()` so extra keys fail closed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { discoverSlotTable } from '@/lib/tables/slot-table-discover';

export const GOAL_SCHEMA_ID = 'cf-goal:v1' as const;

/** First token of an eval predicate — must be a `package.json` `scripts` key. */
export const ALLOWED_EVAL_SCRIPT_HEADS = [
  'eval:cohort',
  'eval:station',
  'eval:discover',
  'eval:perf-gate',
  'verify:fast',
  'verify',
] as const;

export const VERIFY_ATTEMPT_CAP = 3;
export const MAX_HOPS_CAP = 12;

const EvalPredicate = z
  .object({
    kind: z.literal('eval'),
    command: z.string().min(1),
    expect: z.literal('exit0'),
  })
  .strict();

const InvariantPredicate = z
  .object({
    kind: z.literal('invariant'),
    keepIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

const RouterPredicate = z
  .object({
    kind: z.literal('router'),
    refuse: z.array(z.string().min(1)).min(1),
  })
  .strict();

const TestPredicate = z
  .object({
    kind: z.literal('test'),
    file: z.string().regex(/^src\/.+\.test\.ts$/),
  })
  .strict();

const SuccessPredicate = z.discriminatedUnion('kind', [
  EvalPredicate,
  InvariantPredicate,
  RouterPredicate,
  TestPredicate,
]);

const StopConditions = z
  .object({
    maxHops: z.number().int().min(1).max(MAX_HOPS_CAP),
    maxHours: z.number().positive(),
    maxNoProgressHops: z.number().int().min(1),
    onUnmeasured: z.literal('block'),
    onRed: z.enum(['repair', 'block']),
    maxRepairs: z.number().int().min(0).max(VERIFY_ATTEMPT_CAP),
  })
  .strict();

export const CycleForgeGoalSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    statement: z.string().min(8),
    createdBy: z.literal('human'),
    createdAt: z.string().min(1),
    successPredicates: z.array(SuccessPredicate).min(1),
    stopConditions: StopConditions,
    budget: z.object({ maxCostUsd: z.number().nonnegative().optional() }).strict(),
    routerHint: z.string().min(1).optional(),
  })
  .strict();

export type CycleForgeGoal = z.infer<typeof CycleForgeGoalSchema>;
export type SuccessPredicate = CycleForgeGoal['successPredicates'][number];

export function evalCommandHead(command: string): string {
  return command.trim().split(/\s+/)[0] ?? '';
}

export function evalCommandArgs(command: string): string[] {
  return command.trim().split(/\s+/).slice(1);
}

export function readPackageScripts(repoRoot: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

export function isAllowlistedEvalCommand(
  command: string,
  scripts: Record<string, string>,
): boolean {
  const head = evalCommandHead(command);
  return Boolean(scripts[head]) && (ALLOWED_EVAL_SCRIPT_HEADS as readonly string[]).includes(head);
}

export function parseCycleForgeGoal(
  input: unknown,
  opts?: { scripts?: Record<string, string> },
): CycleForgeGoal {
  const goal = CycleForgeGoalSchema.parse(input);
  const scripts = opts?.scripts;
  if (scripts) {
    for (const p of goal.successPredicates) {
      if (p.kind !== 'eval') continue;
      if (!isAllowlistedEvalCommand(p.command, scripts)) {
        throw new Error(
          `eval command "${p.command}" is not a package.json scripts key (head must be one of ${ALLOWED_EVAL_SCRIPT_HEADS.join(', ')})`,
        );
      }
    }
  }
  if (goal.stopConditions.maxRepairs > VERIFY_ATTEMPT_CAP) {
    throw new Error(`maxRepairs ${goal.stopConditions.maxRepairs} exceeds VERIFY_ATTEMPT_CAP ${VERIFY_ATTEMPT_CAP}`);
  }
  return goal;
}

export type GoalFileStatus =
  | { ok: true; json: string }
  | { ok: false; reason: 'missing' | 'dirty'; message: string };

/**
 * HEAD is the only source. Worktree-only → missing. HEAD vs worktree differ → dirty.
 */
export function classifyGoalFile(input: {
  headText: string | null;
  worktreeText: string | null;
}): GoalFileStatus {
  if (input.headText == null || input.headText.trim() === '') {
    return {
      ok: false,
      reason: 'missing',
      message: 'goal file not committed; commit it',
    };
  }
  const head = input.headText.replace(/\r\n/g, '\n');
  const work = (input.worktreeText ?? '').replace(/\r\n/g, '\n');
  if (work.trim() !== '' && work !== head) {
    return { ok: false, reason: 'dirty', message: 'goal file dirty; commit it' };
  }
  return { ok: true, json: head };
}

export type Hop0Action = 'already_met' | 'land.apply' | 'repair' | 'block' | 'refused' | 'unmeasured';

export function hop0Decision(input: {
  unrouted: boolean;
  allGreen: boolean;
  diffEmpty: boolean;
  unmeasured: boolean;
  repairsLeft: number;
  onRed: 'repair' | 'block';
}): { action: Hop0Action; sentence: string } {
  if (input.unrouted) {
    return { action: 'refused', sentence: 'unrouted statement; Host will not guess' };
  }
  if (input.unmeasured) {
    return { action: 'unmeasured', sentence: 'unmeasured — blocking, not repairing' };
  }
  if (input.allGreen && input.diffEmpty) {
    return {
      action: 'already_met',
      sentence: 'goal already met, nothing to land',
    };
  }
  if (input.allGreen && !input.diffEmpty) {
    return { action: 'land.apply', sentence: 'predicates green; enqueue land.apply' };
  }
  if (input.onRed === 'repair' && input.repairsLeft > 0) {
    return { action: 'repair', sentence: 'predicates red; repair hop' };
  }
  return { action: 'block', sentence: 'predicates red; repairs exhausted — block' };
}

export function checkKeepIds(
  keepIds: readonly string[],
  repoRoot = process.cwd(),
): { ok: boolean; missing: string[] } {
  const report = discoverSlotTable(repoRoot);
  const have = new Set(report.keep.map((k) => k.id));
  const missing = keepIds.filter((id) => !have.has(id));
  return { ok: missing.length === 0, missing };
}

export function goalRelPath(id: string): string {
  return `docs/eval/goals/${id}.goal.json`;
}

/**
 * How the Host invokes an eval predicate. `pnpm run <script>` is expanded to
 * the script body from package.json so the runner is not hostage to pnpm's
 * pre-run dependency check (pnpm 10+ tries `pnpm install` when the modules
 * dir disagrees with the lockfile and exits 1 — which reads as a red eval).
 * A body with shell syntax falls back to `bash -c`. Pure.
 */
export function resolveEvalCommand(
  command: string,
  scripts: Record<string, string>,
): { argv: string[]; label: string } {
  const head = evalCommandHead(command);
  const args = evalCommandArgs(command);
  const body = scripts[head];
  const label = `pnpm run ${command.trim()}`;
  if (!body) return { argv: ['pnpm', '--config.verify-deps-before-run=false', 'run', head, ...args], label };
  const simple = /^[\w./@:=+-]+(\s+[\w./@:=+-]+)*$/.test(body.trim());
  if (simple) return { argv: [...body.trim().split(/\s+/), ...args], label };
  return { argv: ['bash', '-c', `${body} ${args.map((a) => JSON.stringify(a)).join(' ')}`.trim()], label };
}

/**
 * Runner infrastructure never ran the eval → not a measurement (G6). The
 * Host records `unmeasured` and blocks; it never repairs on these.
 */
export const RUNNER_INFRA_PATTERNS: readonly RegExp[] = [
  /ERR_PNPM_/,
  /Command failed with exit code \d+: pnpm install/,
  /confirmModulesPurge/,
  /command not found/,
  /spawn \S+ ENOENT/,
  /Cannot find module '(?:tsx|zod)'/,
];

export function isRunnerInfraFailure(output: string): boolean {
  return RUNNER_INFRA_PATTERNS.some((re) => re.test(output));
}

export type HopMeasure = { failing: string[]; unmeasured: boolean };

export type NextHopAction =
  | 'land.apply'
  | 'already_met'
  | 'coder'
  | 'stop.no_progress'
  | 'stop.max_hops'
  | 'stop.max_hours'
  | 'block.unmeasured';

/**
 * Host decision after a measured hop (D1 stop conditions). Progress = fewer
 * failing predicates than the previous hop. Pure; the Host owns the loop.
 */
export function nextHopDecision(input: {
  hop: number;
  measure: HopMeasure;
  previous: HopMeasure | null;
  noProgressStreak: number;
  diffEmpty: boolean;
  elapsedHours: number;
  stop: CycleForgeGoal['stopConditions'];
}): { action: NextHopAction; noProgressStreak: number; sentence: string } {
  const { measure, previous, stop } = input;
  if (measure.unmeasured) {
    return { action: 'block.unmeasured', noProgressStreak: input.noProgressStreak, sentence: 'unmeasured — blocking, not repairing' };
  }
  if (measure.failing.length === 0) {
    return input.diffEmpty
      ? { action: 'already_met', noProgressStreak: 0, sentence: 'goal already met, nothing to land' }
      : { action: 'land.apply', noProgressStreak: 0, sentence: 'predicates green; ask land.apply' };
  }
  const progressed = previous == null ? false : measure.failing.length < previous.failing.length;
  const streak = previous == null ? 0 : progressed ? 0 : input.noProgressStreak + 1;
  if (streak >= stop.maxNoProgressHops) {
    return { action: 'stop.no_progress', noProgressStreak: streak, sentence: `${streak} hops without progress; ask goal.stop` };
  }
  if (input.elapsedHours >= stop.maxHours) {
    return { action: 'stop.max_hours', noProgressStreak: streak, sentence: `maxHours ${stop.maxHours} reached; ask goal.stop` };
  }
  if (input.hop >= stop.maxHops) {
    return { action: 'stop.max_hops', noProgressStreak: streak, sentence: `maxHops ${stop.maxHops} reached; ask goal.stop` };
  }
  return {
    action: 'coder',
    noProgressStreak: streak,
    sentence: `${measure.failing.length} predicate(s) red (${measure.failing.join(', ')}); coder hop ${input.hop + 1}`,
  };
}

/**
 * Asks a coder hop can earn (§D2). Pure: the Host hands in the unified diff
 * of the worktree and the touched paths; this names the typed ask, the file
 * to revert on `reject`, and a one-line summary. Nothing here reads disk.
 *
 * - `known_debt.append`   — KNOWN_DEBT grew in slot-table-discover.ts (default no)
 * - `cohort.append_row`   — a new member row in a cohort module
 * - `grep.retire`         — a `*_CONTRACT` regex row deleted while a `.test.ts` was added
 */
export type HopAskKind = 'known_debt.append' | 'cohort.append_row' | 'grep.retire';

export type HopAsk = {
  kind: HopAskKind;
  file: string;
  summary: string;
  recommendation: 'yes' | 'no';
  /** On reject the Host reverts these paths in the worktree and re-measures. */
  revert: string[];
};

const COHORT_FILES = [
  'src/lib/tables/slot-table-cohort.ts',
  'src/lib/keyboard/shortcut-display-cohort.ts',
  'src/lib/station/scan-station-overlay-cohort.ts',
] as const;

const KNOWN_DEBT_FILE = 'src/lib/tables/slot-table-discover.ts';

/** Split a unified diff into `{ file, added, removed }` hunks per path. */
export function splitUnifiedDiff(diff: string): Array<{ file: string; added: string[]; removed: string[] }> {
  const out: Array<{ file: string; added: string[]; removed: string[] }> = [];
  let cur: { file: string; added: string[]; removed: string[] } | null = null;
  for (const line of diff.split('\n')) {
    const m = /^\+\+\+ b\/(.+)$/.exec(line);
    if (m) {
      cur = { file: m[1]!, added: [], removed: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) cur.added.push(line.slice(1));
    else if (line.startsWith('-') && !line.startsWith('---')) cur.removed.push(line.slice(1));
  }
  return out;
}

export function detectHopAsks(diff: string, filesTouched: readonly string[]): HopAsk[] {
  const hunks = splitUnifiedDiff(diff);
  const asks: HopAsk[] = [];
  const addedTests = filesTouched.filter((p) => /\.test\.ts$/.test(p));

  for (const h of hunks) {
    if (h.file === KNOWN_DEBT_FILE && h.added.some((l) => /^\s*'[a-z-]+:[^']+',?\s*$/.test(l) || /KNOWN_DEBT/.test(l))) {
      const rows = h.added.filter((l) => /^\s*'[a-z-]+:[^']+',?\s*$/.test(l)).map((l) => l.trim().replace(/,$/, ''));
      if (rows.length > 0) {
        asks.push({
          kind: 'known_debt.append',
          file: h.file,
          summary: `KNOWN_DEBT grew by ${rows.length}: ${rows.slice(0, 3).join(', ')}`,
          recommendation: 'no',
          revert: [h.file],
        });
      }
    }
    if ((COHORT_FILES as readonly string[]).includes(h.file)) {
      const newRows = h.added.filter((l) => /^\s*\{?\s*(id|tableId):\s*['"][^'"]+['"]/.test(l));
      if (newRows.length > 0) {
        asks.push({
          kind: 'cohort.append_row',
          file: h.file,
          summary: `${h.file} gains ${newRows.length} member row(s): ${newRows.map((l) => l.trim()).slice(0, 2).join(' | ')}`,
          recommendation: 'no',
          revert: [h.file],
        });
      }
      const removedGreps = h.removed.filter((l) => /^\s*[A-Za-z]+:\s*\/.+\/[a-z]*,?\s*$/.test(l)).map((l) => l.trim().split(':')[0]!);
      if (removedGreps.length > 0) {
        asks.push({
          kind: 'grep.retire',
          file: h.file,
          summary: `${removedGreps.join(', ')} deleted from ${h.file}${addedTests.length ? ` alongside ${addedTests.join(', ')}` : ' with NO new .test.ts'}`,
          recommendation: addedTests.length > 0 ? 'yes' : 'no',
          revert: [h.file],
        });
      }
    }
  }
  return asks;
}
