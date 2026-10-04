/**
 * Global Sync — the header's one button over every sync the app runs, grouped
 * by direction:
 *  - **Outbound** — the orders backfill pipeline for the caller's org
 *    (ShipStation → Google Sheets backup → other linked channels →
 *    exceptions, in order), then the outbound schedules (carrier tracking,
 *    Zoho fulfillment, order ingest queue).
 *  - **Inbound** — Zoho POs and receives, incoming tracking, eBay purchases.
 * Scheduled jobs run NOW through their own cron route (lock + run ledger).
 * The client runs jobs one request each, so every row reports on its own.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { PermissionString } from '@/lib/auth/permissions';
import { CRON_JOBS_BY_KEY, CRON_JOB_TRIGGER_PATH } from '@/lib/cron/registry';
import type { CronTriggerResult } from '@/lib/cron/trigger';
import { pipelineFailure, type OrdersBackfillResult } from '@/lib/sync/orders-backfill-pipeline';

export type GlobalSyncDirection = 'outbound' | 'inbound';

/** The job's latest run in the `cron_runs` ledger (scheduled or manual). */
export interface GlobalSyncLastRun {
  status: 'running' | 'success' | 'failed';
  /** ISO — finished, or started while still running. */
  at: string;
}

export interface GlobalSyncJob {
  /** `pipeline:orders` or `cron:<job key>`. */
  id: string;
  label: string;
  direction: GlobalSyncDirection;
  canRun: boolean;
  lastRun: GlobalSyncLastRun | null;
}

interface JobDef {
  id: string;
  label: string;
  direction: GlobalSyncDirection;
  permission: PermissionString;
  /** Cron job key; absent = the org's orders pipeline. */
  cronJob?: string;
}

const PIPELINE_JOB_ID = 'pipeline:orders';
/** The ledger key both the cron and a manual header run record under. */
export const ORDERS_PIPELINE_RUN_JOB = 'orders.backfill_pipeline';

/**
 * Only syncs: reports, sweeps and mirrors keep their schedule (Settings →
 * Cron runs has "Run now" for those). Declaration order is paint order.
 */
const JOBS: readonly JobDef[] = [
  { id: PIPELINE_JOB_ID, label: 'Orders — all linked platforms', direction: 'outbound', permission: 'orders.import' },
  { id: 'cron:shipping.sync_due', cronJob: 'shipping.sync_due', label: 'Carrier tracking', direction: 'outbound', permission: 'orders.import' },
  { id: 'cron:zoho.incoming_po_sync', cronJob: 'zoho.incoming_po_sync', label: 'Zoho issued POs', direction: 'inbound', permission: 'receiving.view' },
  { id: 'cron:zoho.po_sync', cronJob: 'zoho.po_sync', label: 'Zoho PO mirror', direction: 'inbound', permission: 'receiving.view' },
  { id: 'cron:zoho.receive_backfill', cronJob: 'zoho.receive_backfill', label: 'Zoho purchase receives', direction: 'inbound', permission: 'receiving.view' },
  { id: 'cron:receiving.incoming_tracking', cronJob: 'receiving.incoming_tracking', label: 'Incoming tracking', direction: 'inbound', permission: 'receiving.view' },
  { id: 'cron:ebay.purchase_sync', cronJob: 'ebay.purchase_sync', label: 'eBay purchases', direction: 'inbound', permission: 'receiving.view' },
];

export interface GlobalSyncDeps {
  /** `'locked'` = a run (scheduled or another operator's) is already in flight. */
  runPipeline(orgId: OrgId): Promise<OrdersBackfillResult | 'locked'>;
  triggerCron(path: string): Promise<CronTriggerResult>;
}

/** A cron row only exists while its job is registered AND triggerable. */
function isLive(def: JobDef): boolean {
  return !def.cronJob || Boolean(CRON_JOBS_BY_KEY[def.cronJob] && CRON_JOB_TRIGGER_PATH[def.cronJob]);
}

export async function listGlobalSyncJobs(
  has: (perm: PermissionString) => boolean,
  latestRuns: (jobKeys: string[]) => Promise<Record<string, GlobalSyncLastRun>>,
): Promise<GlobalSyncJob[]> {
  const live = JOBS.filter(isLive);
  const keyOf = (d: JobDef) => d.cronJob ?? ORDERS_PIPELINE_RUN_JOB;
  const runs = await latestRuns(live.map(keyOf));
  return live.map((d) => ({
    id: d.id,
    label: d.label,
    direction: d.direction,
    canRun: has(d.permission),
    lastRun: runs[keyOf(d)] ?? null,
  }));
}

export type GlobalSyncRunResult =
  | { ok: true; summary: string }
  | { ok: false; error: string; status: 400 | 403 | 502 };

function describePipeline(result: OrdersBackfillResult): string {
  if (result.steps.length === 0) return 'No linked order platform';
  const parts = [
    result.imported ? `${result.imported} imported` : null,
    result.updated ? `${result.updated} updated` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Up to date';
}

/** Run one job for the caller's org. */
export async function runGlobalSyncJob(
  orgId: OrgId,
  jobId: string,
  has: (perm: PermissionString) => boolean,
  deps: GlobalSyncDeps,
): Promise<GlobalSyncRunResult> {
  const def = JOBS.find((d) => d.id === jobId);
  if (!def || !isLive(def)) return { ok: false, error: `Unknown sync job: ${jobId}`, status: 400 };
  if (!has(def.permission)) return { ok: false, error: 'FORBIDDEN', status: 403 };

  if (!def.cronJob) {
    const result = await deps.runPipeline(orgId);
    if (result === 'locked') return { ok: true, summary: 'Already running' };
    if (result.ok) return { ok: true, summary: describePipeline(result) };
    return { ok: false, error: pipelineFailure(result), status: 502 };
  }

  const run = await deps.triggerCron(CRON_JOB_TRIGGER_PATH[def.cronJob]);
  if (!run.ok) {
    const body = run.result as { error?: unknown } | null;
    return { ok: false, error: run.error || String(body?.error ?? `HTTP ${run.status}`), status: 502 };
  }
  const skipped = run.result && typeof run.result === 'object' && 'skipped' in run.result && run.result.skipped === 'locked';
  return { ok: true, summary: skipped ? 'Already running' : 'Done' };
}
