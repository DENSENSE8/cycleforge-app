/**
 * Tenancy isolation guard (CI gate).
 *
 * Two self-activating invariants. Both PASS today (no table is enforced yet)
 * and start FAILING the moment a regression is introduced — so they can be
 * wired into CI now and tighten automatically as Phase E rolls out.
 *
 *   (A) Static enforcement gate (no DB needed):
 *       For every table that is FORCEd (from docs/tenancy/coverage.generated.json),
 *       EVERY route that touches it (docs/tenancy/route-audit.generated.json
 *       reverse index) must be GUC-wrapped (risk 'low'), carry a `route::table`
 *       exemption (a claim of correctness), or be listed in
 *       scripts/tenancy-guard-baseline.json (known debt — warns, and the guard
 *       fails if a baselined pair stops violating, so the list only shrinks).
 *       If a raw-pool route touches an enforced table it would silently get
 *       zero rows in prod — fail the build instead. Every exemption entry must
 *       also carry an `addedAt` review date (YYYY-MM-DD); a missing stamp is a
 *       hard failure, so an entry can never outlive its last honest review.
 *
 *   (B) Live role invariant (needs a DB URL):
 *       If ANY table is FORCEd in the live catalog, the role that serves TENANT
 *       traffic must NOT have rolbypassrls. This mirrors the runtime two-pool
 *       split in src/lib/db.ts: the GUC wrappers run on `tenantPool`, whose DSN
 *       is TENANT_APP_DATABASE_URL if set, else it ALIASES the owner pool. So
 *       the invariant checks TENANT_APP_DATABASE_URL when present (the
 *       `app_tenant` non-bypass role) and only falls back to DATABASE_URL when
 *       the tenant DSN is unset (the dangerous alias case the app would run in).
 *       The owner pool itself having BYPASSRLS is correct-by-design post-E1
 *       (admin/cron/raw-pool paths); flagging it would be a false alarm.
 *       BYPASSRLS DEFEATS FORCE (empirically confirmed), so a bypass tenant role
 *       while tables are FORCEd ships RLS that looks on but is fully bypassed —
 *       a hard CI failure.
 *
 * Usage:
 *   npx tsx scripts/tenancy-guard.ts            # report both invariants
 *   npx tsx scripts/tenancy-guard.ts --check    # exit 1 on violation (CI)
 *   --static-only   run only (A) (no DB); --live-only run only (B) (needs a DB URL).
 *     Lets CI enforce the keystone role invariant (B) independently of the
 *     route-coverage gate (A), which over-counts until the route audit can see
 *     through helper delegation.
 *
 * Keep the generated docs fresh first:
 *   node scripts/tenancy-coverage.mjs && node scripts/tenancy-route-audit.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_TENANCY_EXEMPTIONS } from './tenancy-guard-exemptions';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const liveOnly = process.argv.includes('--live-only');
const staticOnly = process.argv.includes('--static-only');
const listExemptions = process.argv.includes('--list-exemptions');
const runStatic = !liveOnly;
const runLive = !staticOnly;

const coveragePath = join(repoRoot, 'docs/tenancy/coverage.generated.json');
const routePath = join(repoRoot, 'docs/tenancy/route-audit.generated.json');
const BASELINE_REL = 'scripts/tenancy-guard-baseline.json';
const baselinePath = join(repoRoot, BASELINE_REL);

/**
 * Loads the ratchet baseline: the `route::table` pairs that are KNOWN debt today,
 * so the guard can fail on new violations while the existing ones only ever get
 * removed from the file — a missing file means zero tolerated debt.
 */
function loadBaseline(): string[] {
  if (!existsSync(baselinePath)) return [];
  const parsed = JSON.parse(readFileSync(baselinePath, 'utf8')) as { entries?: string[] };
  return parsed.entries ?? [];
}

type ResolvedExemption = {
  /** the allowlist key that matched — `route::table`, or the bare route for a legacy entry */
  key: string;
  exemption: (typeof ROUTE_TENANCY_EXEMPTIONS)[string];
  legacy: boolean;
};

/**
 * Resolves the exemption for ONE (route, table) pair: an exemption only ever
 * suppresses the table it was written for, and a bare-route key is accepted as a
 * deprecated legacy fallback so no single entry silently covers a second table.
 */
function resolveExemption(route: string, table: string): ResolvedExemption | null {
  const compositeKey = `${route}::${table}`;
  const exact = ROUTE_TENANCY_EXEMPTIONS[compositeKey];
  if (exact) return { key: compositeKey, exemption: exact, legacy: false };
  const legacy = ROUTE_TENANCY_EXEMPTIONS[route];
  if (legacy) return { key: route, exemption: legacy, legacy: true };
  return null;
}

async function main() {
try {
  const { config } = await import('dotenv');
  config({ path: join(repoRoot, '.env.local'), quiet: true });
  config({ path: join(repoRoot, '.env'), quiet: true });
} catch {
  /* dotenv optional — CI passes DATABASE_URL via env */
}

const violations: string[] = [];

// ── exemption schema gate ───────────────────────────────────────────────────
// Every allowlist entry must carry addedAt (YYYY-MM-DD) — the date it was last
// reviewed/admitted — so exemptions stay traceable to a human decision. A
// missing or malformed stamp is a hard failure even alongside otherwise-clean
// runs: it means the entry bypassed the discipline the allowlist depends on.
for (const [key, entry] of Object.entries(ROUTE_TENANCY_EXEMPTIONS)) {
  if (typeof entry.addedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.addedAt)) {
    violations.push(
      `exemption "${key}" lacks a valid addedAt (YYYY-MM-DD) — record the date this exemption was last reviewed`,
    );
  }
}

// ── (A) static enforcement gate ─────────────────────────────────────────────
if (runStatic) {
  if (!existsSync(coveragePath) || !existsSync(routePath)) {
    console.error(
      'Missing generated audits. Run:\n' +
        '  node scripts/tenancy-coverage.mjs && node scripts/tenancy-route-audit.mjs',
    );
    process.exit(check ? 1 : 0);
  }

  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8')) as {
    tables: { table: string; rls_forced: boolean }[];
  };
  const routeAudit = JSON.parse(readFileSync(routePath, 'utf8')) as {
    routes: { route: string; risk: string; touched: string[] }[];
  };

  const enforced = coverage.tables.filter((t) => t.rls_forced).map((t) => t.table);
  const enforcedSet = new Set(enforced);

  // A route that touches a FORCEd table on the raw owner pool would silently get
  // zero rows in prod. It clears the gate only if it is EITHER GUC-wrapped
  // (risk 'low') OR every offending table carries a documented, by-design
  // exemption in ROUTE_TENANCY_EXEMPTIONS. Exemptions are keyed
  // `route::table` — a route-only key is still honoured as a DEPRECATED legacy
  // fallback (the 2026-09 allowlist predates the re-key) but it blanket-exempts
  // every table the route touches, which is how a real /api/receiving-tasks leak
  // hid behind a "no-db-false-positive" note. Anything else is an unresolved
  // violation — so the gate stays a ratchet that catches NEW leaks.
  const baseline = loadBaseline();
  const unresolvedBaseline = new Set(baseline);
  const exemptByCategory: Record<string, number> = {};
  const matchedExemptions = new Set<string>();
  const legacyKeyedRoutes = new Set<string>();
  const exemptLines: string[] = [];
  const baselinedPairs: string[] = [];
  let staticViolations = 0;
  for (const r of routeAudit.routes) {
    if (r.risk === 'low') continue;
    const offending = r.touched.filter((t) => enforcedSet.has(t));
    if (!offending.length) continue;
    const unexempt: string[] = [];
    for (const table of offending) {
      const pair = `${r.route}::${table}`;
      const hit = resolveExemption(r.route, table);
      if (!hit) {
        // Known debt: warn, do not fail. Unknown debt: fail. Either way the pair
        // leaves the baseline the moment the route is GUC-wrapped (below).
        if (unresolvedBaseline.delete(pair)) baselinedPairs.push(pair);
        else unexempt.push(table);
        continue;
      }
      matchedExemptions.add(hit.key);
      if (hit.legacy) legacyKeyedRoutes.add(r.route);
      exemptByCategory[hit.exemption.category] = (exemptByCategory[hit.exemption.category] ?? 0) + 1;
      exemptLines.push(
        `  EXEMPT: ${hit.exemption.category} — ${pair}${hit.legacy ? ' (legacy route-only key)' : ''} — ${hit.exemption.reason}`,
      );
    }
    if (!unexempt.length) continue;
    staticViolations++;
    violations.push(
      `route ${r.route} (risk=${r.risk}) touches ENFORCED table(s) [${unexempt.join(', ')}] but is not GUC-wrapped, allowlisted or baselined`,
    );
  }

  const catSummary = Object.entries(exemptByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}=${n}`)
    .join(', ');
  console.log(
    `Tenancy guard (A): ${enforced.length} enforced table(s); ` +
      `${matchedExemptions.size} documented exemption(s)${catSummary ? ` (${catSummary})` : ''}; ` +
      `${baselinedPairs.length}/${baseline.length} baselined debt pair(s); ` +
      `${staticViolations} unresolved static violation(s).`,
  );

  if (baselinedPairs.length) {
    console.warn(
      `Tenancy guard (A): ${baselinedPairs.length} known-debt pair(s) from ${BASELINE_REL} (warning, not a failure): ` +
        `${baselinedPairs.slice(0, 10).join(', ')}${baselinedPairs.length > 10 ? ' …' : ''}`,
    );
  }

  // The ratchet: a baseline line that no longer violates is a hard failure, so
  // the file can only ever get shorter and a fix cannot leave debt behind it.
  for (const pair of [...unresolvedBaseline].sort()) {
    violations.push(`stale baseline — remove this line from ${BASELINE_REL}: "${pair}"`);
  }
  if (listExemptions && exemptLines.length) {
    console.log(exemptLines.sort().join('\n'));
  }

  // Deprecation: every legacy route-only key blanket-exempts whatever tables the
  // route happens to touch today, so it silently widens as more tables are
  // FORCEd. Re-key each one to `route::table`.
  if (legacyKeyedRoutes.size) {
    console.warn(
      `Tenancy guard (A): ${legacyKeyedRoutes.size} route(s) matched a DEPRECATED route-only exemption key — ` +
        `re-key to 'route::table' (blanket-exempts every table the route touches): ` +
        `${[...legacyKeyedRoutes].slice(0, 10).join(', ')}${legacyKeyedRoutes.size > 10 ? ' …' : ''}`,
    );
  }

  // Stale-exemption hygiene (non-fatal): an allowlisted route that no longer
  // matches a live violation — e.g. it was since GUC-wrapped, deleted, or its
  // table un-FORCEd — can be pruned from the allowlist.
  const stale = Object.keys(ROUTE_TENANCY_EXEMPTIONS).filter((rt) => !matchedExemptions.has(rt));
  if (stale.length) {
    console.warn(
      `Tenancy guard (A): ${stale.length} exemption(s) no longer match a live violation (safe to prune): ` +
        `${stale.slice(0, 10).join(', ')}${stale.length > 10 ? ' …' : ''}`,
    );
  }
}

// ── (B) live role invariant ─────────────────────────────────────────────────
// Check the role that serves TENANT traffic, mirroring src/lib/db.ts: the GUC
// wrappers run on tenantPool, whose DSN is TENANT_APP_DATABASE_URL if set, else
// it aliases the owner pool. The owner DSN (DATABASE_URL) being BYPASSRLS is
// correct-by-design after the two-pool split, so we must NOT flag it.
const TENANT_DSN = process.env.TENANT_APP_DATABASE_URL;
const OWNER_DSN = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const tenantRuntimeDsn = TENANT_DSN || OWNER_DSN;
const tenantDsnIsAlias = !TENANT_DSN; // app would serve tenant traffic on the owner pool
if (runLive && tenantRuntimeDsn) {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: tenantRuntimeDsn, max: 1 });
    const { rows: forced } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity`,
    );
    const forcedCount = Number(forced[0]?.n ?? 0);
    const { rows: role } = await pool.query<{ current_user: string; bypass: boolean }>(
      `SELECT current_user, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`,
    );
    const { current_user, bypass } = role[0]!;
    const source = tenantDsnIsAlias ? 'DATABASE_URL (tenant DSN unset → owner alias)' : 'TENANT_APP_DATABASE_URL';
    console.log(`Tenancy guard (B): tenant-runtime role '${current_user}' (bypassrls=${bypass}) via ${source}; ${forcedCount} FORCEd table(s) live.`);
    if (forcedCount > 0 && bypass) {
      violations.push(
        tenantDsnIsAlias
          ? `TENANT_APP_DATABASE_URL is unset, so tenant traffic runs on owner role '${current_user}' (BYPASSRLS) ` +
              `while ${forcedCount} table(s) are FORCEd — RLS is fully bypassed. Set TENANT_APP_DATABASE_URL to the app_tenant DSN (Phase E1).`
          : `tenant-runtime role '${current_user}' has BYPASSRLS while ${forcedCount} table(s) are FORCEd — ` +
              `FORCE is INERT for it. TENANT_APP_DATABASE_URL must point at a non-bypassrls role (Phase E1).`,
      );
    }
    await pool.end();
  } catch (err) {
    console.warn('Tenancy guard (B): live check skipped —', err instanceof Error ? err.message : err);
  }
} else if (runLive) {
  console.log('Tenancy guard (B): no DB URL set — live role invariant skipped.');
}

// ── result ──────────────────────────────────────────────────────────────────
if (violations.length) {
  console.error('\n❌ Tenancy isolation violations:');
  for (const v of violations) console.error('  - ' + v);
  if (check) process.exit(1);
} else {
  console.log('\n✅ Tenancy isolation guard passed.');
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
