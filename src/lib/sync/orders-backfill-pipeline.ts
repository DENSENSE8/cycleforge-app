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
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { SyncOpts, SyncOutcome } from '@/lib/integrations/connectors/types';

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
}

export async function runOrdersBackfillPipeline(
  orgId: OrgId,
  deps: OrdersBackfillDeps,
  opts: { sheetsFull?: boolean } = {},
): Promise<OrdersBackfillResult> {
  const steps: PipelineStep[] = [];
  const providers = await deps.listOrderProviders(orgId);
  if (providers.length === 0) return { ok: true, steps, imported: 0, updated: 0 };

  for (const provider of providers) {
    try {
      const outcome = await deps.syncProvider(
        orgId,
        provider,
        provider === 'google_sheets' && opts.sheetsFull ? { full: true } : undefined,
      );
      steps.push({ step: provider, ok: outcome.ok, imported: outcome.imported, updated: outcome.updated, error: outcome.error });
    } catch (error) {
      steps.push({ step: provider, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    const { matched } = await deps.resolveExceptions(orgId);
    steps.push({ step: 'exceptions', ok: true, updated: matched });
  } catch (error) {
    steps.push({ step: 'exceptions', ok: false, error: error instanceof Error ? error.message : String(error) });
  }

  return {
    ok: steps.every((s) => s.ok),
    steps,
    imported: steps.reduce((n, s) => n + (s.imported ?? 0), 0),
    updated: steps.reduce((n, s) => n + (s.updated ?? 0), 0),
  };
}

/** One line naming every failed step — the run ledger's `error`, the header's message. */
export function pipelineFailure(result: OrdersBackfillResult): string {
  return result.steps
    .filter((s) => !s.ok)
    .map((s) => `${s.step}: ${s.error || 'failed'}`)
    .join(' · ');
}
