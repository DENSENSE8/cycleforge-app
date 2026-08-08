/**
 * Nav-keys per-region target-key uniqueness (P4).
 *
 * A region's CO-LOCATED declared keys must never collide across that region's
 * full possible target set, so `resolveNavKeymap`'s fallback stays the rare
 * exception and a target's letter is stable muscle memory
 * (`docs/todo/nav-keys-selection-keyboard-HANDOFF.md`).
 *
 * TELEMETRY IS NOT A TARGET. A nav target is ACTIONABLE — you jump to it and it
 * does something (open a display, focus a line, fire a step CTA). Read-only
 * DISPLAY METRICS (the scan-progress ring, active-step context, usage KPI) are
 * NOT targets and carry no nav key, wherever they sit. On Unbox those metrics
 * now live in the bottom dock under-dock row, not the middle triage.
 *
 * As new regions declare co-located key maps, register them in DECLARED_KEY_MAPS
 * so this guard covers them too. Regions whose rows are dynamic data (the Left
 * recent rail) declare no keys — the resolver assigns them positionally — so
 * they are correctly absent here.
 *
 *   node --import tsx --test src/lib/keyboard/nav-keys/nav-key-uniqueness.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DISPLAY_LEAF_NAV_KEY } from '@/components/station/displays/display-index';

/** Every region that hand-declares co-located nav keys. Add new maps here. */
const DECLARED_KEY_MAPS: Record<string, Record<string, string>> = {
  'right / Station Displays leaves': DISPLAY_LEAF_NAV_KEY,
};

describe('nav-keys declared-key uniqueness', () => {
  for (const [region, map] of Object.entries(DECLARED_KEY_MAPS)) {
    it(`${region}: keys are single a–z letters`, () => {
      for (const [id, key] of Object.entries(map)) {
        assert.ok(/^[a-z]$/.test(key), `${region} · ${id} = ${JSON.stringify(key)} must be one a–z letter`);
      }
    });

    it(`${region}: no two targets share a declared key`, () => {
      const seen = new Map<string, string>();
      for (const [id, key] of Object.entries(map)) {
        const prior = seen.get(key);
        assert.equal(
          prior,
          undefined,
          `${region}: '${key}' declared by both '${prior}' and '${id}' — collides`,
        );
        seen.set(key, id);
      }
    });
  }
});
