import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Fails when application SQL references a column that no migration creates —
 * the **expand/contract** gate.
 *
 * Twice on 2026-08-01 code shipped ahead of its column, and no gate fired:
 *
 *   | column                                     | route                    | symptom          |
 *   |--------------------------------------------|--------------------------|------------------|
 *   | `receiving_line_testing.condition_graded_at`| `/api/receiving-lines`  | loud 500         |
 *   | `staff.avatar_photo_id`                     | `/api/auth/staff-picker`| SILENT empty — sign-in down |
 *
 * `npm run verify` was green on schema-drift throughout, because that guard
 * watches a different thing (the Drizzle model vs the DB), not "does the SQL in
 * this repo name a column that exists". Both incidents are reproduced by the
 * two checks below: the first is a QUALIFIED reference (`rlt.condition_graded_at`),
 * the second a BARE one in a single-table select.
 *
 * ── Precision over recall, deliberately ─────────────────────────────────────
 * A SQL-in-template-literal scanner cannot be sound, so this gate is tuned to
 * be quiet rather than complete:
 *
 *   - `${...}` interpolations are blanked (they are JS, not SQL);
 *   - `AS <alias>` outputs and CTE names are treated as legal references;
 *   - check B only runs on a single-table `SELECT … FROM t` with no JOIN and no
 *     subquery, where `t`'s columns were parsed with confidence.
 *
 * The **resolver-confidence** rule in check B is the load-bearing one: a real
 * missing column is one odd name among many that resolve, whereas a table where
 * *most* names miss means this file failed to parse that table's DDL. Shouting
 * in the second case would train everyone to ignore the gate. So it stays
 * silent there — a false negative is recoverable, a noisy gate is not.
 *
 * ── Known gaps, so nobody trusts this further than it goes ──────────────────
 *   - **A renamed-away column still resolves.** `RENAME COLUMN a TO b` adds `b`
 *     but does not retire `a`, because a migration that *creates* `a` ran
 *     earlier and this file replays history additively. Live example:
 *     `work_assignments.assignee_staff_id` was renamed to `assigned_tech_id`
 *     long ago, yet an INSERT naming the old column still passes here — it was
 *     caught by `pnpm provision:qa-org` failing at runtime on 2026-08-02, not by
 *     this gate. Retiring names needs a DROP/RENAME replay in file order.
 *   - **Only `SELECT … FROM` is scanned.** INSERT column lists and UPDATE SET
 *     clauses are not, which is the other half of that same miss.
 *   - **`scripts/` is not scanned** — only `src/app/api` and `src/lib`.
 *
 * Both allowlists are **frozen and shrink-only**. They are keyed on names
 * (`column`, `table.column`) rather than `file:line` so they survive refactors.
 */

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(MIGRATIONS_DIR, '..', '..', '..');
const SCAN_ROOTS = [join(REPO_ROOT, 'src', 'app', 'api'), join(REPO_ROOT, 'src', 'lib')];

/**
 * Column names the resolver cannot currently account for — overwhelmingly CTE
 * and derived-table outputs whose defining `SELECT` lives in a *different*
 * template literal than the reference. FROZEN: never add. A new entry means a
 * column that exists nowhere, which is the bug this gate is for.
 */
const KNOWN_UNRESOLVED_COLUMNS = new Set([
  'age_band', 'candidate', 'default_station', 'duration', 'eid',
  'embedding_text', 'etype', 'has_scan', 'header', 'id_num', 'line_po',
  // 'relforcerowsecurity' removed 2026-08-08 — the allowlist only shrinks, and
  // the guard reported it as now-resolving once 2026-08-08b referenced it in
  // its qualified `pg_class.relforcerowsecurity` form (the two earlier
  // references, in 2026-07-28_order_notes and 2026-07-31_order_flags, were not).
  'nasbackup', 'on_hand', 'ord', 'packed_at', 'pid',
  'scan', 'serial_count', 'session_key',
  'sku_summary', 'suggestion_count', 'top_confidence', 'tracking_number_key18',
]);

/**
 * `table.column` pairs check B cannot resolve. FROZEN, shrink-only.
 *
 * Two of these look like genuine rot rather than parser gaps and are worth a
 * look when someone is next in that code: `orders.serial_number` and
 * `orders.tested_by` in `src/app/api/tech-logs/search/route.ts` — the repo
 * contains `remove_tester_id_from_orders.sql`. Left as-is here because this
 * change is a gate, not a refactor of another lane's route.
 */
const KNOWN_UNRESOLVED_TABLE_COLUMNS = new Set([
  'ai_chat_messages.organization_id',
  'ai_usage_events.filter',
  'email_delivery_signals.delivered_at',
  'fba_shipment_items.filter',
  'fba_shipments.organization_id',
  'fba_tracking_item_allocations.organization_id',
  'listing_photos.photo_id',
  'orders.serial_number',
  'orders.tested_by',
  'packer_logs.order_id',
  'receiving_carton.organization_id',
  'serial_units.organization_id',
  'serial_units.receiving_line_id',
  'shipment_tracking_events.event_occurred_at',
  'station_activity_logs.hh24',
  'unfound_overlay.zendesk_ticket_id',
]);

/** Qualifiers that are catalogs or GUC namespaces, never tables. */
const SYSTEM_QUALIFIERS = new Set([
  'information_schema', 'pg_catalog', 'pg', 'app', 'current_setting', 'excluded',
]);

/** JS member names that survive into a literal despite interpolation blanking. */
const JS_MEMBERS = new Set([
  'join', 'length', 'split', 'map', 'filter', 'push', 'slice', 'trim', 'replace',
  'includes', 'indexof', 'concat', 'sort', 'keys', 'values', 'entries', 'find',
  'some', 'every', 'reduce', 'flat', 'has', 'get', 'set', 'add', 'size', 'then',
  'catch', 'tostring', 'touppercase', 'tolowercase', 'ts', 'pdf', 'g', 'sql',
]);

const SQL_KEYWORDS = new Set([
  'count', 'sum', 'max', 'min', 'avg', 'coalesce', 'now', 'null', 'true', 'false',
  'distinct', 'case', 'when', 'then', 'else', 'end', 'and', 'or', 'not', 'as',
  'from', 'where', 'select', 'on', 'is', 'in', 'exists', 'cast', 'array',
  'string_agg', 'json_agg', 'jsonb_agg', 'row_number', 'extract', 'date_trunc',
  'nullif', 'greatest', 'least', 'lower', 'upper', 'trim', 'btrim', 'concat',
  'left', 'right', 'length', 'abs', 'round', 'interval', 'current_setting',
  'timezone', 'to_char', 'any', 'all', 'asc', 'desc',
]);

const COLUMN_TYPE_WORDS =
  'text|varchar|char|integer|int|int4|int8|bigint|smallint|serial|bigserial|uuid|' +
  'boolean|bool|numeric|decimal|real|double|timestamptz|timestamp|date|time|jsonb|' +
  'json|bytea|inet|citext|tsvector|vector';

// ── Schema universe ─────────────────────────────────────────────────────────

const tableColumns = new Map<string, Set<string>>();
const allColumns = new Set<string>();

function recordColumn(table: string, column: string): void {
  const t = table.toLowerCase().replace(/"/g, '').replace(/^public\./, '');
  const c = column.toLowerCase();
  if (!tableColumns.has(t)) tableColumns.set(t, new Set());
  tableColumns.get(t)!.add(c);
  allColumns.add(c);
}

/** Balanced `(...)` beginning at `openIdx`. */
function parenBody(sql: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) return sql.slice(openIdx + 1, i);
    }
  }
  return null;
}

/** Split on top-level commas only — column defs nest `numeric(10,2)` etc. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseCreateTables(sql: string): void {
  const re =
    /CREATE\s+(?:UNLOGGED\s+|TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const body = parenBody(sql, re.lastIndex - 1);
    if (body == null) continue;
    for (const part of splitTopLevel(body)) {
      const t = part.trim();
      if (!t || /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i.test(t)) continue;
      const cm = /^"?([a-z_][a-z0-9_]*)"?[\s"]/i.exec(t);
      if (cm) recordColumn(m[1], cm[1]);
    }
  }
}

function loadSchema(): void {
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!/\.sql(\.gated)?$/.test(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    parseCreateTables(sql);
    // One ALTER TABLE may carry several comma-separated ADD COLUMNs
    // (`ALTER TABLE t ADD COLUMN a TEXT, ADD COLUMN b INT`). Anchoring on the
    // table and then sweeping the whole statement catches every one; matching
    // `ALTER TABLE … ADD COLUMN` per-occurrence only ever caught the first, and
    // silently lost four live columns (relative_path, folder_path,
    // packed_item_count, zoho_uploaded_po_number).
    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)([\s\S]*?);/gi,
    )) {
      for (const c of m[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        recordColumn(m[1], c[1]);
      }
    }
    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)\s+RENAME\s+COLUMN\s+"?[a-z_][a-z0-9_]*"?\s+TO\s+"?([a-z_][a-z0-9_]*)"?/gi,
    )) recordColumn(m[1], m[2]);
    // Loose sources for the GLOBAL name set only (check A) — a column def line
    // by type keyword, an `AS` output, and any qualified ref inside a view body.
    for (const m of sql.matchAll(
      new RegExp(`^\\s*"?([a-z_][a-z0-9_]*)"?\\s+(?:${COLUMN_TYPE_WORDS})\\b`, 'gim'),
    )) allColumns.add(m[1].toLowerCase());
    for (const m of sql.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      allColumns.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/\bAS\s+"?([a-z_][a-z0-9_]*)"?/gi)) allColumns.add(m[1].toLowerCase());
    for (const m of sql.matchAll(/\b[a-z_][a-z0-9_]*\.([a-z_][a-z0-9_]*)\b/gi)) {
      allColumns.add(m[1].toLowerCase());
    }
  }

  const drizzle = readFileSync(join(REPO_ROOT, 'src/lib/drizzle/schema.ts'), 'utf8');
  for (const m of drizzle.matchAll(/pgTable\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*\{/g)) {
    const open = drizzle.indexOf('{', m.index! + m[0].length - 1);
    const body = (() => {
      let depth = 0;
      for (let i = open; i < drizzle.length; i++) {
        if (drizzle[i] === '{') depth++;
        else if (drizzle[i] === '}') { depth--; if (!depth) return drizzle.slice(open, i); }
      }
      return null;
    })();
    if (body == null) continue;
    for (const c of body.matchAll(/\b\w+\s*:\s*\w+\(\s*'([a-z_][a-z0-9_]*)'/g)) recordColumn(m[1], c[1]);
  }
}

// ── Source scan ─────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(entry) === '.ts' && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

interface SqlLiteral { file: string; line: number; sql: string }

function sqlLiterals(): SqlLiteral[] {
  const out: SqlLiteral[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/`([^`]*)`/g)) {
        // Interpolations are JS expressions, not SQL — blank them so
        // `${fields.join(',')}` is not read as a column reference.
        const sql = m[1].replace(/\$\{[^}]*\}/g, ' ? ');
        if (!/\bSELECT\b[\s\S]*\bFROM\b/i.test(sql)) continue;
        out.push({
          file: relative(REPO_ROOT, file).split('\\').join('/'),
          line: src.slice(0, m.index!).split('\n').length,
          sql,
        });
      }
    }
  }
  return out;
}

loadSchema();
const LITERALS = sqlLiterals();

test('schema universe parsed enough to be meaningful', () => {
  assert.ok(tableColumns.size > 200, `only ${tableColumns.size} tables parsed — DDL parser broke`);
  assert.ok(allColumns.size > 1500, `only ${allColumns.size} columns parsed — DDL parser broke`);
  assert.ok(LITERALS.length > 100, `only ${LITERALS.length} SQL literals found — scanner broke`);
});

/** Every qualified reference the resolver cannot account for, allowlist aside. */
function unresolvedQualified(): Map<string, string> {
  const fresh = new Map<string, string>();
  for (const { file, line, sql } of LITERALS) {
    const local = new Set<string>();
    for (const a of sql.matchAll(/\bAS\s+"?([a-z_][a-z0-9_]*)"?/gi)) local.add(a[1].toLowerCase());
    for (const r of sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi)) {
      const qualifier = r[1].toLowerCase();
      const column = r[2].toLowerCase();
      if (SYSTEM_QUALIFIERS.has(qualifier) || JS_MEMBERS.has(column)) continue;
      if (allColumns.has(column) || local.has(column)) continue;
      if (!fresh.has(column)) fresh.set(column, `${file}:${line}`);
    }
  }
  return fresh;
}

test('A — every QUALIFIED column reference resolves to a real column', () => {
  const fresh = new Map(
    [...unresolvedQualified()].filter(([c]) => !KNOWN_UNRESOLVED_COLUMNS.has(c)),
  );
  assert.deepEqual(
    [...fresh.keys()],
    [],
    'SQL references a column that no migration creates (expand/contract violation —\n' +
      'the migration must land BEFORE the code that reads it):\n' +
      [...fresh].map(([c, at]) => `  ${c}  ← ${at}`).join('\n'),
  );
});

/** Every single-table bare miss the resolver is confident about, allowlist aside. */
function unresolvedBare(): Map<string, string> {
  const fresh = new Map<string, string>();
  for (const { file, line, sql } of LITERALS) {
    const froms = [...sql.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/gi)];
    if (froms.length !== 1) continue;
    if (/\bJOIN\b/i.test(sql)) continue;
    if ((sql.match(/\bSELECT\b/gi) || []).length !== 1) continue;

    const table = froms[0][1].toLowerCase();
    const columns = tableColumns.get(table);
    if (!columns) continue;

    const selectList = sql
      .slice(sql.search(/\bSELECT\b/i) + 'SELECT'.length, froms[0].index!)
      .replace(/\bAS\s+"?[a-z_][a-z0-9_]*"?/gi, ' ');

    const seen: string[] = [];
    const misses: string[] = [];
    for (const idm of selectList.matchAll(/(^|[\s,(])([a-z_][a-z0-9_]*)(?![\w(.])/gi)) {
      const id = idm[2].toLowerCase();
      if (SQL_KEYWORDS.has(id)) continue;
      seen.push(id);
      if (!columns.has(id)) misses.push(id);
    }

    // Resolver confidence — see the header note. Mostly-missing means this file
    // failed to parse the table, not that the query is wrong.
    if (seen.length < 3) continue;
    if (misses.length > 2 || misses.length / seen.length > 0.34) continue;

    for (const id of misses) {
      const key = `${table}.${id}`;
      if (!fresh.has(key)) fresh.set(key, `${file}:${line}`);
    }
  }
  return fresh;
}

test('B — bare columns in a single-table SELECT resolve against that table', () => {
  const fresh = new Map(
    [...unresolvedBare()].filter(([c]) => !KNOWN_UNRESOLVED_TABLE_COLUMNS.has(c)),
  );
  assert.deepEqual(
    [...fresh.keys()],
    [],
    'a single-table SELECT names a column that table does not have (expand/contract\n' +
      'violation — the migration must land BEFORE the code that reads it):\n' +
      [...fresh].map(([c, at]) => `  ${c}  ← ${at}`).join('\n'),
  );
});

test('both allowlists only shrink — no stale entries', () => {
  const liveQualified = new Set(unresolvedQualified().keys());
  const liveBare = new Set(unresolvedBare().keys());

  const staleQualified = [...KNOWN_UNRESOLVED_COLUMNS].filter((c) => !liveQualified.has(c));
  const staleBare = [...KNOWN_UNRESOLVED_TABLE_COLUMNS].filter((c) => !liveBare.has(c));

  assert.deepEqual(
    staleQualified,
    [],
    `KNOWN_UNRESOLVED_COLUMNS lists entries that now resolve: ${staleQualified.join(', ')}. ` +
      'Delete them — the allowlist only shrinks.',
  );
  assert.deepEqual(
    staleBare,
    [],
    `KNOWN_UNRESOLVED_TABLE_COLUMNS lists entries that now resolve: ${staleBare.join(', ')}. ` +
      'Delete them — the allowlist only shrinks.',
  );
});
