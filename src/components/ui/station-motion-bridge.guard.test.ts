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
  'src/components/station/PackScanColumn.tsx',
  // The bottom-anchored capture stack every station migrates onto. It owns row
  // entrance motion, so the bridge must be inherited by consumers rather than
  // re-derived per station (capture-stack Phase 2).
  'src/design-system/components/capture-stack/CaptureStack.tsx',
  // The capture-upload status card — the one compound every Station bench uses
  // for upload completion/failure. It owns its own dock entrance, so the
  // reduced-motion collapse must be inherited by every future consumer rather
  // than re-derived per bench (station realtime + capture visibility, P0 · D10).
  'src/components/station/capture-upload/CaptureUploadStatus.tsx',
  // The send-to-device waiting card (Waiting on phone… / Phone unreachable).
  // Same reasoning as its capture-upload sibling: it owns its own entrance, and
  // every bench mounts this one component (P1 · D2).
  'src/components/station/send-to-device/SendToDeviceStatus.tsx',
] as const;

/** Transition-only surfaces (progress bars, width anims). */
const REQUIRED_TRANSITION = [
] as const;

const HOOKS_IMPORT_RE =
  /from ['"]@?\/?\.?\.?\/?.*motion-framer-hooks['"]|from ['"]@\/design-system\/foundations\/motion-framer-hooks['"]|from ['"]\.\.\/foundations\/motion-framer-hooks['"]/;

/**
 * Match a CALL, not a mention. A bare /useMotionPresence/ also matches a
 * docblock or a TODO promising the migration — which is exactly what the
 * pre-Phase-2 `CaptureStack.tsx` carried, so the loose form passed on the very
 * file it was meant to reject.
 */
const callRe = (hook: string) => new RegExp(`${hook}\\s*\\(`);

test('station card primitives use the reduced-motion bridge', () => {
  for (const rel of REQUIRED_BOTH) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(
      src,
      callRe('useMotionTransition'),
      `${rel} must call useMotionTransition (WCAG 2.3.3 bridge)`,
    );
    assert.match(
      src,
      callRe('useMotionPresence'),
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
      callRe('useMotionTransition'),
      `${rel} must call useMotionTransition (WCAG 2.3.3 bridge)`,
    );
    assert.match(
      src,
      HOOKS_IMPORT_RE,
      `${rel} must import motion-framer-hooks`,
    );
  }
});
