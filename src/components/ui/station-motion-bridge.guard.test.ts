import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Station / DS primitives that own entrance motion must route presets through
 * `useMotionTransition` / `useMotionPresence` so prefers-reduced-motion is free
 * (`.claude/rules/display/station.md` §9).
 *
 * Expand this list only after a file already complies — never add a path that
 * still spreads raw `framerPresence` / `framerTransition` without the bridge.
 */

const ROOT = process.cwd();

/** Full bridge: both presence + transition hooks. */
const REQUIRED_BOTH = [
  'src/design-system/primitives/CardShell.tsx',
  'src/components/station/ActiveOrderScanFeedback.tsx',
  'src/components/station/StationPacking.tsx',
  'src/components/station/OfflineBanner.tsx',
  'src/components/station/upnext/UpNextOrderPieces.tsx',
  'src/components/station/upnext/RepairCard.tsx',
  'src/components/station/upnext/FbaItemCard.tsx',
] as const;

/** Transition-only surfaces (progress bars, width anims). */
const REQUIRED_TRANSITION = [
  'src/components/station/StationGoalBar.tsx',
] as const;

const HOOKS_IMPORT_RE =
  /from ['"]@?\/?\.?\.?\/?.*motion-framer-hooks['"]|from ['"]@\/design-system\/foundations\/motion-framer-hooks['"]|from ['"]\.\.\/foundations\/motion-framer-hooks['"]/;

test('station card primitives use the reduced-motion bridge', () => {
  for (const rel of REQUIRED_BOTH) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(
      src,
      /useMotionTransition/,
      `${rel} must call useMotionTransition (WCAG 2.3.3 bridge)`,
    );
    assert.match(
      src,
      /useMotionPresence/,
      `${rel} must call useMotionPresence (WCAG 2.3.3 bridge)`,
    );
    assert.match(
      src,
      HOOKS_IMPORT_RE,
      `${rel} must import motion-framer-hooks`,
    );
  }

  for (const rel of REQUIRED_TRANSITION) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(
      src,
      /useMotionTransition/,
      `${rel} must call useMotionTransition (WCAG 2.3.3 bridge)`,
    );
    assert.match(
      src,
      HOOKS_IMPORT_RE,
      `${rel} must import motion-framer-hooks`,
    );
  }
});
