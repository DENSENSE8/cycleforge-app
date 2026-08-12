/**
 * Recent label-note SoT — walk scans until a carton with a face note.
 *
 * Run: `node --import tsx --test src/lib/receiving/recent-label-note.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('fetchMostRecentProcessedLabelNote walks scans (no last_scan LIMIT 1 then hope)', () => {
  const mod = src('lib/receiving/recent-label-note-server.ts');
  assert.match(mod, /candidate_scans/, 'scan CTE is a walk set, not a single last_scan');
  assert.doesNotMatch(
    mod,
    /last_scan AS \([\s\S]*?LIMIT 1\s*\)/,
    'must not LIMIT 1 on scans before joining face notes',
  );
  assert.match(
    mod,
    /NULLIF\(BTRIM\(rl\.label_note\), ''\) IS NOT NULL/,
    'requires non-empty label_note or notes',
  );
  assert.match(
    mod,
    /ORDER BY[\s\S]*cs\.scanned_at DESC/,
    'newest scan with a face note wins',
  );
  // Spine table is singular — plural compat view omits label_note and breaks Recent.
  assert.match(mod, /FROM receiving_line rl0/);
  assert.match(mod, /JOIN receiving_line rl/);
  assert.doesNotMatch(mod, /receiving_lines/, 'never query stale receiving_lines view for face notes');
});

test('route staff-then-org fallback still uses the walk fetch', () => {
  const route = src('app/api/receiving/recent-label-note/route.ts');
  assert.match(route, /fetchMostRecentProcessedLabelNote/);
  assert.match(route, /staffId: ctx\.staffId/);
  assert.match(route, /staffId: null/);
});
