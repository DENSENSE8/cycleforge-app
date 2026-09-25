/**
 * ShipStation backfill / reconciliation — the connector's own `backfill` mode,
 * runnable from a shell. Default scope: the last 7 days; `--since` widens it.
 *
 *   node --env-file=.env --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     scripts/shipstation-backfill.mts --org=<uuid>                 # DRY RUN: counts only, writes nothing
 *   … --apply                                                       # import / enrich / quarantine; resumable
 *   … --apply --restart                                             # ignore an interrupted run, start over
 *   … --since=2026-06-01 --window-days=14                           # a slice of history
 *   … --incremental                                                 # one normal incremental sync (apply)
 *   … --legacy [--apply]                                            # re-attribute rows still recorded as 'shipstation'
 *
 * A dry run reads ShipStation and the org's orders and reports what an applied
 * run would do: imported / enriched / skipped / quarantined (+ reasons) and the
 * tracking it would attach. An applied run checkpoints every page in
 * `shipstation_sync_runs`; rerunning after a crash resumes at the checkpoint.
 * Re-running a finished backfill imports and enriches nothing (idempotent).
 */
import { reattributeLegacyShipStationRows, shipstationSync } from '../src/lib/integrations/connectors/shipstation';
import type { OrgId } from '../src/lib/tenancy/constants';
import type { TransferOrderDetails } from '../src/lib/orders-sync/types';

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const org = arg('org');
if (!org || !/^[0-9a-f-]{36}$/i.test(org)) {
  console.error('--org=<uuid> is required');
  process.exit(1);
}
const apply = args.includes('--apply');
const incremental = args.includes('--incremental');
const windowDays = arg('window-days') ? Number(arg('window-days')) : undefined;

const legacy = args.includes('--legacy');
const onProgress = (e: { type: string; phase?: string; count?: number }) => {
  if (e.type === 'phase') console.log(`  · ${e.phase}${e.count != null ? ` (${e.count})` : ''}`);
};

const started = Date.now();
const result = legacy
  ? await reattributeLegacyShipStationRows(org as OrgId, { apply, onProgress })
  : await shipstationSync(org as OrgId, {
      ...(incremental
        ? {}
        : { backfill: { apply, since: arg('since'), windowDays, restart: args.includes('--restart') } }),
      onProgress,
    });

const mode = legacy ? 'LEGACY RE-ATTRIBUTION' : incremental ? 'INCREMENTAL' : 'BACKFILL';
console.log(`\nMode: ${mode}${incremental ? '' : apply ? ' APPLY' : ' DRY RUN'}  org=${org}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (!result.ok) {
  console.error('FAILED:', result.error);
  if (result.stats) console.log(result.stats);
  process.exit(1);
}
const stats = result.stats ?? {};
const pick = (prefix: string) =>
  Object.fromEntries(Object.entries(stats).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
console.log({
  imported: stats.imported,
  enriched: stats.enriched,
  skipped: stats.skipped,
  quarantined: stats.quarantined,
  runId: stats.runId,
});
console.log('reasons:', pick('reason.'));
console.log('tracking:', pick('tracking'), 'shipments:', pick('shipments'));
const details = result.details as TransferOrderDetails | undefined;
const enrichedRows = details?.updated ?? [];
if (enrichedRows.length && enrichedRows.length <= 20) {
  console.log('enriched:', enrichedRows.map((r) => `${r.orderId}${r.platform ? ` (${r.platform})` : ''}`).join(', '));
}
const q = details?.quarantined ?? [];
if (q.length) {
  console.log(`\nquarantined sample (${q.length} shown):`);
  for (const row of q.slice(0, 40)) console.log(`  ${row.orderId.padEnd(24)} ${row.quarantineReason ?? ''}`);
}
if (!apply && !incremental) console.log('\nDRY RUN — nothing written. Re-run with --apply.');
process.exit(0);
