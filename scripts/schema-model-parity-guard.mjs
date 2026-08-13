#!/usr/bin/env node
/**
 * Schema model-parity guard — LIVE gate: every column src/lib/drizzle/schema.ts
 * declares must actually exist in the database.
 *
 * WHY THIS EXISTS. On 2026-07-29 the ops_events spine went silent for four days
 * across every tenant: 2026-07-28d declared notification_outbox.payload, the
 * Drizzle model declared it, a trigger wrote it — and the column was never
 * created, because `CREATE TABLE IF NOT EXISTS` yielded to a pre-existing table
 * while `CREATE OR REPLACE FUNCTION` overwrote the trigger regardless. Every
 * INSERT INTO ops_events threw, every caller swallowed it by design
 * (fire-and-forget signal semantics), and `npm run verify` stayed green the
 * whole time. See 2026-08-02b_notification_outbox_payload.sql.
 *
 * WHAT THE SIBLING GUARD DOES NOT DO. scripts/schema-drift-guard.mjs is a
 * STATIC TEXT scan asserting app code stops referencing columns a migration
 * DROPPED. It never opens a connection, so it cannot see a column that was
 * never created. Opposite direction, opposite failure mode — hence a sibling
 * script rather than a second job bolted onto that one, which would also force
 * a DB requirement onto a gate that deliberately has none.
 *
 * DIRECTION. Fails only on MODELED-BUT-MISSING (the model promises a column the
 * DB lacks — the shape that breaks reads and triggers at runtime). The reverse
 * (DB columns the model omits) is ordinary legacy surface, not a defect, and is
 * reported only under --verbose.
 *
 * Needs DATABASE_URL. Without it the guard SKIPS with a warning rather than
 * failing, matching the CI convention for live checks (audit-permissions) so
 * fork PRs and DB-less inner loops stay green.
 *
 * Usage:
 *   node scripts/schema-model-parity-guard.mjs
 *   node scripts/schema-model-parity-guard.mjs --check    # exit 1 on drift
 *   node scripts/schema-model-parity-guard.mjs --verbose  # also list DB-only columns
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

try {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  config({ path: '.env' });
} catch {
  // dotenv optional
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(repoRoot, 'src/lib/drizzle/schema.ts');
const ALLOWLIST_REL = 'scripts/schema-model-parity-allowlist.json';
const ALLOWLIST_PATH = join(repoRoot, ALLOWLIST_REL);
const check = process.argv.includes('--check');
const verbose = process.argv.includes('--verbose');

/**
 * Column factories that carry no literal name because they wrap a shared
 * definition. Keep in sync with the helpers at the top of schema.ts.
 */
const NAMED_HELPERS = { orgIdCol: 'organization_id' };

/** Split an object-literal body on top-level commas (string/`()`/`{}`/`[]` aware). */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = body[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

/** Brace-match forward from the index of an opening `{`. */
function matchBrace(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Remove comments while respecting string state.
 *
 * Must run over the WHOLE file before any brace matching: a line comment
 * containing an apostrophe ("the org's token") otherwise opens a phantom
 * single-quoted string, and every brace until the next apostrophe is read as
 * string content — which silently merges one table's columns into another's.
 */
function stripComments(src) {
  let out = '';
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Parse schema.ts → Map<tableName, Set<columnName>>. */
function parseModel(rawSource) {
  const source = stripComments(rawSource);
  const tables = new Map();
  const re = /pgTable\(\s*'([a-z0-9_]+)'\s*,\s*\{/g;
  let m;
  while ((m = re.exec(source))) {
    const tableName = m[1];
    const openIdx = source.indexOf('{', m.index + m[0].length - 1);
    const closeIdx = matchBrace(source, openIdx);
    if (closeIdx < 0) continue;
    const body = source.slice(openIdx + 1, closeIdx);

    const cols = tables.get(tableName) ?? new Set();
    for (const seg of splitTopLevel(body)) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      const prop = trimmed.match(/^(\w+)\s*:\s*([\s\S]+)$/);
      if (!prop) continue;
      const init = prop[2].trim();

      const helper = init.match(/^(\w+)\s*\(/);
      if (helper && NAMED_HELPERS[helper[1]]) {
        cols.add(NAMED_HELPERS[helper[1]]);
        continue;
      }
      // `text('col_name', …)` / `timestamp('col', { … })` / `myEnum('col')`
      const named = init.match(/^\w+\s*\(\s*'([a-z0-9_]+)'/);
      if (named) cols.add(named[1]);
    }
    tables.set(tableName, cols);
  }
  return tables;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('schema-model-parity-guard: DATABASE_URL not set — skipping live parity check.');
  process.exit(0);
}

const model = parseModel(readFileSync(SCHEMA_PATH, 'utf8'));
if (model.size === 0) {
  console.error('schema-model-parity-guard: parsed 0 tables from schema.ts — parser is broken.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
let missingTables = [];
let missingColumns = [];
let dbOnly = [];

try {
  const { rows } = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );
  const live = new Map();
  for (const r of rows) {
    if (!live.has(r.table_name)) live.set(r.table_name, new Set());
    live.get(r.table_name).add(r.column_name);
  }

  for (const [table, cols] of [...model].sort((a, b) => a[0].localeCompare(b[0]))) {
    const liveCols = live.get(table);
    if (!liveCols) {
      missingTables.push(table);
      continue;
    }
    for (const col of [...cols].sort()) {
      if (!liveCols.has(col)) missingColumns.push({ table, column: col });
    }
    if (verbose) {
      for (const col of [...liveCols].sort()) {
        if (!cols.has(col)) dbOnly.push({ table, column: col });
      }
    }
  }
} finally {
  await pool.end();
}

if (verbose && dbOnly.length) {
  console.log(`schema-model-parity-guard: ${dbOnly.length} DB-only column(s) not in the model (informational):`);
  for (const d of dbOnly) console.log(`  · ${d.table}.${d.column}`);
  console.log('');
}

// ── Ratchet ────────────────────────────────────────────────────────────────
// Baselines only shrink (AGENTS.md / verify gate). Known pre-existing drift is
// allowlisted with a reason; anything NOT on the list fails. And an entry that
// no longer drifts fails too — so fixing one forces its line to be deleted and
// the list can never quietly outlive the debt it records.
const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
const keyOf = (table, column) => `${table}.${column}`;
const allowed = new Map(allowlist.map((e) => [keyOf(e.table, e.column), e]));

const drift = [
  ...missingTables.map((t) => ({ kind: 'TABLE', table: t, column: '*' })),
  ...missingColumns.map((c) => ({ kind: 'COLUMN', table: c.table, column: c.column })),
];

const unexpected = drift.filter((d) => !allowed.has(keyOf(d.table, d.column)));
const seen = new Set(drift.map((d) => keyOf(d.table, d.column)));
const resolved = allowlist.filter((e) => !seen.has(keyOf(e.table, e.column)));

if (unexpected.length === 0 && resolved.length === 0) {
  console.log(
    `schema-model-parity-guard: OK (${model.size} modeled table(s); ` +
      `${allowlist.length} allowlisted drift item(s))`,
  );
  process.exit(0);
}

if (unexpected.length) {
  console.error('schema-model-parity-guard: the model declares schema the database does not have.\n');
  for (const d of unexpected) {
    console.error(`  • MISSING ${d.kind.padEnd(6)} ${d.table}${d.column === '*' ? '' : `.${d.column}`}`);
  }
  console.error(
    '\nA modeled-but-absent column throws at runtime the first time any query, view or\n' +
      'TRIGGER names it — and a fire-and-forget caller will swallow that throw, which is\n' +
      'how the ops_events spine went silent for four days (2026-08-02b). Add the migration\n' +
      '(expand lands FIRST — AGENTS.md / schema migrate before code), or delete the declaration\n' +
      'from src/lib/drizzle/schema.ts if the column is genuinely not wanted.\n',
  );
}

if (resolved.length) {
  console.error('schema-model-parity-guard: allowlist entries that no longer drift — DELETE these lines:\n');
  for (const e of resolved) {
    console.error(`  • ${e.table}${e.column === '*' ? '' : `.${e.column}`}  (${ALLOWLIST_REL})`);
  }
  console.error('\nThe allowlist is shrink-only: a fixed item must leave it, never linger as cover.\n');
}

process.exit(check ? 1 : 0);
