/**
 * Cycle Forge session receipt — the sentence a hop leaves behind.
 *
 * The Host (Garisek-OS `scripts/session-receipt.ts`) produces this object.
 * The model never writes it. Hash-chain fields are filled by the chain writer
 * (`loop_run_steps:v1`); they are omitted from the digest so filling them
 * cannot circularly hash itself.
 */
import { z } from 'zod';

export const SESSION_RECEIPT_VERSION = 'cf-session:v1' as const;

const OracleTool = z.enum([
  'ds_contract',
  'ds_tokens',
  'ds_critique',
  'find_symbol',
  'impact_analysis',
  'search_code',
]);

const Outcome = z.enum([
  'pass',
  'repair',
  'blocked_for_human',
  'refused',
  'unmeasured',
  'stalled',
]);

const Host = z.enum(['cursor', 'claude-code', 'hermes', 'goal-run', 'perf-overnight']);

const UpgradeKind = z.enum([
  'pin',
  'known_debt_shrink',
  'cohort_row',
  'index_rebuild',
  'grep_to_test',
  'debris_swept',
]);

export const CycleForgeSessionReceiptSchema = z
  .object({
    v: z.literal(SESSION_RECEIPT_VERSION),
    session_id: z.string().min(1),
    run_id: z.string().nullable(),
    goal_id: z.string().nullable(),
    host: Host,
    started_at: z.string().min(1),
    finished_at: z.string().min(1),
    prompt_raw: z.string(),
    prompt_expanded: z.object({
      routes: z.array(
        z.object({
          cohort: z.string(),
          evalCommand: z.string(),
          graphSymbols: z.array(z.string()),
          engineFiles: z.array(z.string()),
          refuse: z.array(z.string()),
          mounts: z.array(z.string()),
        }),
      ),
      unrouted: z.boolean(),
    }),
    oracles_called: z.array(
      z.object({
        tool: OracleTool,
        args_digest: z.string(),
        top_id: z.string().nullable(),
        snapshot: z.string().nullable(),
        at: z.string(),
      }),
    ),
    files_touched: z.array(z.string()),
    files_refused: z.array(
      z.object({
        path: z.string(),
        by: z.enum(['hook', 'router', 'cage']),
        reason: z.string(),
      }),
    ),
    eval_runs: z.array(
      z.object({
        command: z.string(),
        exitCode: z.number().nullable(),
        durationMs: z.number(),
        snapshots: z.array(z.string()),
        ok: z.boolean().nullable(),
      }),
    ),
    outcome: Outcome,
    outcome_sentence: z.string().min(1),
    system_upgrade: z.array(
      z.object({
        kind: UpgradeKind,
        target: z.string(),
        reason: z.string(),
        evidence: z.string(),
      }),
    ),
    law_hash: z.string(),
    prev_hash: z.string().nullable(),
    entry_hash: z.string().nullable(),
  })
  .strict();

export type CycleForgeSessionReceipt = z.infer<typeof CycleForgeSessionReceiptSchema>;

/** Payload the `loop_run_steps:v1` chain hashes — hashes themselves are envelope fields. */
export function chainPayload(
  receipt: CycleForgeSessionReceipt,
): Omit<CycleForgeSessionReceipt, 'prev_hash' | 'entry_hash'> {
  const { prev_hash: _p, entry_hash: _e, ...rest } = receipt;
  return rest;
}

export function parseCycleForgeSessionReceipt(input: unknown): CycleForgeSessionReceipt {
  return CycleForgeSessionReceiptSchema.parse(input);
}

/**
 * Mechanical sentence the operator reads next morning.
 * `<host> did <route.cohort> for goal <id> because <predicate>; <eval> exit <n>; <outcome>`
 */
export function formatOutcomeSentence(input: {
  host: CycleForgeSessionReceipt['host'];
  goal_id: string | null;
  cohort: string | null;
  predicate: string | null;
  evalCommand: string | null;
  evalExit: number | null;
  outcome: CycleForgeSessionReceipt['outcome'];
  /** Parenthetical after the outcome, e.g. `goal already met`. */
  detail?: string;
}): string {
  const cohort = input.cohort ?? 'unrouted';
  const goal = input.goal_id ?? 'none';
  const because = input.predicate ?? input.evalCommand ?? 'none';
  const evalBit =
    input.evalCommand != null
      ? `${input.evalCommand} exit ${input.evalExit ?? 'none'}`
      : 'eval not run';
  const outcome = input.detail ? `${input.outcome} (${input.detail})` : input.outcome;
  return `${input.host} did ${cohort} for goal ${goal} because ${because}; ${evalBit}; ${outcome}`;
}
