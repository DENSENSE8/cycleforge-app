/**
 * Import recorder — persists one import run per org as `order_import_runs` →
 * `order_import_run_steps` → `order_import_run_rows` (handoff
 * `docs/design-system/HANDOFF-import-history.md` §3–4).
 *
 * The run is opened as `running` before the first step, each step lands with
 * its counts and the rows its writer emitted (`SyncOutcome.importRows`,
 * stamped with the step as `source`), and the run closes as `success`,
 * `partial` (some step failed), or `failed` (every step failed, or the body
 * threw). Observability never breaks the sync: every persistence failure is
 * logged and swallowed. DB access lives behind {@link ImportRecordDeps}
 * (`import-record-load.ts`), so this module stays DB-free.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { SyncOutcome } from '@/lib/integrations/connectors/types';
import type {
  ImportRowOutcome,
  ImportRowRecord,
  ImportRunKind,
  ImportRunStatus,
  ImportRunTrigger,
  ImportStepCounts,
} from '@/lib/imports/types';

/** Who / what drove the run. */
export interface ImportRunMeta {
  kind: ImportRunKind;
  trigger: ImportRunTrigger;
  /** Manual runs: the operator (`ctx.staffId`). */
  staffId: number | null;
  /** The `cron_runs` row that drove it, when one did. */
  cronRunId: number | null;
}

/** One finished step as the caller saw it. */
export interface ImportStepInput {
  /** Provider id or `exceptions`; stamped as each row's `source`. */
  step: string;
  ok: boolean;
  error?: string | null;
  /** The step's own totals — the counts when it emitted no rows. */
  imported?: number;
  updated?: number;
  rows?: ImportRowRecord[];
  startedAt: Date;
  finishedAt: Date;
}

export interface ImportStepWrite {
  step: string;
  ok: boolean;
  counts: ImportStepCounts;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export interface ImportRunFinish {
  status: Exclude<ImportRunStatus, 'running'>;
  counts: Record<string, ImportStepCounts>;
  error: string | null;
}

export interface ImportRecordDeps {
  /** Insert the `running` run row; returns its id. */
  insertRun(orgId: OrgId, meta: ImportRunMeta): Promise<number>;
  /** Insert the step row and all its rows (source = step) in one transaction. */
  insertStep(orgId: OrgId, runId: number, step: ImportStepWrite, rows: readonly ImportRowRecord[]): Promise<void>;
  /** Close the run: status, per-step counts, error, finished_at / duration. */
  finishRun(orgId: OrgId, runId: number, finish: ImportRunFinish): Promise<void>;
  /** Swallowed persistence failures land here. */
  warn(message: string, detail: Record<string, unknown>): void;
}

export interface ImportRunRecorder {
  /** `order_import_runs.id`; null when the run row could not be written. */
  readonly runId: number | null;
  step(input: ImportStepInput): Promise<void>;
  /** Close from the recorded steps (success / partial / failed). */
  finish(): Promise<void>;
  /** Close as `failed` — the run's body threw. */
  fail(error: unknown): Promise<void>;
}

export const EMPTY_STEP_COUNTS: Readonly<ImportStepCounts> = Object.freeze({
  imported: 0,
  updated: 0,
  trackingFilled: 0,
  ambiguous: 0,
  skipped: 0,
  failed: 0,
});

/** Which step counter each row outcome feeds; `unchanged` feeds none. */
const OUTCOME_COUNTERS: Record<ImportRowOutcome, ReadonlyArray<keyof ImportStepCounts>> = {
  inserted: ['imported'],
  backfilled: ['updated'],
  adopted: ['updated'],
  claimed: ['updated'],
  tracking_filled: ['updated', 'trackingFilled'],
  unchanged: [],
  ambiguous: ['ambiguous'],
  quarantined: ['ambiguous'],
  skipped: ['skipped'],
  failed: ['failed'],
};

/**
 * A step's counts: derived from its rows when it emitted any (an `unchanged`
 * row counts in nothing), else the step's own imported / updated totals.
 */
export function deriveStepCounts(
  input: Pick<ImportStepInput, 'rows' | 'imported' | 'updated'>,
): ImportStepCounts {
  const counts: ImportStepCounts = { ...EMPTY_STEP_COUNTS };
  if (!input.rows || input.rows.length === 0) {
    counts.imported = input.imported ?? 0;
    counts.updated = input.updated ?? 0;
    return counts;
  }
  for (const row of input.rows) {
    for (const key of OUTCOME_COUNTERS[row.outcome] ?? []) counts[key] += 1;
  }
  return counts;
}

/** success = every step ok · failed = none ok · partial = in between. */
export function importRunStatus(steps: ReadonlyArray<{ ok: boolean }>): ImportRunFinish['status'] {
  const failed = steps.filter((s) => !s.ok).length;
  if (failed === 0) return 'success';
  return failed === steps.length ? 'failed' : 'partial';
}

/** One line naming every failed step — the run's `error`, the header's message. */
export function failedStepsLine(steps: ReadonlyArray<{ step: string; ok: boolean; error?: string | null }>): string {
  return steps
    .filter((s) => !s.ok)
    .map((s) => `${s.step}: ${s.error || 'failed'}`)
    .join(' · ');
}

/** `sheets_full` for the Google Sheets history pass, else `provider`. */
export function providerRunKind(provider: string, full: boolean | undefined): ImportRunKind {
  return provider === 'google_sheets' && full ? 'sheets_full' : 'provider';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Open a run (`running`). Never throws; a failed insert yields a no-op recorder. */
export async function startImportRun(
  orgId: OrgId,
  meta: ImportRunMeta,
  deps: ImportRecordDeps,
): Promise<ImportRunRecorder> {
  let runId: number | null = null;
  try {
    runId = await deps.insertRun(orgId, meta);
  } catch (error) {
    deps.warn('import record: run insert failed', { orgId, kind: meta.kind, error: errorMessage(error) });
  }

  const steps: ImportStepWrite[] = [];
  let closed = false;

  const close = async (finish: ImportRunFinish) => {
    if (closed || runId == null) return;
    closed = true;
    try {
      await deps.finishRun(orgId, runId, finish);
    } catch (error) {
      deps.warn('import record: run finish failed', { orgId, runId, error: errorMessage(error) });
    }
  };

  const countsByStep = () => Object.fromEntries(steps.map((s) => [s.step, s.counts]));

  return {
    runId,
    async step(input) {
      const write: ImportStepWrite = {
        step: input.step,
        ok: input.ok,
        counts: deriveStepCounts(input),
        error: input.ok ? null : input.error || 'failed',
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      };
      steps.push(write);
      if (runId == null || closed) return;
      try {
        await deps.insertStep(orgId, runId, write, input.rows ?? []);
      } catch (error) {
        deps.warn('import record: step insert failed', {
          orgId,
          runId,
          step: input.step,
          rows: input.rows?.length ?? 0,
          error: errorMessage(error),
        });
      }
    },
    finish() {
      const status = importRunStatus(steps);
      return close({ status, counts: countsByStep(), error: status === 'success' ? null : failedStepsLine(steps) });
    },
    fail(error) {
      const failedSteps = failedStepsLine(steps);
      const message = errorMessage(error);
      return close({
        status: 'failed',
        counts: countsByStep(),
        error: failedSteps.includes(message) ? failedSteps : [failedSteps, message].filter(Boolean).join(' · '),
      });
    },
  };
}

/**
 * One provider sync as its own run (`POST /api/integrations/[provider]/sync`):
 * open, sync, record the one step with its rows, close. The sync's outcome or
 * error passes through untouched.
 */
export async function recordProviderSync(
  orgId: OrgId,
  provider: string,
  meta: ImportRunMeta,
  sync: () => Promise<SyncOutcome>,
  deps: ImportRecordDeps,
): Promise<SyncOutcome> {
  const recorder = await startImportRun(orgId, meta, deps);
  const startedAt = new Date();
  let outcome: SyncOutcome;
  try {
    outcome = await sync();
  } catch (error) {
    await recorder.step({ step: provider, ok: false, error: errorMessage(error), startedAt, finishedAt: new Date() });
    await recorder.fail(error);
    throw error;
  }
  await recorder.step({
    step: provider,
    ok: outcome.ok,
    error: outcome.error,
    imported: outcome.imported,
    updated: outcome.updated,
    rows: outcome.importRows,
    startedAt,
    finishedAt: new Date(),
  });
  await recorder.finish();
  return outcome;
}

/** Above this many rows a response drops `importRows` — the record holds them. */
export const IMPORT_ROWS_RESPONSE_CAP = 500;

/** The outcome as a response body: `importRows` kept only while small. */
export function importRowsCappedOutcome(outcome: SyncOutcome): SyncOutcome {
  if (!outcome.importRows || outcome.importRows.length <= IMPORT_ROWS_RESPONSE_CAP) return outcome;
  const rest = { ...outcome };
  delete rest.importRows;
  return rest;
}
