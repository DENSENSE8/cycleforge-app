#!/usr/bin/env node
/**
 * Dead-surface probe — which product surfaces has nobody used?
 *
 * REPORT ONLY. Never a gate, never run in `verify`, never exits non-zero on a
 * finding. It reads production-shaped data, so it must never be able to fail a
 * build on what a warehouse happened to do last quarter.
 *
 * ## The gap this fills, and the gap it does NOT
 *
 * `knip` answers "is this code reachable from an entry point". It cannot answer
 * "does a human ever do this", which is the question that catches a surface
 * that is fully wired, fully imported, fully green — and dead. That is exactly
 * how chrome Fields and the grid lip both stayed "used" for months while one of
 * them was the only door anyone opened.
 *
 * The industry answer is statement-level runtime coverage from an APM (Sentry /
 * Datadog / PostHog). That costs a bill and a client bundle this repo actively
 * polices (`build-gotchas.md` → bundle altitude). This is the ~80% answer at
 * ~0% of the cost: the app already writes typed action vocabularies into
 * `audit_logs`, `inventory_events` and `station_activity_logs`, so a code that
 * the code DECLARES but the database has never SEEN is a product surface with
 * no users.
 *
 * **It finds dead SURFACES, not dead BRANCHES.** An action code with rows only
 * proves someone reached the surface — not that every path inside it runs. Do
 * not read a clean report as coverage.
 *
 * ## Reading the output
 *
 * A code with zero rows is a QUESTION, not a verdict. Legitimate reasons for a
 * quiet code, all of which mean "leave it alone":
 *   • a rare-but-critical path (kiosk revoke, a recovery action, a 409 branch)
 *   • a surface that shipped inside the window and has not been exercised yet
 *   • a code only a tenant you don't run writes
 * The finding worth acting on is a code that is OLD, ORDINARY, and SILENT.
 *
 * ## Usage
 *
 *   npm run debt:surfaces              # 90-day window, all tables
 *   node scripts/dead-surface-probe.mjs --days=180
 *   node scripts/dead-surface-probe.mjs --org=<uuid>   # scope to one tenant
 *
 * Needs DATABASE_URL. Quarterly is the intended cadence — pair it with
 * `npm run debt`, which reports the static half of the same ledger.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each probe pairs a DECLARED vocabulary (read out of the code, so the report
 * cannot drift from the source) with the column that records it.
 *
 * `declared` returns the set the product can emit. Parsing the source rather
 * than importing it keeps this script free of `server-only` and of the app's
 * module graph.
 */
const PROBES = [
  {
    label: 'audit_logs.action',
    table: 'audit_logs',
    column: 'action',
    timeColumn: 'created_at',
    sot: 'src/lib/audit-logs.ts → AUDIT_ACTION',
    declared: () => constObjectValues('src/lib/audit-logs.ts', 'AUDIT_ACTION'),
  },
  {
    label: 'inventory_events.event_type',
    table: 'inventory_events',
    column: 'event_type',
    // `occurred_at`, not `created_at` — this table records WHEN THE THING
    // HAPPENED, which is the honest clock for a usage question (a backfilled
    // row's insert time would say the surface was used the day we migrated).
    timeColumn: 'occurred_at',
    sot: 'src/lib/inventory/events.ts → InventoryEventType',
    declared: () => unionMembers('src/lib/inventory/events.ts', 'InventoryEventType'),
  },
  {
    label: 'station_activity_logs.activity_type',
    table: 'station_activity_logs',
    column: 'activity_type',
    timeColumn: 'created_at',
    sot: 'src/lib/timeline/station-activity-events.ts → ACTIVITY_MAP',
    declared: () => recordKeys('src/lib/timeline/station-activity-events.ts', 'ACTIVITY_MAP'),
  },
];

function read(rel) {
  const p = join(REPO_ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/** `export const X = { A: 'a.b', ... }` → ['a.b', ...] */
function constObjectValues(rel, name) {
  const src = read(rel);
  if (!src) return null;
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\{`));
  if (!m) return null;
  const body = braceBody(src, m.index + m[0].length - 1);
  return body ? [...body.matchAll(/:\s*'([^']+)'/g)].map((x) => x[1]) : null;
}

/** `export type T = | 'a' | 'b'` → ['a','b'] */
function unionMembers(rel, name) {
  const src = read(rel);
  if (!src) return null;
  const m = src.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?);`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
}

/** `const X: Record<string, …> = { 'a': …, b: … }` → ['a','b'] */
function recordKeys(rel, name) {
  const src = read(rel);
  if (!src) return null;
  const m = src.match(new RegExp(`(?:const|export const) ${name}[^=]*=\\s*\\{`));
  if (!m) return null;
  const body = braceBody(src, m.index + m[0].length - 1);
  if (!body) return null;
  return [...body.matchAll(/^\s*'?([A-Za-z0-9_.]+)'?\s*:/gm)].map((x) => x[1]);
}

/** Balanced-brace slice starting at the `{` at `open`. */
function braceBody(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

async function main() {
  try {
    const { config } = await import('dotenv');
    config({ path: '.env.local' });
    config({ path: '.env' });
  } catch {
    /* dotenv optional */
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — this probe reads real usage data.');
    process.exit(2);
  }

  const arg = (k, d) => {
    const a = process.argv.find((x) => x.startsWith(`--${k}=`));
    return a ? a.split('=')[1] : d;
  };
  const daysRaw = Number(arg('days', '90'));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : 90;
  const org = arg('org', null);

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('');
  console.log(`  Dead-surface probe — action codes with NO rows in ${days} days`);
  console.log(`  ${org ? `org ${org}` : 'all orgs'}`);
  console.log('  ' + '─'.repeat(72));

  let totalSilent = 0;

  for (const probe of PROBES) {
    const declared = probe.declared();
    if (!declared || declared.length === 0) {
      console.log(`\n  ${probe.label}: could not read the declared vocabulary`);
      console.log(`    (${probe.sot}) — the SoT shape changed; fix this script, not the SoT.`);
      continue;
    }

    let rows;
    try {
      const params = [`${days} days`];
      let where = `${probe.timeColumn} >= now() - $1::interval`;
      if (org) {
        params.push(org);
        where += ` AND organization_id = $2::uuid`;
      }
      rows = (
        await pool.query(
          `SELECT ${probe.column} AS code, count(*)::bigint AS n
             FROM ${probe.table}
            WHERE ${where}
            GROUP BY 1`,
          params,
        )
      ).rows;
    } catch (err) {
      console.log(`\n  ${probe.label}: query failed — ${err.message.split('\n')[0]}`);
      continue;
    }

    const seen = new Map(rows.map((r) => [r.code, Number(r.n)]));
    const silent = declared.filter((c) => !seen.has(c)).sort();
    // Codes the DB has that the code does not declare — the other drift
    // direction, and a sign the vocabulary SoT is incomplete.
    const undeclared = [...seen.keys()].filter((c) => !declared.includes(c)).sort();

    totalSilent += silent.length;

    console.log('');
    console.log(`  ${probe.label}  —  ${declared.length} declared · ${seen.size} seen · ${silent.length} SILENT`);
    console.log(`    SoT: ${probe.sot}`);
    if (silent.length) {
      for (const c of silent) console.log(`      · ${c}`);
    } else {
      console.log('      (every declared code was written at least once)');
    }
    if (undeclared.length) {
      console.log(`    ALSO: ${undeclared.length} code(s) in the DB that the SoT does not declare —`);
      console.log('    the vocabulary is incomplete, which is its own drift:');
      for (const c of undeclared) console.log(`      · ${c}`);
    }
  }

  console.log('');
  console.log('  ' + '─'.repeat(72));
  console.log(`  ${totalSilent} silent code(s).`);
  console.log('');
  console.log('  A silent code is a QUESTION, not a verdict. Rare-but-critical paths');
  console.log('  (recovery, revoke, conflict branches) are SUPPOSED to be quiet, and a');
  console.log('  surface that shipped inside the window has not had time to be used.');
  console.log('  Act on codes that are old, ordinary and silent.');
  console.log('');
  console.log('  Finds dead SURFACES, not dead BRANCHES — rows prove someone reached the');
  console.log('  surface, never that every path inside it runs. Do not read this as coverage.');
  console.log('');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
