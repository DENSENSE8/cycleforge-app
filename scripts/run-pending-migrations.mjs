#!/usr/bin/env node
/**
 * Migration runner — applies src/lib/migrations/*.sql files that haven't
 * run yet against DATABASE_URL.
 *
 * Tracks applied migrations in a schema_migrations table (filename + sha256
 * + applied_at). Idempotent: re-running is a no-op until new files appear.
 * If a file has changed since it was applied, the runner exits non-zero
 * rather than re-applying it (Postgres would have already returned an
 * error in practice; this just makes the message clearer).
 *
 * Usage:
 *   node scripts/run-pending-migrations.mjs                    # apply all pending
 *   node scripts/run-pending-migrations.mjs --dry              # list pending, don't apply
 *   node scripts/run-pending-migrations.mjs --only <file.sql>  # apply just one
 *   node scripts/run-pending-migrations.mjs --dry --fail-on-pending  # deploy gate: exit 4 if any pending
 *
 * Locking: every transactional file runs with SET LOCAL lock_timeout (default
 * 5s, MIGRATION_LOCK_TIMEOUT overrides) so a migration waiting behind a hot
 * table's lock fails fast instead of queueing every writer behind it.
 * A file whose first line is `-- migrate:no-transaction` runs outside BEGIN
 * (required for CREATE INDEX CONCURRENTLY) on a DIRECT session
 * (DATABASE_URL_UNPOOLED when set: session SETs don't survive the transaction
 * pooler). Its statements run one by one (split on `;` at line end) with
 * session lock_timeout and statement_timeout = 0, and the ledger row is
 * written only after all of them succeed. Keep such files idempotent
 * (IF NOT EXISTS) — a mid-file failure leaves earlier statements applied.
 *
 * --only exists because the default is ALL-OR-NOTHING, and the repo routinely
 * has several lanes' migrations pending at once. Applying "all" to land your own
 * silently lands someone else's schema change too — which is an ask-first action,
 * not a side effect of your task. The ledger is just (filename, sha256), so a
 * scoped apply plus its ledger row is exactly equivalent to the same file being
 * picked up by a full run; ordering is the only thing you give up, so --only
 * refuses to skip an EARLIER pending file (see the guard below).
 *
 * Drizzle's own migrator handles the generated migrations; this runner
 * exists for the hand-written SQL files (the team has used both since
 * before Drizzle landed, and we're not ready to consolidate yet).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client, Pool } from 'pg';

// Load .env when present so the runner works outside Next.js.
try {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  config({ path: '.env' });
} catch {
  // dotenv optional
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'lib', 'migrations');
const isDry = process.argv.includes('--dry') || process.argv.includes('--deploy-gate');
// --deploy-gate: used by `pnpm build`. On Vercel production builds (or when
// MIGRATION_GATE=1) it is --dry --fail-on-pending against the deploy's own
// DATABASE_URL; everywhere else it is a no-op so local/preview builds are unaffected.
const isDeployGate = process.argv.includes('--deploy-gate');
if (isDeployGate && process.env.VERCEL_ENV !== 'production' && process.env.MIGRATION_GATE !== '1') {
  console.log('[migration-gate] skipped (not a production deploy; set MIGRATION_GATE=1 to force)');
  process.exit(0);
}
const failOnPending = isDeployGate || process.argv.includes('--fail-on-pending');
const LOCK_TIMEOUT = /^\d+(ms|s)?$/.test(process.env.MIGRATION_LOCK_TIMEOUT ?? '')
  ? process.env.MIGRATION_LOCK_TIMEOUT
  : '5s';

export function isNoTransaction(sql) {
  return /^\s*--\s*migrate:no-transaction\b/i.test(sql);
}

/** Split a no-transaction file into statements (`;` at end of line). */
export function splitStatements(sql) {
  return sql
    .split(/;\s*(?:--[^\n]*)?\r?\n/)
    .map((stmt) => stmt.replace(/^(\s*--[^\n]*\n)+/g, '').trim())
    .filter((stmt) => stmt.length > 0 && !/^;?$/.test(stmt))
    .map((stmt) => stmt.replace(/;\s*$/, ''));
}
const onlyIdx = process.argv.indexOf('--only');
const onlyFile = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
if (onlyIdx >= 0 && !onlyFile) {
  console.error('--only requires a filename, e.g. --only 2026-08-01e_staff_avatar_photo.sql');
  process.exit(2);
}

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => {
      // Skip non-runnable planning docs that share the folder.
      const full = join(MIGRATIONS_DIR, name);
      return statSync(full).isFile();
    })
    .sort();
}

async function ensureSchemaMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      sha256   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadApplied(pool) {
  const r = await pool.query('SELECT filename, sha256 FROM schema_migrations');
  return new Map(r.rows.map((row) => [row.filename, row.sha256]));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await ensureSchemaMigrations(pool);
  const applied = await loadApplied(pool);
  const files = listMigrationFiles();

  const pending = [];
  for (const filename of files) {
    const full = join(MIGRATIONS_DIR, filename);
    const sql = readFileSync(full, 'utf8');
    const sum = sha256(sql);
    const prior = applied.get(filename);
    if (!prior) {
      pending.push({ filename, sql, sum });
    } else if (prior !== sum) {
      console.error(
        `migration ${filename} has changed since it was applied (sha256 mismatch). ` +
        `Add a new migration rather than editing an applied one.`,
      );
      process.exit(3);
    }
  }

  if (failOnPending && pending.length > 0) {
    console.error(
      `${pending.length} migration(s) pending — deploy blocked. Apply them first (pnpm db:migrate):\n` +
        pending.map((m) => `  ${m.filename}`).join('\n'),
    );
    await pool.end();
    process.exit(4);
  }

  if (pending.length === 0) {
    console.log(`up to date — ${applied.size} migrations on record, 0 pending`);
    await pool.end();
    return;
  }

  let toApply = pending;
  if (onlyFile) {
    const idx = pending.findIndex((m) => m.filename === onlyFile);
    if (idx < 0) {
      console.error(
        `--only ${onlyFile} is not pending. Pending:\n` +
          pending.map((m) => `  ${m.filename}`).join('\n'),
      );
      await pool.end();
      process.exit(2);
    }
    // Refuse to reorder. Skipping an earlier pending file would apply this one
    // out of sequence, which is exactly how an expand/contract pair gets
    // inverted — the failure `2026-07-29f`'s two halves already demonstrate.
    if (idx > 0) {
      console.error(
        `--only ${onlyFile} would skip ${idx} earlier pending migration(s):\n` +
          pending.slice(0, idx).map((m) => `  ${m.filename}`).join('\n') +
          '\nApply those first (they may be another lane\'s — that is an ask-first call).',
      );
      await pool.end();
      process.exit(2);
    }
    toApply = [pending[idx]];
  }

  console.log(
    `${pending.length} pending migration(s)` +
      (onlyFile ? `, applying 1 (--only ${onlyFile}):` : ':'),
  );
  for (const m of toApply) console.log(`  ${m.filename}`);

  if (isDry) {
    console.log('(--dry: not applying)');
    await pool.end();
    return;
  }

  for (const m of toApply) {
    if (isNoTransaction(m.sql)) {
      // Session-level SETs need a direct backend; through the pooler each
      // statement may land on a different server connection.
      const direct = new Client({
        connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      try {
        await direct.connect();
        console.log(`applying ${m.filename} (no-transaction)…`);
        await direct.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
        // Role default statement_timeout (2026-09-27_role_statement_timeouts.sql) would cut index builds.
        await direct.query('SET statement_timeout = 0');
        for (const stmt of splitStatements(m.sql)) await direct.query(stmt);
        await direct.query(
          'INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)',
          [m.filename, m.sum],
        );
      } catch (err) {
        console.error(`failed: ${m.filename} (no-transaction: earlier statements stay applied)`);
        console.error(err?.message || err);
        process.exit(1);
      } finally {
        await direct.end().catch(() => {});
      }
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
      // Role default statement_timeout (2026-09-27_role_statement_timeouts.sql) would cut index builds.
      await client.query(`SET LOCAL statement_timeout = 0`);
      console.log(`applying ${m.filename}…`);
      await client.query(m.sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)',
        [m.filename, m.sum],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`failed: ${m.filename}`);
      console.error(err?.message || err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`applied ${toApply.length} migration(s)`);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
