/**
 * Hard law: receiving lifecycle badges are house pastel chips
 * (`bg-*-50 text-*-700` or surface tokens) — never solid white-ink fills.
 * Unbox History (and every `workflowStageBadge` consumer) inherits this map;
 * a solid DONE next to pastel FAILED is the regression this guard pins.
 *
 * Guard: `src/lib/receiving/workflow-stages.badge.guard.test.ts`
 * Law: `.claude/rules/ui-design-system.md` → Eyebrow headers + chips.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { UNKNOWN_STAGE, WORKFLOW_STAGES } from './workflow-stages';

const PASTEL_OR_SURFACE = /\bbg-(?:\w+-50|surface-\w+)\b/;

function assertPastelBadge(status: string, badge: string) {
  assert.doesNotMatch(
    badge,
    /\btext-white\b/,
    `${status} badge must not use white ink (solid fill language)`,
  );
  assert.match(
    badge,
    PASTEL_OR_SURFACE,
    `${status} badge must include a pastel or surface fill — got "${badge}"`,
  );
  // Saturated bg-*-500/600/… as the fill half of a badge is banned.
  // Pastel fills are *-50; surface tokens are bg-surface-*.
  const fills = badge.match(/\bbg-[\w-]+\b/g) ?? [];
  for (const fill of fills) {
    if (fill.startsWith('bg-surface-')) continue;
    if (/^bg-\w+-50$/.test(fill)) continue;
    assert.fail(
      `${status} badge fill "${fill}" must be pastel (bg-*-50) or bg-surface-* — got "${badge}"`,
    );
  }
}

test('WORKFLOW_STAGES badges are house pastel (no solid white-ink)', () => {
  for (const [key, meta] of Object.entries(WORKFLOW_STAGES)) {
    assertPastelBadge(key, meta.badge);
  }
  assertPastelBadge('UNKNOWN', UNKNOWN_STAGE.badge);
});

test('DONE badge is pastel emerald, not solid white-ink', () => {
  assert.equal(WORKFLOW_STAGES.DONE.badge, 'bg-emerald-50 text-emerald-700');
  assert.equal(WORKFLOW_STAGES.FAILED.badge, 'bg-rose-50 text-rose-700');
});

test('DONE operator label is Received (never Done)', () => {
  assert.equal(WORKFLOW_STAGES.DONE.label, 'Received');
});
