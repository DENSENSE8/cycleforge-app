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
  // AI chat prose scale (src/design-system/ai/tokens.ts AI_TYPE).
  'ai-greeting',
  'ai-prose',
  'ai-title',
  'ai-prose-sm',
  'ai-label',
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
            // AI system depth (src/design-system/ai/tokens.ts AI_ELEVATION).
            'ai-card',
            'ai-card-hover',
            'ai-composer',
            'ai-panel',
          ],
        },
      ],
      // Task-mode vars (src/design-system/modes/registry.ts). Not named steps,
      // so twMerge cannot place them unaided; registered so `rounded-mode`
      // vs `rounded-lg` (etc.) resolve last-wins instead of both surviving.
      rounded: [
        {
          rounded: [
            'mode',
            'mode-control',
            'mode-pill',
            // AI system corners (src/design-system/ai/tokens.ts AI_RADIUS).
            'ai-control',
            'ai-chip',
            'ai-step',
            'ai-card',
            'ai-panel',
            'ai-bubble',
            'ai-composer',
          ],
        },
      ],
      p: [{ p: ['mode-page'] }],
      px: [{ px: ['mode-page', 'ai-gutter'] }],
      gap: [{ gap: ['ai-turn'] }],
      'max-w': [{ 'max-w': ['ai-column'] }],
      w: [{ w: ['ai-panel'] }],
      py: [{ py: ['mode-page'] }],
      'min-h': [{ 'min-h': ['mode-hit', 'mode-hit-cta'] }],
      duration: [{ duration: ['mode-feedback', 'mode-press', 'mode-pulse'] }],
      // AI iridescent accent (backgroundImage, src/design-system/ai/tokens.ts).
      'bg-image': [{ bg: ['ai-iris', 'ai-iris-sweep', 'ai-iris-conic'] }],
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
