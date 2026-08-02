import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Guards the `YYYY-MM-DD<letter>` migration slot against two sessions claiming
 * the same one.
 *
 * The failure this exists to prevent, from 2026-08-01: two sessions
 * independently wrote a `staff.avatar_photo_id` migration and both named it
 * `2026-08-01e`. The duplicate was spotted and deleted by hand before apply —
 * had both run, the tenant would have ended up with two identical FKs and two
 * identical indexes, because the idempotent `EXCEPTION WHEN duplicate_object`
 * guards these migrations use match on constraint NAME, and the two files
 * picked different ones. `2026-08-01a` is claimed twice to this day
 * (`_reason_codes_qa_fail_seed` + `_saved_views_home_today`).
 *
 * Ordering is the second, sharper hazard. The runner applies files in plain
 * `.sort()` order, so two files in one slot are ordered by their DESCRIPTION —
 * which is alphabetical and therefore arbitrary with respect to intent. The
 * live proof is `2026-07-29f`, whose `_contract` half sorts BEFORE its
 * `_expand` half, exactly inverting the expand-then-contract sequence that pair
 * was split to guarantee.
 *
 * Scope note: only **lettered** slots are checked. Several same-day unlettered
 * files predate the letter convention (`2026-04-01_create_*.sql` × 4); those
 * were never "claiming a slot" and are not this bug.
 *
 * This ratchet may only SHRINK. Applied filenames are immutable — the runner's
 * ledger is keyed on `(filename, sha256)` — so the historical collisions below
 * cannot be renamed away and are frozen as a named allowlist rather than a bare
 * count, so a NEW collision can never quietly take a retired one's place.
 */

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Slots already claimed more than once when this guard was armed (2026-08-02).
 * FROZEN — never add to this list. A new duplicate means picking the next free
 * letter, not grandfathering another one.
 */
const KNOWN_DUPLICATE_SLOTS = new Set([
  '2026-06-06h',
  '2026-06-13c',
  '2026-06-14b',
  '2026-06-22b',
  '2026-06-22c',
  '2026-06-22d',
  '2026-06-28b',
  '2026-06-28c',
  '2026-06-28d',
  '2026-06-28e',
  '2026-06-28f',
  '2026-06-28g',
  '2026-06-28h',
  '2026-06-28i',
  '2026-06-28j',
  '2026-06-28o',
  '2026-06-29e',
  '2026-07-03s',
  '2026-07-04a',
  '2026-07-05c',
  '2026-07-06a',
  '2026-07-11c',
  '2026-07-29b',
  '2026-07-29f',
  '2026-08-01a',
]);

/** `2026-08-01e_staff_avatar_photo.sql` → `2026-08-01e`. Unlettered → null. */
function letteredSlot(filename: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}[a-z]+)_/.exec(filename);
  return m ? m[1] : null;
}

function migrationFilenames(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql'));
}

test('no two migrations claim the same YYYY-MM-DD<letter> slot', () => {
  const bySlot = new Map<string, string[]>();
  for (const filename of migrationFilenames()) {
    const slot = letteredSlot(filename);
    if (!slot) continue;
    const list = bySlot.get(slot) ?? [];
    list.push(filename);
    bySlot.set(slot, list);
  }

  const fresh: string[] = [];
  for (const [slot, files] of bySlot) {
    if (files.length < 2) continue;
    if (KNOWN_DUPLICATE_SLOTS.has(slot)) continue;
    fresh.push(`${slot} — claimed by:\n    ${files.sort().join('\n    ')}`);
  }

  assert.deepEqual(
    fresh,
    [],
    'a migration slot is claimed twice. The runner applies files in plain sort\n' +
      'order, so the two are sequenced by their DESCRIPTION — arbitrary with respect\n' +
      'to intent, and actively wrong for an expand/contract pair. Rename the\n' +
      `UNAPPLIED file to the next free letter.\n\n${fresh.join('\n\n')}`,
  );
});

test('the historical duplicate-slot allowlist only shrinks', () => {
  const live = new Set<string>();
  const bySlot = new Map<string, number>();
  for (const filename of migrationFilenames()) {
    const slot = letteredSlot(filename);
    if (!slot) continue;
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);
  }
  for (const [slot, n] of bySlot) if (n > 1) live.add(slot);

  const stale = [...KNOWN_DUPLICATE_SLOTS].filter((s) => !live.has(s));
  assert.deepEqual(
    stale,
    [],
    `KNOWN_DUPLICATE_SLOTS lists ${stale.length} slot(s) that no longer collide: ` +
      `${stale.join(', ')}. Remove them from the allowlist in ` +
      'migration-slot-uniqueness.guard.test.ts — it only shrinks.',
  );
});
