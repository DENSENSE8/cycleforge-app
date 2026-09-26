'use client';

import { useReducedMotion } from '@/design-system/motion';
import { MODE_REGISTRY } from '@/design-system/modes/registry';
import { useMode } from './ModeRegion';

/** `'120ms'` / `'0.2s'` → seconds. */
function toSeconds(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.trim().endsWith('ms') ? n / 1000 : n;
}

/**
 * The enclosing region's state-change duration, in seconds, for the motion engine — the JS face of `duration-mode-feedback`…
 * 0 under reduced motion (BRIEF §8: all motion off, the colour change is
 */
export function useModeFeedbackSeconds(): number {
  const mode = useMode();
  const reduced = useReducedMotion();
  if (reduced || mode == null) return 0;
  return toSeconds(MODE_REGISTRY[mode].motion.feedback);
}
