/**
 * Interaction states — the SoT for what a tappable surface does under a
 * finger, a cursor and a keyboard (operator 2026-09-13: *"proper on hover
 */

import { focusRing } from '@/design-system/tokens/focus-ring';

/** Minimum height for a standalone tap target — 44px (`min-h-11`). */
export const TAP_MIN_H_CLASS = 'min-h-11';

/**
 * Pointer hygiene every tappable surface needs, whatever it looks like: no
 * double-tap-zoom wait, and no competing browser tap flash.
 */
export const TAP_POINTER_CLASS =
  'touch-manipulation [-webkit-tap-highlight-color:transparent]';

/**
 * The tone shift, scoped to `background-color` and reduced-motion aware.
 * `active` is listed after `hover` deliberately: a mouse that is hovering AND
 * pressing must read as pressed.
 */
export const TAP_TONE_CLASS =
  'transition-[background-color] duration-150 ease-out motion-reduce:transition-none hover:bg-surface-hover active:bg-surface-sunken';

/**
 * A full-bleed, flush LIST ROW that commits on activation — a search hit, a
 * queue row, a picker row. Press is the primary state; hover is the cursor's
 * bonus; focus is an inset ring because the row has no margin to offset into.
 */
export const TAPPABLE_ROW_CLASS = `${TAP_POINTER_CLASS} ${TAP_TONE_CLASS} ${focusRing('cell')}`;
