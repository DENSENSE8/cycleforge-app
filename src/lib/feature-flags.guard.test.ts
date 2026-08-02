/**
 * Flag lifecycle guard — every flag declares an owner and an ending.
 *
 * `src/lib/feature-flags.ts` is a working two-tier SoT: `readBoolEnv` (sync env)
 * and `resolveForOrg` (per-org, DB → env) are private, and the public surface is
 * a flat list of exported `isXxx()` predicates. What it had no answer for is
 * *when a flag stops*.
 *
 * That gap is not cosmetic. A flag keeps BOTH branches reachable, so every
 * dead-code tool sees two live paths for as long as the flag exists — a
 * permanent strangler is a fork that has been made invisible on purpose. Several
 * flags here are explicitly mid-migration (`isUnifiedEngine*`, the
 * `isPlacementStrangle*` family, `surface_composed_render`), and
 * `backend-patterns.md` describes the unified-engine path as "mid-strangler, so
 * it is not yet a hard requirement". A strangler with no deadline is how the
 * losing branch becomes zombie code.
 *
 * ## What this enforces
 *
 *  1. **Registry completeness, both ways.** Every exported predicate has a
 *     `FLAG_LIFECYCLE` entry, and every entry names a real predicate. A flag
 *     added without a lifecycle fails; a lifecycle left behind by a deleted flag
 *     fails. (The second half is the one that rots silently — cf. the
 *     `useIsColumnHidden` SoT row that claimed two consumers and had four.)
 *  2. **`bornAt` is a real civil date**, not a placeholder, and not in the
 *     future.
 *  3. **Age forces a decision.** Past `FLAG_AGE_LIMIT_DAYS`, a flag may not
 *     remain `undecided` — it declares `permanent` (a genuine kill-switch) or
 *     `rollout` with a `plannedRemoval` date.
 *  4. **A `plannedRemoval` that has passed fails.** A deadline nobody is held to
 *     is the prose-only retirement in another costume.
 *
 * ## Deliberately NOT a vendor
 *
 * LaunchDarkly/Split would be a second flag system beside the SoT module, which
 * `pattern-evolution.md` forbids. This is one file, one guard, no dependency and
 * no dashboard.
 *
 * ## Why it lands green
 *
 * Nothing here fabricates urgency: at the time of writing the oldest flag
 * (`isMobileReceivingPipelineV2`, 2026-05-20) is ~74 days old against a 90-day
 * limit, so the ratchet starts biting in the ordinary course rather than
 * failing a build on arrival. `undecided` is an honest state — inventing
 * removal dates nobody committed to would recreate exactly the unfalsifiable
 * prose this guard exists to replace.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
// The dependency-free sibling, NOT `./feature-flags` — that module imports
// `@/lib/db`, which carries `server-only` and throws on import from a test.
// Re-exported from `feature-flags.ts` for ordinary call sites.
import { FLAG_LIFECYCLE, FLAG_AGE_LIMIT_DAYS } from './feature-flags-lifecycle';

const SOURCE = path.join(process.cwd(), 'src/lib/feature-flags.ts');

/**
 * The predicates as the CODE declares them, read off the source rather than
 * imported — importing would pull `@/lib/db` (`server-only`) into the test.
 */
function exportedPredicates(): string[] {
  const src = readFileSync(SOURCE, 'utf8');
  return [...src.matchAll(/^export (?:async )?function (is[A-Za-z0-9]+)\s*\(/gm)]
    .map((m) => m[1])
    .sort();
}

/** Civil-date helpers — `YYYY-MM-DD` only, parsed at UTC noon so DST can't shift the day. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseCivil(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, 12);
}
function ageDays(bornAt: string, now: number): number {
  return Math.floor((now - parseCivil(bornAt)) / 86_400_000);
}

describe('feature-flag lifecycle', () => {
  it('every exported predicate has a lifecycle entry', () => {
    const missing = exportedPredicates().filter((p) => !(p in FLAG_LIFECYCLE));
    assert.deepEqual(
      missing,
      [],
      `These flags have no FLAG_LIFECYCLE entry:\n  ${missing.join('\n  ')}\n\n` +
        `A flag with no declared ending keeps both branches reachable forever, ` +
        `which is a fork that dead-code tooling cannot see. Add { env, bornAt, ` +
        `area, disposition } in feature-flags.ts.`,
    );
  });

  it('every lifecycle entry names a real predicate', () => {
    const live = new Set(exportedPredicates());
    const stale = Object.keys(FLAG_LIFECYCLE).filter((k) => !live.has(k));
    assert.deepEqual(
      stale,
      [],
      `These FLAG_LIFECYCLE entries no longer match an exported predicate — the ` +
        `flag was removed but its lifecycle row stayed, which over-states the ` +
        `flag surface:\n  ${stale.join('\n  ')}`,
    );
  });

  it('bornAt is a real civil date, not in the future', () => {
    const now = Date.now();
    const bad: string[] = [];
    for (const [name, meta] of Object.entries(FLAG_LIFECYCLE)) {
      if (!DATE_RE.test(meta.bornAt)) {
        bad.push(`${name}: bornAt "${meta.bornAt}" is not YYYY-MM-DD`);
        continue;
      }
      if (parseCivil(meta.bornAt) > now) {
        bad.push(`${name}: bornAt "${meta.bornAt}" is in the future`);
      }
    }
    assert.deepEqual(bad, [], bad.join('\n'));
  });

  it(`no flag stays undecided past ${FLAG_AGE_LIMIT_DAYS} days`, () => {
    const now = Date.now();
    const overdue = Object.entries(FLAG_LIFECYCLE)
      .filter(([, m]) => m.disposition.kind === 'undecided')
      .map(([name, m]) => ({ name, age: ageDays(m.bornAt, now), area: m.area }))
      .filter((f) => f.age > FLAG_AGE_LIMIT_DAYS)
      .sort((a, b) => b.age - a.age);

    assert.deepEqual(
      overdue.map((f) => `${f.name} (${f.age}d, ${f.area})`),
      [],
      `These flags have been undecided for more than ${FLAG_AGE_LIMIT_DAYS} days:\n  ` +
        overdue.map((f) => `${f.name} — ${f.age} days — ${f.area}`).join('\n  ') +
        `\n\nDecide, don't extend the limit:\n` +
        `  • it shipped and is staying  → delete the flag and the losing branch\n` +
        `  • it is a real kill-switch   → disposition { kind: 'permanent', why }\n` +
        `  • it is still rolling out    → { kind: 'rollout', plannedRemoval: 'YYYY-MM-DD' }\n\n` +
        `Raising FLAG_AGE_LIMIT_DAYS to pass is the same move as raising a ` +
        `ratchet baseline, and is prohibited for the same reason.`,
    );
  });

  it('no planned removal date has already passed', () => {
    const now = Date.now();
    const lapsed = Object.entries(FLAG_LIFECYCLE)
      .filter(([, m]) => m.disposition.kind === 'rollout')
      .map(([name, m]) => ({
        name,
        due: (m.disposition as { plannedRemoval: string }).plannedRemoval,
      }))
      .filter((f) => DATE_RE.test(f.due) && parseCivil(f.due) < now);

    assert.deepEqual(
      lapsed.map((f) => `${f.name} (due ${f.due})`),
      [],
      `These flags passed their own removal date:\n  ` +
        lapsed.map((f) => `${f.name} — due ${f.due}`).join('\n  ') +
        `\n\nRetire the flag and delete the losing branch. A deadline nobody is ` +
        `held to is a prose-only retirement in another costume.`,
    );
  });

  it('a permanent flag states why it is permanent', () => {
    const unjustified = Object.entries(FLAG_LIFECYCLE)
      .filter(([, m]) => m.disposition.kind === 'permanent')
      .filter(([, m]) => {
        const why = (m.disposition as { why?: string }).why;
        return !why || why.trim().length < 20;
      })
      .map(([name]) => name);

    assert.deepEqual(
      unjustified,
      [],
      `"permanent" exempts a flag from ageing out forever, so it needs a real ` +
        `reason (a kill-switch that must survive, not "still needed"):\n  ${unjustified.join('\n  ')}`,
    );
  });
});
