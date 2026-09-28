/**
 * Orders backfill pipeline — every linked order source for one org, in
 * dependency order, as one run (owner 2026-09-28: "overall back fill to orders
 * all at once"):
 *
 *   1. ShipStation   — imports the week's orders + label history (tracking).
 *   2. Google Sheets — the legacy daily sheet backfills those orders (fill
 *                      blanks) and inserts the sales ShipStation never saw.
 *   3. Other linked order channels (Square, Shopify, …).
 *   4. Exceptions    — open scan exceptions re-matched against what landed.
 *
 * Each step completes before the next starts, so the sheet adopts rows
 * ShipStation just wrote instead of racing it. One step failing never stops
 * the rest — the next source may still land, and the result names the step.
 * Driven by `/api/cron/orders/backfill` (every org) and the header Sync
 * (caller's org). The To-ship CTA runs the same order client-side for its
 * live ledger (`useOrdersSync`).
 *
 * Every run is recorded as one import run (`order_import_runs` → steps →
 * per-order rows, `import-record.ts`). The rows go to the record only — the
 * returned result (and so `cron_runs.summary`) stays counts-only.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { SyncOpts, SyncOutcome } from '@/lib/integrations/connectors/types';
import type { ImportRunTrigger } from '@/lib/imports/types';
import { failedStepsLine, type ImportRunMeta, type ImportRunRecorder } from './import-record';

export interface PipelineStep {
  /** Provider id, or `exceptions`. */
  step: string;
  ok: boolean;
  imported?: number;
  updated?: number;
  error?: string;
}

export interface OrdersBackfillResult {
  ok: boolean;
  steps: PipelineStep[];
  imported: number;
  updated: number;
}

export interface OrdersBackfillDeps {
  /** Linked order providers in run order (ShipStation, Google Sheets, then the rest). */
  listOrderProviders(orgId: OrgId): Promise<string[]>;
  syncProvider(orgId: OrgId, provider: string, opts?: SyncOpts): Promise<SyncOutcome>;
  resolveExceptions(orgId: OrgId): Promise<{ matched: number }>;
  /** Open the run's import record (never throws). */
  startImportRun(orgId: OrgId, meta: ImportRunMeta): Promise<ImportRunRecorder>;
}

export interface OrdersBackfillOpts {
  /** Google Sheets reads every tab (the history backfill). */
  sheetsFull?: boolean;
  /** Default `cron`. */
  trigger?: ImportRunTrigger;
  /** Manual runs: the operator. */
  staffId?: number | null;
  /** The `cron_runs` row driving this run. */
  cronRunId?: number | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runOrdersBackfillPipeline(
  orgId: OrgId,
  deps: OrdersBackfillDeps,
  opts: OrdersBackfillOpts = {},
): Promise<OrdersBackfillResult> {
  const steps: PipelineStep[] = [];
  const providers = await deps.listOrderProviders(orgId);
  if (providers.length === 0) return { ok: true, steps, imported: 0, updated: 0 };

  const record = await deps.startImportRun(orgId, {
    kind: opts.sheetsFull ? 'sheets_full' : 'pipeline',
    trigger: opts.trigger ?? 'cron',
    staffId: opts.staffId ?? null,
    cronRunId: opts.cronRunId ?? null,
  });

  // Each step lands in the result (counts only) and the import record (+ rows).
  const land = async (step: PipelineStep, startedAt: Date, rows?: SyncOutcome['importRows']) => {
    steps.push(step);
    await record.step({ ...step, rows, startedAt, finishedAt: new Date() });
  };

  for (const provider of providers) {
    const startedAt = new Date();
    let outcome: SyncOutcome;
    try {
      outcome = await deps.syncProvider(
        orgId,
        provider,
        provider === 'google_sheets' && opts.sheetsFull ? { full: true } : undefined,
      );
    } catch (error) {
      outcome = { ok: false, error: errorMessage(error) };
    }
    await land(
      { step: provider, ok: outcome.ok, imported: outcome.imported, updated: outcome.updated, error: outcome.error },
      startedAt,
      outcome.importRows,
    );
  }

  const startedAt = new Date();
  let exceptions: PipelineStep;
  try {
    const { matched } = await deps.resolveExceptions(orgId);
    exceptions = { step: 'exceptions', ok: true, updated: matched };
  } catch (error) {
    exceptions = { step: 'exceptions', ok: false, error: errorMessage(error) };
  }
  await land(exceptions, startedAt);
  await record.finish();

  return {
    ok: steps.every((s) => s.ok),
    steps,
    imported: steps.reduce((n, s) => n + (s.imported ?? 0), 0),
    updated: steps.reduce((n, s) => n + (s.updated ?? 0), 0),
  };
}

/** One line naming every failed step — the run ledger's `error`, the header's message. */
export function pipelineFailure(result: OrdersBackfillResult): string {
  return failedStepsLine(result.steps);
}
