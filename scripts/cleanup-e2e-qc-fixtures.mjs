#!/usr/bin/env node
/**
 * Remove leaked QC E2E fixture SKUs from a tenant.
 *
 * `crud-qc-checks.spec.ts` / `qc-checklist-ui.spec.ts` mint throwaway
 * `E2E-QC-*` / `E2E-QCUI-*` catalog rows and delete them in `finally` blocks —
 * but a crashed or timed-out run leaves the row behind. Because both specs ran
 * on the DOGFOOD storage state until 2026-08-19, that residue landed in USAV and
 * crowded out the three real products in the Products → QC picker (which lists
 * only SKUs that have a `qc_check_templates` row).
 *
 * Dry-run by default; pass `--apply` to delete. Scoped to one org and to the two
 * fixture prefixes — it can never touch a hand-authored SKU.
 *
 *   node scripts/cleanup-e2e-qc-fixtures.mjs                 # report
 *   node scripts/cleanup-e2e-qc-fixtures.mjs --apply         # delete
 *   node scripts/cleanup-e2e-qc-fixtures.mjs --org <uuid>    # another tenant
 */
import 'dotenv/config';
import pg from 'pg';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const PREFIXES = ['E2E-QC-%', 'E2E-QCUI-%'];

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const orgArgIdx = argv.indexOf('--org');
const orgId = orgArgIdx >= 0 ? argv[orgArgIdx + 1] : DEFAULT_ORG;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const FIND_SQL = `SELECT id, sku FROM sku_catalog
   WHERE organization_id = $1 AND (sku LIKE $2 OR sku LIKE $3)
   ORDER BY id`;

async function main() {
  const found = await pool.query(FIND_SQL, [orgId, ...PREFIXES]);
  const ids = found.rows.map((r) => Number(r.id));
  const tmpl = await pool.query(
    'SELECT count(*)::int AS n FROM qc_check_templates WHERE sku_catalog_id = ANY($1::int[])',
    [ids],
  );
  console.log(`org ${orgId}`);
  console.log(`  fixture sku_catalog rows : ${found.rowCount}`);
  console.log(`  their qc_check_templates : ${tmpl.rows[0].n}`);

  if (!apply) {
    console.log('\ndry run — pass --apply to delete');
    return;
  }
  if (ids.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_org = $1', [orgId]);
    const t = await client.query(
      'DELETE FROM qc_check_templates WHERE sku_catalog_id = ANY($1::int[])',
      [ids],
    );
    const s = await client.query(
      'DELETE FROM sku_catalog WHERE id = ANY($1::int[]) AND organization_id = $2',
      [ids, orgId],
    );
    await client.query('COMMIT');
    console.log(`\ndeleted ${t.rowCount} templates, ${s.rowCount} catalog rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err.message);
    await pool.end();
    process.exit(1);
  });
