import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Custom font-size utilities defined in `tailwind.config.mjs` (theme.fontSize). */
const CUSTOM_FONT_SIZES = [
  // Legacy px tokens (mini/eyebrow/micro/caption/label) retired 2026-07-13 (T4)
  // — migrated onto the CF Type roles below.
  'role-display',
  'role-title',
  'role-body',
  'role-data',
  'role-nav',
  'role-caption',
  'role-eyebrow',
  'role-micro',
  // Touch text-entry (16px, density-proof) — see tailwind.config.mjs.
  'role-field',
  // Task-mode body text (modes/registry.ts) — size follows the region's mode.
  'mode-body',
] as const;

const twMerge = extendTailwindMerge<'cf-inset' | 'cf-stack' | 'cf-row'>({
  extend: {
    classGroups: {
      'font-size': [{ text: [...CUSTOM_FONT_SIZES] }],
      // Elevation ladder (tailwind.config.mjs theme.extend.boxShadow — `shadow-elev-*` via elevationClass).
      shadow: [
        {
          shadow: [
            'elev-soft',
            'elev-raised',
            'elev-overlay',
            'elev-overlay-left',
            'elev-overlay-right',
          ],
        },
      ],
      // Task-mode vars (src/design-system/modes/registry.ts). Not named steps,
      // so twMerge cannot place them unaided; registered so `rounded-mode`
      // vs `rounded-lg` (etc.) resolve last-wins instead of both surviving.
      rounded: [{ rounded: ['mode', 'mode-pill'] }],
      p: [{ p: ['mode-page'] }],
      px: [{ px: ['mode-page'] }],
      py: [{ py: ['mode-page'] }],
      'min-h': [{ 'min-h': ['mode-hit', 'mode-hit-cta'] }],
      duration: [{ duration: ['mode-feedback', 'mode-press', 'mode-pulse'] }],
      // Spacing intents (tailwind.config.mjs plugin — spacing plan Phase 2).
      'cf-inset': ['inset-chip', 'inset-field', 'inset-cozy', 'inset-card', 'inset-empty'],
      'cf-stack': ['stack-tight', 'stack-row', 'stack-section'],
      'cf-row': ['row-gap', 'row-tight'],
    },
  },
});

/**
 * Merges Tailwind classes, resolving conflicts correctly.
 * @example cn('p-4', condition && 'p-8') → 'p-8' (if condition true)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
