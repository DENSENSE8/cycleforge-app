/**
 * Display registry for cron jobs — the source of truth for what the
 * "System sync activity" UI shows. `vercel.json` is the *deploy* source of
 * truth (the scheduler reads it); keep the two in sync when adding a job.
 *
 * `expectedEveryMs` drives staleness detection: a job whose last success is
 * older than ~2.5× its interval is flagged `stale` even with no error row —
 * catching the dangerous case where a job silently stops firing (exactly the
 * failure mode that was invisible before this feature).
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type CronCategory =
  | 'Receiving'
  | 'Shipping'
  | 'Zoho'
  | 'Inventory'
  | 'Sourcing'
  | 'Integrations'
  | 'System';

export interface CronJobDef {
  /** Stable key passed to withCronRun() and stored in cron_runs.job. */
  job: string;
  label: string;
  category: CronCategory;
  /** Human description of cadence (shown in UI; not parsed). */
  schedule: string;
  /** Expected gap between runs for staleness; null = irregular/multi-schedule. */
  expectedEveryMs: number | null;
}

export const CRON_JOBS: CronJobDef[] = [
  // Receiving
  { job: 'receiving.incoming_tracking', label: 'Incoming tracking refresh', category: 'Receiving', schedule: 'every 15 min', expectedEveryMs: 15 * MIN },
  { job: 'receiving_claims_escalation', label: 'Receiving claims escalation', category: 'Receiving', schedule: 'daily 16:00', expectedEveryMs: DAY },
  // Zoho
  { job: 'zoho.incoming_po_sync', label: 'Zoho issued-PO sync', category: 'Zoho', schedule: 'every 15 min', expectedEveryMs: 15 * MIN },
  { job: 'zoho.po_sync', label: 'Zoho PO-mirror sync', category: 'Zoho', schedule: 'every 15 min + nightly full', expectedEveryMs: 15 * MIN },
  { job: 'zoho.fulfillment_sync', label: 'Zoho fulfillment sync', category: 'Zoho', schedule: 'every 4h + nightly full', expectedEveryMs: 4 * HOUR },
  { job: 'zoho.orders_ingest_drain', label: 'Order ingest queue drain', category: 'Zoho', schedule: 'every minute', expectedEveryMs: 1 * MIN },
  { job: 'zoho.receive_backfill', label: 'Zoho purchase-receive backfill', category: 'Zoho', schedule: 'every 5 min', expectedEveryMs: 5 * MIN },
  // Shipping
  { job: 'shipping.sync_due', label: 'Carrier tracking sweep', category: 'Shipping', schedule: 'every ~15 min (staggered) + nightly deep 03:30', expectedEveryMs: 15 * MIN },
  { job: 'shipping.reconcile_delivered', label: 'Reconcile delivered', category: 'Shipping', schedule: 'hourly', expectedEveryMs: 1 * HOUR },
  { job: 'shipping.metrics', label: 'Shipping metrics', category: 'Shipping', schedule: 'every 30 min', expectedEveryMs: 30 * MIN },
  // Inventory
  { job: 'inventory.drift_check', label: 'Inventory drift check', category: 'Inventory', schedule: 'daily 11:00', expectedEveryMs: DAY },
  { job: 'stock_alerts', label: 'Stock alerts', category: 'Inventory', schedule: 'daily 14:00', expectedEveryMs: DAY },
  // Sourcing
  { job: 'sourcing.scan', label: 'Sourcing scan', category: 'Sourcing', schedule: 'daily 06:00', expectedEveryMs: DAY },
  { job: 'sourcing.scour', label: 'Sourcing scour', category: 'Sourcing', schedule: 'daily 08:00', expectedEveryMs: DAY },
  // Integrations
  { job: 'ebay.refresh_tokens', label: 'eBay token refresh', category: 'Integrations', schedule: 'hourly', expectedEveryMs: 1 * HOUR },
  { job: 'ebay.purchase_sync', label: 'eBay purchase sync', category: 'Integrations', schedule: 'every 30 min', expectedEveryMs: 30 * MIN },
  { job: 'integrations.reconcile', label: 'Integration reconciliation', category: 'Integrations', schedule: 'daily 04:00', expectedEveryMs: DAY },
  { job: 'integrations.token_refresh', label: 'Integration token refresh', category: 'Integrations', schedule: 'hourly', expectedEveryMs: HOUR },
  { job: 'integrations.orders_sync', label: 'Square order sync', category: 'Integrations', schedule: 'every 15 min', expectedEveryMs: 15 * MIN },
  // vercel.json is UTC-only: `0 15 * * *` + `0 21 * * *` are 08:00 + 14:00 PDT;
  // under PST (Nov–Mar) the same entries land at 07:00 + 13:00 Pacific.
  { job: 'shipstation.orders_sync', label: 'ShipStation order sync', category: 'Integrations', schedule: 'daily 08:00 + 14:00 PT', expectedEveryMs: 12 * HOUR },
  { job: 'documents.ecwid_packing_slips', label: 'ECWID packing-slip retry queue', category: 'Integrations', schedule: 'every 15 min', expectedEveryMs: 15 * MIN },
  { job: 'documents.ensure_outbound', label: 'Outbound document ensure', category: 'Integrations', schedule: 'every 15 min', expectedEveryMs: 15 * MIN },
  { job: 'documents.nas_mirror', label: 'Outbound document NAS mirror', category: 'Integrations', schedule: 'daily 04:45', expectedEveryMs: DAY },
  { job: 'photos.analyze', label: 'Photo analysis', category: 'Integrations', schedule: 'every 10 min', expectedEveryMs: 10 * MIN },
  { job: 'photos.drive_mirror', label: 'Photo Drive mirror', category: 'Integrations', schedule: 'daily 05:00', expectedEveryMs: DAY },
  { job: 'photos.nas_mirror', label: 'Photo NAS mirror', category: 'Integrations', schedule: 'daily 04:30', expectedEveryMs: DAY },
  { job: 'zendesk-ticket-watch', label: 'Zendesk ticket watch', category: 'Integrations', schedule: 'every 10 min', expectedEveryMs: 10 * MIN },
  { job: 'tickets.designated_assign', label: 'Designated-tag ticket assign', category: 'Integrations', schedule: 'every 15 min', expectedEveryMs: 15 * MIN },
  { job: 'staff_goals.history', label: 'Staff goals snapshot', category: 'Integrations', schedule: 'daily 00:30', expectedEveryMs: DAY },
  { job: 'signals.buyer_notes_heal', label: 'Buyer-note signal heal sweep', category: 'Integrations', schedule: 'nightly 09:15 UTC', expectedEveryMs: DAY },
  // System
  { job: 'catalog-projection', label: 'Catalog projection', category: 'System', schedule: 'hourly', expectedEveryMs: HOUR },
  { job: 'notification-outbox', label: 'Notification queue', category: 'System', schedule: 'every 2 min', expectedEveryMs: 2 * MIN },
  { job: 'search-outbox', label: 'Search projection queue', category: 'System', schedule: 'every 5 min', expectedEveryMs: 5 * MIN },
  { job: 'ticket-outbox', label: 'Helpdesk ticket queue', category: 'System', schedule: 'every 5 min', expectedEveryMs: 5 * MIN },
  { job: 'workflow.node_stats', label: 'Workflow node statistics', category: 'System', schedule: 'hourly', expectedEveryMs: HOUR },
  { job: 'insights.signal_rollup', label: 'Signal → insight rollup', category: 'System', schedule: 'nightly 00:50', expectedEveryMs: DAY },
  { job: 'feed_memberships.projection', label: 'Feed membership projection', category: 'System', schedule: 'every 10 min', expectedEveryMs: 10 * MIN },
  { job: 'sku_catalog.refresh_suggestions', label: 'SKU pairing suggestions', category: 'System', schedule: 'nightly', expectedEveryMs: DAY },
  { job: 'refresh_reports', label: 'Refresh reports', category: 'System', schedule: 'daily 10:30', expectedEveryMs: DAY },
  { job: 'cleanup', label: 'Cleanup (idempotency + run history)', category: 'System', schedule: 'daily', expectedEveryMs: DAY },
];

export const CRON_JOBS_BY_KEY: Record<string, CronJobDef> = Object.fromEntries(
  CRON_JOBS.map((j) => [j.job, j]),
);

/**
 * Maps a job key to the cron route the "Run now" admin action triggers
 * (internal fetch with the CRON_SECRET). Multi-schedule jobs point at their
 * delta/default variant. Jobs absent here have no manual trigger.
 */
export const CRON_JOB_TRIGGER_PATH: Record<string, string> = {
  'receiving.incoming_tracking': '/api/cron/receiving/incoming-tracking-sync',
  'zoho.incoming_po_sync': '/api/cron/zoho/incoming-po-sync',
  'zoho.po_sync': '/api/cron/zoho/po-sync?mode=delta',
  'zoho.fulfillment_sync': '/api/cron/zoho/fulfillment-sync?mode=delta',
  'zoho.orders_ingest_drain': '/api/cron/zoho/orders-ingest-drain',
  'zoho.receive_backfill': '/api/cron/zoho/receive-backfill',
  'shipping.sync_due': '/api/cron/shipping/sync-due',
  'shipping.reconcile_delivered': '/api/cron/shipping/reconcile-delivered',
  'shipping.metrics': '/api/cron/shipping/metrics',
  'inventory.drift_check': '/api/cron/inventory/drift-check',
  'stock_alerts': '/api/cron/stock-alerts',
  'sourcing.scan': '/api/cron/sourcing/scan',
  'ebay.refresh_tokens': '/api/cron/ebay/refresh-tokens',
  'shipstation.orders_sync': '/api/cron/shipstation/orders-sync',
  'documents.ecwid_packing_slips': '/api/cron/documents/ecwid-packing-slips?limit=25',
  'staff_goals.history': '/api/cron/staff-goals/history',
  'tickets.designated_assign': '/api/cron/tickets/designated-assign',
  'signals.buyer_notes_heal': '/api/cron/signals/buyer-notes-heal',
  'insights.signal_rollup': '/api/cron/signal-insight-rollup',
  'feed_memberships.projection': '/api/cron/feed-membership-projection',
  'sku_catalog.refresh_suggestions': '/api/cron/sku-catalog/refresh-suggestions',
  'refresh_reports': '/api/cron/refresh-reports',
  'cleanup': '/api/cron/cleanup',
};

export type JobHealth = 'ok' | 'stale' | 'failed' | 'running' | 'never';

export interface LatestRun {
  status: 'running' | 'success' | 'failed';
  finishedAt: string | null;
}

/** Per-job health from its latest run + the registry's expected cadence. */
export function computeHealth(
  def: CronJobDef | undefined,
  latest: LatestRun | null,
  now = Date.now(),
): JobHealth {
  if (!latest) return 'never';
  if (latest.status === 'running') return 'running';
  if (latest.status === 'failed') return 'failed';
  // success — check staleness against expected cadence (2.5× grace).
  const everyMs = def?.expectedEveryMs ?? null;
  if (everyMs && latest.finishedAt) {
    const age = now - new Date(latest.finishedAt).getTime();
    if (age > everyMs * 2.5) return 'stale';
  }
  return 'ok';
}

/** Worst-of roll-up for the header dot: failed > stale > ok (never/running ignored). */
export function aggregateHealth(healths: JobHealth[]): 'ok' | 'stale' | 'failed' {
  if (healths.includes('failed')) return 'failed';
  if (healths.includes('stale')) return 'stale';
  return 'ok';
}
