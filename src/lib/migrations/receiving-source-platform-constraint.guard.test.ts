/**
 * Guard: the `receiving_source_platform_chk` DB CHECK constraint must allow
 * every value in the `SOURCE_PLATFORMS` app-level SoT.
 *
 * The app allowlist (PATCH /api/receiving/[id]) was fixed to derive from
 * `@/lib/source-platform` (source-platform-allowlist.guard.test.ts), but the
 * DB constraint was a hand-typed list that drifted independently — it never
 * grew past { zoho, ebay, amazon, aliexpress, walmart, other, goodwill, ecwid }.
 * Selecting Platform=FBA then passed app validation and 500'd at the DB
 * ("violates check constraint receiving_source_platform_chk"), leaving the
 * claim subject stuck on "Unknown - Return"
 * (docs/todo/claim-subject-fba-unknown-HANDOFF.md).
 *
 * This walks every migration file (in the same lexicographic order the
 * runner applies them — scripts/run-pending-migrations.mjs) that redefines
 * receiving_source_platform_chk, takes the LAST one, and asserts its allowed
 * set is a superset of the SoT. Add a new migration (never edit history) when
 * the SoT grows a platform.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_PLATFORMS } from '@/lib/source-platform';

const MIGRATIONS_DIR = join(process.cwd(), 'src/lib/migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isFile())
    .sort();
}

function extractAllowedValues(sql: string): string[] | null {
  const match = sql.match(/receiving_source_platform_chk[\s\S]*?IN\s*\(([\s\S]*?)\)/i);
  if (!match) return null;
  return match[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

test('receiving_source_platform_chk stays a superset of the SOURCE_PLATFORMS SoT', () => {
  const files = migrationFiles();
  let latestFile: string | null = null;
  let latestAllowed: string[] | null = null;

  for (const name of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    if (!/receiving_source_platform_chk/i.test(sql)) continue;
    const allowed = extractAllowedValues(sql);
    if (!allowed) continue;
    latestFile = name;
    latestAllowed = allowed;
  }

  assert.ok(latestAllowed, 'no migration defines receiving_source_platform_chk');
  const missing = SOURCE_PLATFORMS.map((p) => p.value).filter(
    (value) => !latestAllowed!.includes(value),
  );
  assert.deepEqual(
    missing,
    [],
    `${latestFile} is missing SOURCE_PLATFORMS values from receiving_source_platform_chk: ${missing.join(', ')}`,
  );
});
