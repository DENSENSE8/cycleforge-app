import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guard: **cross-entity urgency has one entry point.**
 *
 * Before `src/lib/urgency/`, "urgent" was four unrelated mechanisms — an order
 * boolean, a carton tier + a second carton boolean, a helpdesk enum, and an
 * order row-tint flag — with four write paths and nothing reconciling them.
 * Two of them are still called "priority" and mean different things.
 *
 * What this guard prevents is a FIFTH appearing. It deliberately does **not**
 * demand that the existing writers migrate: each of the multi-field PATCH
 * routes below writes an urgency column as one field inside a wider UPDATE, and
 * routing that single field back out through the SoT would split one atomic
 * write into two that can half-fail. Those are named, frozen exceptions with a
 * stated reason — not a backlog.
 *
 * Shrink-only, per `.claude/rules/pattern-evolution.md` → Always #6: a
 * retirement is not done until the old path is deleted or a guard names the
 * exact surviving call sites. Finishing a migration REMOVES a line here;
 * nothing may add one.
 */

const SRC = 'src';

/**
 * Files permitted to write an urgency column directly, and why. Exact-set
 * equality below, so this list cannot silently drift in either direction.
 */
const ALLOWED_DIRECT_WRITERS: Readonly<Record<string, string>> = {
  // The SoT itself. This is the entry point everything else should reach for.
  'src/lib/urgency/promote-urgency-deps.ts':
    'the SoT binding — compare-and-set against each storage',

  // ---- Frozen exceptions: multi-field PATCH routes ----------------------
  // Urgency is ONE column in a wider dynamic UPDATE built from the request
  // body. Extracting it would fragment a single atomic write into two.
  'src/app/api/orders/assign/route.ts':
    'multi-field order PATCH — is_urgent is one column of a wider UPDATE',
  'src/app/api/receiving-logs/route.ts':
    'multi-field carton PATCH — priority_tier + is_priority lockstep inside a wider UPDATE',

  // ---- Frozen exception: an automatic domain rule, not an operator intent -
  // A carton whose tracking matches a pending order is auto-promoted at scan
  // time. That is the receiving domain deciding, not a caller asking, and it
  // is already idempotent via its own WHERE clause.
  'src/app/api/receiving/lookup-po/route.ts':
    'auto-promote on pending-order match — a domain rule at scan time',

  // ---- Frozen exception: a projection, not a decision --------------------
  // Copies the carton's already-decided tier into the materialized feed
  // membership table. It reads urgency; it never chooses it.
  'src/lib/receiving/feed-membership-projection.ts':
    'projection — copies an already-decided tier into the feed membership table',
};

/**
 * A WRITE, not a read. Each pattern requires assignment context, so
 * `WHERE is_priority = false` and `WHERE priority_tier IS DISTINCT FROM 0`
 * (both real, both reads) do not trip it.
 */
const URGENCY_WRITE_PATTERNS: readonly RegExp[] = [
  /SET\s+(is_urgent|is_priority|priority_tier)\b/i,
  /\b(is_urgent|is_priority|priority_tier)\s*=\s*\$/,
  /\b(is_urgent|is_priority|priority_tier)\s*=\s*EXCLUDED/i,
  // Helpdesk ticket priority. There is no direct writer today — the generic
  // ticket PATCH passes a validated body straight through — so a literal here
  // would be a new single-purpose urgency writer.
  /priority:\s*['"]urgent['"]/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(full)) continue;
    if (/\.(test|spec)\.tsx?$/.test(full)) continue;
    out.push(full);
  }
  return out;
}

function findDirectWriters(): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    if (URGENCY_WRITE_PATTERNS.some((re) => re.test(src))) {
      hits.push(relative('.', file).split('\\').join('/'));
    }
  }
  return hits.sort();
}

test('the cross-entity urgency SoT exists and exposes one entry point', () => {
  const entry = readFileSync('src/lib/urgency/promote-urgency.ts', 'utf8');
  assert.match(entry, /export async function promoteUrgency\b/);

  // The pure half must stay free of the server binding, or the routing rules
  // stop being testable without a database.
  const core = readFileSync('src/lib/urgency/promote-urgency-core.ts', 'utf8');
  assert.equal(
    /server-only|withTenantTransaction|getHelpdeskProvider/.test(core),
    false,
    'promote-urgency-core.ts must stay pure — deps are injected',
  );

  // The vocabulary must stay client-safe so a picker can import it without
  // dragging the write path into a browser bundle (build-gotchas → altitude).
  const targets = readFileSync('src/lib/urgency/urgency-targets.ts', 'utf8');
  assert.equal(
    /server-only|from '@\/lib\/db'|withTenantTransaction/.test(targets),
    false,
    'urgency-targets.ts must stay dependency-free',
  );
});

test('no surface writes an urgency column outside the frozen allowlist', () => {
  const found = findDirectWriters();
  const allowed = Object.keys(ALLOWED_DIRECT_WRITERS).sort();

  const added = found.filter((f) => !allowed.includes(f));
  assert.deepEqual(
    added,
    [],
    `New direct urgency writer(s). Compose promoteUrgency() from ` +
      `src/lib/urgency/promote-urgency.ts instead of writing is_urgent / ` +
      `priority_tier / is_priority (or a literal ticket priority) by hand.`,
  );

  const stale = allowed.filter((f) => !found.includes(f));
  assert.deepEqual(
    stale,
    [],
    `Allowlisted writer(s) no longer write urgency — shrink the list. ` +
      `Finishing a migration removes a line; it never leaves a stale one.`,
  );
});

/**
 * `order_flags.flag = 'priority'` is a shared row TINT for queue triage, not
 * urgency: it is disjoint from `orders.is_urgent` by construction, nothing
 * syncs them, and an order may carry either, both, or neither. Absorbing it
 * would make "make this urgent" write two columns with different meanings and
 * different audiences.
 */
test('the order row-tint flag is not folded into urgency', () => {
  const targets = readFileSync('src/lib/urgency/urgency-targets.ts', 'utf8');

  // Prose may (and should) explain the exclusion; what must not exist is a
  // dependency on the flag vocabulary or a registry entry carrying it.
  assert.equal(
    /^\s*import .*orders\//m.test(targets),
    false,
    'order_flags is triage tint — its vocabulary stays in orders/order-row-flags.ts',
  );

  const registry = targets.slice(targets.indexOf('URGENCY_TARGETS'));
  assert.equal(
    /order_flags|OrderRowFlagId|'priority'/.test(registry),
    false,
    'the registry must carry no order_flags entry',
  );
  assert.match(targets, /NOT urgency/i, 'the exclusion must be stated, not merely absent');
});

test('the rules name the SoT, so the next agent finds it before re-deriving one', () => {
  const sot = readFileSync('.claude/rules/source-of-truth.md', 'utf8');
  assert.match(sot, /src\/lib\/urgency/, 'source-of-truth.md must carry an urgency row');

  const agents = readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /urgenc/i, 'AGENTS.md must carry the one-line hard law');
});
