#!/usr/bin/env tsx
/**
 * brands-seed.ts — seed an org's brand vocabulary (sidebar Phase 1).
 * ───────────────────────────────────────────────────────────────────
 * Brands are ORG DATA, seeded per org by this script — never hard-coded in
 * app logic. The vocabulary (and what is deliberately left out) lives in
 * scripts/brands-seed.data.ts.
 *
 * Run (dry run prints what would change and writes nothing):
 *   pnpm brands:seed -- --org <uuid>
 *   pnpm brands:seed -- --org <uuid> --apply
 *
 * Idempotent: an existing brand only gains missing aliases; kind / parent /
 * publisher / name edits an operator made are never overwritten, and an
 * alias another brand owns is reported, never re-pointed. Runs in ONE tenant
 * transaction (all or nothing).
 */

import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { seedBrands, type BrandSeedOutcome } from '@/lib/brands/seed';
import { sqlBrandStore, type Queryable } from '@/lib/brands/store';
import { BRAND_SEED } from './brands-seed.data';

class DryRun extends Error {}

function parseArgs(argv: string[]): { org: string; apply: boolean } {
  const i = argv.indexOf('--org');
  const org = i >= 0 ? argv[i + 1] : undefined;
  if (!org || !/^[0-9a-f-]{36}$/i.test(org)) throw new Error('--org <uuid> is required');
  return { org, apply: argv.includes('--apply') };
}

async function main(): Promise<void> {
  const { org, apply } = parseArgs(process.argv.slice(2));
  let outcomes: BrandSeedOutcome[] = [];
  try {
    await withTenantTransaction(org, async (client) => {
      outcomes = await seedBrands(sqlBrandStore(client as unknown as Queryable, org), BRAND_SEED);
      // Dry run: the same writes, rolled back, so the report is exact.
      if (!apply) throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  console.log(`brands-seed ${apply ? 'APPLIED' : 'DRY RUN (rolled back)'} — org ${org}`);
  console.table(
    outcomes.map((o) => ({
      brand: o.name,
      id: o.brandId ?? '',
      action: o.action,
      aliases: o.aliasesAdded,
      conflicts: o.conflicts.join('; '),
    })),
  );
  const created = outcomes.filter((o) => o.action === 'created').length;
  const added = outcomes.filter((o) => o.action === 'aliases_added').length;
  const skipped = outcomes.filter((o) => o.action === 'skipped').length;
  console.log(`created ${created} · aliases added on ${added} · unchanged ${outcomes.length - created - added - skipped} · skipped ${skipped}`);
  if (skipped) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('brands-seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
