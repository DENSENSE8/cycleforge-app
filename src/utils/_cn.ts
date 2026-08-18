import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Custom font-size utilities defined in `tailwind.config.ts` (theme.fontSize).
 * Keep this list in sync with that config — it is the sub-12px compact scale
 * (`text-mini` … `text-label`) used pervasively in station/sidebar UI.
 *
 * tailwind-merge ships knowing only Tailwind's built-in sizes. Without this,
 * it cannot tell that `text-micro` is a FONT SIZE, so it lumps it into the
 * text-COLOR conflict group: `cn('text-micro', 'text-white')` then drops
 * `text-micro` and the element falls back to the default ~16px. Registering
 * the names in the `font-size` group fixes the conflict resolution so the
 * tokens are safe to use anywhere `cn()` runs (which is why they can replace
 * the hand-rolled `text-[10px]` arbitrary values — see the typography guard).
 *
 * `role-*` are the CF Type role-bundled scale (search-and-dense-ui-refactor
 * plan §2.3): `text-role-body`/`-data`/`-eyebrow`/… bundle size + line-height +
 * tracking + weight. They are font-size utilities too, so they MUST be listed
 * here or twMerge misgroups `text-role-body` as a color and drops it.
 */
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
] as const;

const twMerge = extendTailwindMerge<'cf-inset' | 'cf-stack' | 'cf-row'>({
  extend: {
    classGroups: {
      'font-size': [{ text: [...CUSTOM_FONT_SIZES] }],
      // Elevation ladder (tailwind.config.ts theme.extend.boxShadow —
      // `shadow-elev-*` via elevationClass). Unregistered, twMerge cannot tell
      // `shadow-elev-raised` is a box-SHADOW (it is not a t-shirt size), lumps
      // it into the shadow-COLOR group, and two elevation roles on one element
      // both survive — stylesheet order then picks silently. Same failure mode
      // as the font-size roles above.
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
      // Spacing intents (tailwind.config.ts plugin — spacing plan Phase 2).
      // Own groups so two intents of one kind conflict-resolve (last wins);
      // unregistered, twMerge would treat them as unknown classes and keep
      // both, letting stylesheet order pick silently. Cross-axis (intent +
      // raw p-*/px-*) is deliberately NOT a conflict: both classes survive
      // and the intent wins in CSS order — don't mix them on one element.
      // Keep in sync with the plugin + safelist in tailwind.config.ts.
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
