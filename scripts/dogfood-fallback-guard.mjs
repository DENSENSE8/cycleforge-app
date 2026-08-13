#!/usr/bin/env node
/**
 * Dogfood-fallback guard — CI gate against the single-tenant org fallback regrowing.
 *
 * Fails when 'DOGFOOD_ORG_ID' or 'transitionalDogfoodOrgId' appears in any file under
 * src/app/api/** that is NOT in the allowlist below. House law
 * (AGENTS.md): orgId comes from ctx (withAuth), never
 * from the body and never via a hardcoded dogfood-org fallback — new routes must not
 * import DOGFOOD_ORG_ID or add `?? DOGFOOD_ORG_ID`.
 *
 * The allowlist is a BURN-DOWN of the known legacy offenders at authoring time
 * (2026-07-09). Only ever LOWER it (delete entries as routes are org-scoped) —
 * NEVER grow it. A new route needing an org id gets it from ctx.organizationId.
 *
 * Usage:
 *   node scripts/dogfood-fallback-guard.mjs   # exit 1 on non-allowlisted offenders
 *
 * package.json:
 *   npm run tenancy:dogfood-guard
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(repoRoot, 'src', 'app', 'api');

const TOKENS = ['DOGFOOD_ORG_ID', 'transitionalDogfoodOrgId', 'USAV_ORG_ID', 'transitionalUsavOrgId'];

// BURN-DOWN allowlist — the offenders that existed when this guard was written.
// LOWER this list as routes get org-scoped; NEVER add to it.
//
// One sanctioned exception to "never add" (2026-07-10): the two need-to-order
// routes below were ALWAYS session-less legacy debt, but it was invisible —
// they called replenishment fns whose orgId defaulted to the UNSCOPED pool.
// The Wave-3 org-require refactor made orgId mandatory and routed them through
// the explicit transitionalDogfoodOrgId() service-org bridge, which made the debt
// greppable (a strict tenancy improvement). They join the ledger; the real fix
// is an internal-token→org mapping.
// Burned down 2026-07-11 (org-login-gate wave 7): 20 interactive withAuth routes
// dropped their `ctx.organizationId ?? DOGFOOD_ORG_ID` fallback — on a
// non-anonymous withAuth route ctx.organizationId is a non-null string, so the
// `??` branch was unreachable dead code and withAuth already 401s pre-handler.
// The two requireRoutePerm/CRUD routes (po-gmail triage/extract, repair-service)
// now throw/return 401 on a missing org. What remains below is the genuinely
// session-less tail — crons, the `transitionalDogfoodOrgId()` service-org
// bridge, and two comment-only mentions — pending an internal-token→org map.
const ALLOWLIST = new Set([
  // Session-less service-org bridge (transitionalDogfoodOrgId) — no request ctx.
  'src/app/api/need-to-order/create-po/route.ts',
  'src/app/api/need-to-order/recalculate/route.ts',
  'src/app/api/cron/zoho/orders-ingest-drain/route.ts',
  'src/app/api/orders/import-csv/route.ts',
  'src/app/api/zoho/fulfillment-sync/route.ts',
  // Cron-or-dogfood authorization gate (not a scoping fallback).
  'src/app/api/ebay/refresh-tokens/route.ts',
  // Comment-only references to the token (no runtime fallback).
  'src/app/api/zoho/find-po/route.ts',
  'src/app/api/zoho/items/[id]/image/route.ts',
  // Legitimate anonymous legacy-QR path: the dogfood fallback scopes only the
  // idempotency CACHE key namespace for anon callers, NOT the data write (which
  // stays unscoped). Not a tenant-scoping fallback.
  'src/app/api/locations/[barcode]/route.ts',
  'src/app/api/locations/[barcode]/swap/route.ts',
]);

function walk(dir, out = []) {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) {
      if (ent === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(ent)) {
      out.push(p);
    }
  }
  return out;
}

const violations = [];
const seen = new Set();

for (const file of walk(apiRoot)) {
  const rel = relative(repoRoot, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  const hits = TOKENS.filter((t) => text.includes(t));
  if (hits.length === 0) continue;
  seen.add(rel);
  if (!ALLOWLIST.has(rel)) violations.push({ file: rel, tokens: hits });
}

// Cleaned-up allowlist entries are a nudge, not a failure — lower the list.
const stale = [...ALLOWLIST].filter((f) => !seen.has(f)).sort();

if (violations.length > 0) {
  console.error(`✖ dogfood-fallback-guard: ${violations.length} NEW offender(s) outside the allowlist:\n`);
  for (const v of violations) {
    console.error(`  • ${v.file} → ${v.tokens.join(', ')}`);
  }
  console.error(
    '\nFix: take orgId from ctx.organizationId (withAuth) — never import DOGFOOD_ORG_ID or add\n' +
      "`?? DOGFOOD_ORG_ID` in a route (AGENTS.md). The allowlist in\n" +
      'scripts/dogfood-fallback-guard.mjs is a burn-down of legacy offenders only — never grow it.',
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.log(
    `✓ dogfood-fallback-guard: OK (${seen.size} known offender(s)). ${stale.length} allowlist ` +
      'entry(ies) are now clean — LOWER the list in scripts/dogfood-fallback-guard.mjs:',
  );
  for (const f of stale) console.log(`  • ${f}`);
} else {
  console.log(`✓ dogfood-fallback-guard: OK (${seen.size} known offender(s), allowlist=${ALLOWLIST.size}).`);
}
process.exit(0);
