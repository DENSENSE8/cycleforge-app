#!/usr/bin/env tsx
/**
 * shipstation-backfill.ts — pull ShipStation orders + shipments for the last N
 * months and push them through the ONE order writer (ingestCanonicalOrders via
 * the ShipStation connector's backfill mode): canonical platform, the one buyer
 * resolver, Placed in Pacific time. Never a side path.
 *
 * Dry run by default (counts only, nothing written). `--apply` writes, records
 * an import run, and checkpoints every page in shipstation_sync_runs, so an
 * interrupted run resumes where it stopped (`--restart` ignores the checkpoint).
 * Rate limits: the v1 client retries 429 after X-Rate-Limit-Reset.
 *
 * Usage:
 *   tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/shipstation-backfill.ts \
 *     --orgId=<uuid> [--months=6] [--windowDays=7] [--apply] [--restart]
 */

import { shipstationSync } from '../src/lib/integrations/connectors/shipstation';
import { providerRunKind, type ImportRunMeta } from '../src/lib/sync/import-record';
import { recordProviderSyncRun } from '../src/lib/sync/import-record-load';
import type { OrgId } from '../src/lib/tenancy/constants';

async function main(): Promise<void> {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const orgId = arg('orgId') as OrgId | undefined;
  if (!orgId) throw new Error('--orgId=<uuid> is required');
  const months = Number(arg('months') ?? 6);
  const windowDays = Number(arg('windowDays') ?? 7);
  const apply = process.argv.includes('--apply');
  const restart = process.argv.includes('--restart');
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — org ${orgId}, ShipStation modifyDate since ${since.toISOString()} in ${windowDays}-day windows`);
  const sync = () =>
    shipstationSync(orgId, {
      backfill: { apply, since: since.toISOString(), windowDays, restart },
      onProgress: (e) => {
        if (e.type === 'phase') console.log(`  · ${e.phase}${'count' in e && e.count != null ? ` ${e.count}` : ''}`);
      },
    });
  const run: ImportRunMeta = { kind: providerRunKind('shipstation', true), trigger: 'manual', staffId: null, cronRunId: null };
  const outcome = apply ? await recordProviderSyncRun(orgId, 'shipstation', run, sync) : await sync();

  if (!outcome.ok) {
    console.error(`failed: ${outcome.error}`);
    if (outcome.stats) console.error(JSON.stringify(outcome.stats, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(outcome.stats, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
