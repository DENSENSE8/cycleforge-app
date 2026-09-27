#!/usr/bin/env tsx
/**
 * brands-backfill.ts — brand every catalog SKU a deterministic rule can
 * (sidebar Phase 1). Rules, order and thresholds: src/lib/brands/backfill.ts
 * (phase0-findings §"Recommended backfill order + thresholds").
 *
 * Run (seed the org's vocabulary first: pnpm brands:seed -- --org <uuid> --apply):
 *   pnpm brands:backfill -- --org <uuid>            dry run: coverage + plan, writes nothing
 *   pnpm brands:backfill -- --org <uuid> --apply    write >= 0.90, queue the rest for review
 *   … --verbose                                     list every proposal and unbranded active SKU
 *
 * --apply writes auto-apply rows (zoho 1.00 / title 0.95 / product_line 0.90
 * / parent 0.90) in ONE authority-guarded UPDATE (never over an operator or
 * Zoho fact, unchanged rows skipped), then queues every below-threshold or
 * conflicting guess as an agent_mutations proposal (review class, LAWS T28)
 * that a human approves at /api/brands/proposals. Idempotent: a second run
 * writes 0 rows and queues 0 new proposals (dedupe keys).
 */

import pool from '@/lib/db';
import { runBrandBackfill, type BackfillReport } from '@/lib/brands/backfill';
import { sqlBrandBackfillDeps } from '@/lib/brands/backfill-deps';

function parseArgs(argv: string[]): { org: string; apply: boolean; verbose: boolean } {
  const i = argv.indexOf('--org');
  const org = i >= 0 ? argv[i + 1] : undefined;
  if (!org || !/^[0-9a-f-]{36}$/i.test(org)) throw new Error('--org <uuid> is required');
  return { org, apply: argv.includes('--apply'), verbose: argv.includes('--verbose') };
}

function print(report: BackfillReport, verbose: boolean): void {
  console.log(`brands-backfill ${report.applied ? 'APPLIED' : 'DRY RUN'} — org ${report.orgId} — ${report.skus} catalog SKUs`);
  console.log('\nCoverage after this run (brand fact = confidence >= 0.90):');
  console.table(report.coverage.map((c) => ({ population: c.population, total: c.total, branded: c.branded, '%': c.pct })));
  console.log(
    `auto-apply rows: ${report.toApply} ${JSON.stringify(report.bySource)}` +
      (report.applied ? ` · written ${report.written}` : '') +
      ` · kept unchanged ${report.kept.unchanged} · protected (higher-authority fact) ${report.kept.protected}`,
  );
  console.log(
    `review queue: ${report.proposals.new} new SKU proposals · ${report.proposals.brandCreates} new brand.create (unknown Zoho brands)` +
      ` · ${report.proposals.alreadyQueued} already queued` +
      (report.proposals.failed ? ` · ${report.proposals.failed} FAILED` : ''),
  );
  if (report.zohoBrandCreates.length) {
    console.log('\nUnknown Zoho brands (no alias in this org):');
    console.table(report.zohoBrandCreates.map((c) => ({ zoho: c.name, skus: c.skuCatalogIds.length })));
  }
  if (verbose) {
    const proposals = report.plans.flatMap((p) =>
      p.proposals.map((pr) => ({
        sku: p.sku,
        reason: pr.reason,
        source: pr.source,
        confidence: pr.confidence,
        brand: pr.brandName ?? '(pick)',
        matched: pr.matched,
      })),
    );
    if (proposals.length) {
      console.log('\nProposals:');
      console.table(proposals);
    }
    const unbranded = report.plans.filter((p) => p.isActive && !p.fixture && p.finalBrandId == null && p.proposals.length === 0);
    if (unbranded.length) {
      console.log('\nActive, non-fixture SKUs with no brand and no proposal:');
      console.table(unbranded.map((p) => ({ sku: p.sku })));
    }
  }
}

async function main(): Promise<void> {
  const { org, apply, verbose } = parseArgs(process.argv.slice(2));
  const report = await runBrandBackfill(org, { apply }, sqlBrandBackfillDeps);
  print(report, verbose);
  if (report.proposals.failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('brands-backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
