/**
 * Ratchet: every work_assignments ON CONFLICT DO UPDATE must target
 * `ux_work_assignments_active_entity` as defined in 2026-08-08b
 * (org-led columns + OPEN/ASSIGNED/IN_PROGRESS + FOLLOW_UP exempt).
 * Stale arbiters raise Postgres 42P10 and surface as packer
 * "Failed to update order".
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT } from './work-assignments-conflict';

const SRC = path.resolve(__dirname, '../..');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'migrations' || entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name === 'work-assignments-conflict.ts') continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.guard.test.ts')) continue;
    out.push(full);
  }
  return out;
}

describe('work_assignments ON CONFLICT arbiter', () => {
  it('matches ux_work_assignments_active_entity (org-led + FOLLOW_UP exempt)', () => {
    assert.match(
      WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT,
      /\(organization_id,\s*entity_type,\s*entity_id,\s*work_type\)/,
    );
    assert.match(
      WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT,
      /status IN \('OPEN', 'ASSIGNED', 'IN_PROGRESS'\)/,
    );
    assert.match(WORK_ASSIGNMENTS_ACTIVE_ON_CONFLICT, /work_type <> 'FOLLOW_UP'/);
  });

  it('no route/lib SQL still targets the pre-2026-08-08b index shape', () => {
    const staleColumnOnly =
      /ON CONFLICT\s*\(\s*entity_type\s*,\s*entity_id\s*,\s*work_type\s*\)/i;
    const staleConstraintName =
      /ON CONFLICT\s+ON\s+CONSTRAINT\s+ux_work_assignments_active_entity/i;
    // Bare DO NOTHING on work_assignments skips the arbiter — prefer the shared
    // fragment so a future index reshape fails loudly at this guard, not in prod.
    const bareDoNothing =
      /INSERT INTO work_assignments[\s\S]{0,600}?ON CONFLICT\s+DO\s+NOTHING/i;

    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (
        staleColumnOnly.test(text) ||
        staleConstraintName.test(text) ||
        bareDoNothing.test(text)
      ) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    assert.deepEqual(offenders, []);
  });
});
