/**
 * Hard law: a declared table lineage must match the SQL that actually runs.
 *
 * The Procedure lens draws "this step reads X and writes Y" from declarations on
 * `DataSourceDefinition` / `ActionDefinition` / `ProcedureStep`. Declarations
 * drift — someone adds a join and forgets the descriptor — and a lineage map
 * that silently goes stale is the same failure as one that was wrong to begin
 * with, because people ACT on it. So the declaration is checked against the
 * module's own SQL, in BOTH directions:
 *
 *   • touched but not declared  → the diagram is missing an edge (FAIL)
 *   • declared but not touched  → the diagram shows a phantom edge (FAIL)
 *
 * Source guard, not a live-DB test: it parses SQL string literals out of the
 * module and matches relation names. That is deliberately table-level. Column
 * lineage would need a real SQL parser, and a parser that fails open recreates
 * the untrusted map this guard exists to prevent — the industry agrees
 * (dbt's native lineage is table-level; OpenLineage keeps column lineage an
 * OPTIONAL facet a producer may simply omit).
 *
 * KNOWN BOUND, stated so nobody mistakes a pass for more than it is: a route's
 * OWN SQL is checked exhaustively, and every `via` claim is verified against the
 * named helper. Tables reached through a helper the author did NOT name are not
 * forced into the declaration — module-level attribution over-counts (a route
 * calling one function from a big query lib would inherit that lib's whole
 * table set), and over-counting produces exactly the false edges this guard
 * rejects. What defends against a vacuously-empty declaration is
 * `test: a delegating endpoint must name where its writes live` below.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/stations/data-lineage.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TableRef } from './contract';
import { listDataSources } from './data-sources';
import { listProcedures, type ProcedureStep } from './procedure';
import { registerStationBuiltins } from './index';

registerStationBuiltins();

const SRC = fileURLToPath(new URL('../..', import.meta.url));
const API = join(SRC, 'app/api');

/**
 * Registry ids that MUST carry a lineage declaration. Lineage is adopted per
 * station, so the field stays optional on the type — this list is what makes
 * removing a shipped declaration a failure rather than a silent downgrade.
 * It only grows.
 */
const LINEAGE_REQUIRED = ['receiving.unbox_queue'] as const;

/**
 * Modules whose SQL is cross-cutting infrastructure — the same on essentially
 * every route (audit rows, idempotency replay, tenancy, cache, realtime). They
 * are excluded from the delegation check because putting `audit_logs` on all
 * forty steps makes the map unreadable and teaches an operator nothing about
 * where their carton's data went.
 */
const INFRA_MODULE_PREFIXES = [
  '@/lib/audit-logs',
  '@/lib/api-idempotency',
  '@/lib/tenancy/',
  '@/lib/cache/',
  '@/lib/realtime/',
  '@/lib/auth/',
  '@/lib/db',
  '@/lib/observability/',
  '@/lib/feature-flags',
];

/**
 * Modules that build the relation name at RUNTIME (`INSERT INTO ${table}`), so
 * no textual match can resolve them. Listing one here is an admission the guard
 * cannot verify that module — never a way to silence a check on a module it
 * could have read. Each entry states the union it dispatches over.
 */
const UNRESOLVABLE_SQL_MODULES: Record<string, string> = {
  '@/lib/receiving/facts/narrow':
    'partial upsert dispatched over the NarrowTable union (receiving_line_zoho | _testing | _return | _putaway)',
};

// ─── Known relations (derived, never hand-listed) ────────────────────────────
//
// A textual scan picks up prose that merely sits next to a SQL keyword. Rather
// than blocklist the noise, we allowlist reality: every relation any migration
// creates, plus everything the Drizzle model declares. An identifier absent from
// both cannot be a table — nothing else creates one.

function knownRelations(): Set<string> {
  const names = new Set<string>();
  const migrations = join(SRC, 'lib/migrations');
  for (const file of readdirSync(migrations)) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(migrations, file), 'utf8');
    const re =
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) names.add(m[1].toLowerCase());
  }
  const schema = readFileSync(join(SRC, 'lib/drizzle/schema.ts'), 'utf8');
  const dz = /\bpg(?:Table|View|MaterializedView)\(\s*'([a-z_][a-z0-9_]*)'/g;
  let d: RegExpExecArray | null;
  while ((d = dz.exec(schema))) names.add(d[1].toLowerCase());
  return names;
}

const KNOWN = knownRelations();

// ─── SQL extraction ──────────────────────────────────────────────────────────

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
}

/**
 * Each template literal, scanned INDEPENDENTLY. Concatenating them fabricates
 * matches across the seam: a literal ending `FOR UPDATE` followed by one opening
 * `INSERT INTO …` reads as `UPDATE INSERT`.
 */
function sqlLiterals(src: string): string[] {
  const out: string[] = [];
  const re = /`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

const READ_RE = /\b(?:FROM|JOIN)\s+(?:ONLY\s+)?([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?/gi;
// `FOR UPDATE` / `FOR NO KEY UPDATE` locks rows on a READ — never a write.
const WRITE_RE =
  /\b(?:INSERT\s+INTO|(?<!FOR\s)(?<!FOR\sNO\sKEY\s)UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?/gi;

function relationsIn(literals: string[], re: RegExp): Set<string> {
  const found = new Set<string>();
  for (const text of literals) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const schema = m[2] ? m[1].toLowerCase() : null;
      const name = (m[2] ?? m[1]).toLowerCase();
      if (schema && schema !== 'public') continue; // information_schema, pg_catalog
      if (!KNOWN.has(name)) continue; // prose, aliases, CTE names, pseudo-tables
      found.add(name);
    }
  }
  return found;
}

/** True when a literal interpolates the relation position — unresolvable textually. */
function hasInterpolatedRelation(literals: string[]): boolean {
  return literals.some((t) =>
    /\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+\$\{/i.test(t),
  );
}

interface ModuleSql {
  path: string;
  reads: Set<string>;
  writes: Set<string>;
  interpolated: boolean;
}

const moduleCache = new Map<string, ModuleSql | null>();

function readModule(path: string): ModuleSql | null {
  if (moduleCache.has(path)) return moduleCache.get(path)!;
  let value: ModuleSql | null = null;
  if (existsSync(path)) {
    const literals = sqlLiterals(stripComments(readFileSync(path, 'utf8')));
    value = {
      path,
      reads: relationsIn(literals, READ_RE),
      writes: relationsIn(literals, WRITE_RE),
      interpolated: hasInterpolatedRelation(literals),
    };
  }
  moduleCache.set(path, value);
  return value;
}

/** `@/lib/x/y` → the file on disk, or null. */
function resolveAlias(spec: string): string | null {
  const base = resolve(SRC, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, `${base}.tsx`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * `/api/receiving/lines/:id/condition` → the route module. Dynamic segments are
 * `[id]` on disk; `:id` in a descriptor is the station-builder convention.
 */
function resolveRoute(endpoint: string): string | null {
  const clean = endpoint.split('?')[0].replace(/^\/api\//, '');
  const direct = join(API, clean, 'route.ts');
  if (existsSync(direct)) return direct;
  const bracketed = clean
    .split('/')
    .map((seg) => (seg.startsWith(':') ? `[${seg.slice(1)}]` : seg))
    .join('/');
  const dynamic = join(API, bracketed, 'route.ts');
  return existsSync(dynamic) ? dynamic : null;
}

/** First-party, non-infrastructure imports of a module. */
function helperImports(src: string): string[] {
  const out = new Set<string>();
  const re = /from\s+'(@\/[^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (INFRA_MODULE_PREFIXES.some((p) => spec.startsWith(p))) continue;
    out.add(spec);
  }
  return [...out];
}

// ─── The subjects under guard ────────────────────────────────────────────────

interface Subject {
  /** Human label used in assertion messages. */
  name: string;
  endpoint: string;
  reads: TableRef[];
  writes: TableRef[];
}

function subjects(): Subject[] {
  const out: Subject[] = [];
  for (const src of listDataSources()) {
    if (!src.reads && !src.writes) continue;
    out.push({
      name: `data source ${src.id}`,
      endpoint: src.endpoint,
      reads: src.reads ?? [],
      writes: src.writes ?? [],
    });
  }
  for (const proc of listProcedures()) {
    for (const step of proc.steps) {
      if (step.composed || !step.endpoint) continue;
      out.push({
        name: `${proc.surface} step "${step.key}"`,
        endpoint: step.endpoint.path,
        reads: step.reads ?? [],
        writes: step.writes ?? [],
      });
    }
  }
  return out;
}

const SUBJECTS = subjects();

test('every guarded endpoint resolves to a route module on disk', () => {
  for (const s of SUBJECTS) {
    assert.ok(
      resolveRoute(s.endpoint),
      `${s.name}: no route module for "${s.endpoint}" — a lineage claim about a route that does not exist can never be checked`,
    );
  }
});

test('every table a route’s own SQL touches is declared', () => {
  for (const s of SUBJECTS) {
    const path = resolveRoute(s.endpoint)!;
    const mod = readModule(path)!;
    const declaredReads = new Set(s.reads.filter((r) => !r.via).map((r) => r.table));
    const declaredWrites = new Set(s.writes.filter((w) => !w.via).map((w) => w.table));
    // A table declared as written is implicitly readable in the same statement
    // (UPDATE … WHERE, INSERT … ON CONFLICT), so writes satisfy a read too.
    for (const table of mod.reads) {
      assert.ok(
        declaredReads.has(table) || declaredWrites.has(table),
        `${s.name}: reads "${table}" but never declares it — add { table: '${table}' } to reads`,
      );
    }
    for (const table of mod.writes) {
      assert.ok(
        declaredWrites.has(table),
        `${s.name}: writes "${table}" but never declares it — add { table: '${table}' } to writes`,
      );
    }
  }
});

test('no declaration names a table its module never touches', () => {
  for (const s of SUBJECTS) {
    const routePath = resolveRoute(s.endpoint)!;
    const check = (refs: TableRef[], kind: 'reads' | 'writes') => {
      for (const ref of refs) {
        assert.ok(
          KNOWN.has(ref.table),
          `${s.name}: declares "${ref.table}", which no migration or Drizzle model creates`,
        );
        if (ref.via && UNRESOLVABLE_SQL_MODULES[ref.via]) continue; // admitted blind spot
        const path = ref.via ? resolveAlias(ref.via) : routePath;
        assert.ok(path, `${s.name}: via "${ref.via}" does not resolve to a module`);
        const mod = readModule(path)!;
        const touched = kind === 'reads' ? new Set([...mod.reads, ...mod.writes]) : mod.writes;
        assert.ok(
          touched.has(ref.table),
          `${s.name}: declares ${kind} of "${ref.table}"${
            ref.via ? ` via ${ref.via}` : ''
          }, but that module's SQL never ${kind === 'reads' ? 'reads' : 'writes'} it — a phantom edge on the diagram`,
        );
      }
    };
    check(s.reads, 'reads');
    check(s.writes, 'writes');
  }
});

test('a delegating endpoint must name where its writes live', () => {
  // The vacuous pass this closes: a route whose own module holds no SQL trivially
  // satisfies "everything you touch is declared" while doing all its work — and
  // all its writes — inside a helper.
  for (const s of SUBJECTS) {
    const path = resolveRoute(s.endpoint)!;
    const mod = readModule(path)!;
    if (mod.reads.size > 0 || mod.writes.size > 0 || mod.interpolated) continue;
    const src = readFileSync(path, 'utf8');
    const helpers = helperImports(src).filter((spec) => {
      const p = resolveAlias(spec);
      if (!p) return false;
      const h = readModule(p);
      return !!h && (h.reads.size > 0 || h.writes.size > 0 || h.interpolated);
    });
    if (helpers.length === 0) continue;
    const named = new Set([...s.reads, ...s.writes].map((r) => r.via).filter(Boolean));
    assert.ok(
      named.size > 0,
      `${s.name}: its route module runs no SQL of its own, yet delegates to ${helpers.join(
        ', ',
      )} — declare at least one { table, via } so the map says where the data actually goes`,
    );
  }
});

test('every id in LINEAGE_REQUIRED still declares its lineage', () => {
  const byId = new Map(listDataSources().map((s) => [s.id, s]));
  for (const id of LINEAGE_REQUIRED) {
    const src = byId.get(id);
    assert.ok(src, `LINEAGE_REQUIRED names "${id}", which is not a registered data source`);
    assert.ok(
      src.reads !== undefined && src.writes !== undefined,
      `${id} is in LINEAGE_REQUIRED but no longer declares reads/writes — lineage baselines only grow`,
    );
  }
});

test('a code-only procedure step declares an endpoint and its lineage', () => {
  const hasLineage = (s: ProcedureStep) => (s.reads?.length ?? 0) + (s.writes?.length ?? 0) > 0;
  for (const proc of listProcedures()) {
    assert.ok(proc.steps.length > 0, `${proc.surface}: a procedure with no steps describes nothing`);
    for (const step of proc.steps) {
      if (step.composed) {
        assert.ok(
          (step.sourceIds?.length ?? 0) + (step.actionIds?.length ?? 0) > 0,
          `${proc.surface}/${step.key}: marked composed but names no registry id`,
        );
        assert.ok(
          !hasLineage(step),
          `${proc.surface}/${step.key}: composed steps inherit lineage from their source/action — restating it forks the SoT`,
        );
        continue;
      }
      assert.ok(
        step.endpoint,
        `${proc.surface}/${step.key}: a code-only step must name the route it drives, or the guard has nothing to check`,
      );
      assert.ok(
        hasLineage(step),
        `${proc.surface}/${step.key}: a code-only step must declare the data it touches`,
      );
    }
  }
});

test('every source id a composed step names is registered', () => {
  const sourceIds = new Set(listDataSources().map((s) => s.id));
  for (const proc of listProcedures()) {
    for (const step of proc.steps) {
      for (const id of step.sourceIds ?? []) {
        assert.ok(
          sourceIds.has(id),
          `${proc.surface}/${step.key}: names unregistered data source "${id}"`,
        );
      }
    }
  }
});
