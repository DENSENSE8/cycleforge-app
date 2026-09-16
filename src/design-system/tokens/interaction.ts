/**
 * Interaction states — the SoT for what a tappable surface does under a
 * finger, a cursor and a keyboard (operator 2026-09-13: *"proper on hover
 * states and clicking / tapping states — think mobile first"*).
 *
 * ## Why this module exists
 *
 * There was no token for this, so every surface invented one. A census of the
 * phone routes found `active:bg-surface-hover`, `active:bg-surface-sunken`,
 * `active:bg-surface-strong`, `active:bg-teal-700`, `active:scale-95` and
 * `group-active:scale-95` hand-rolled across `/m/h`, `/m/pick`, `/m/receiving`,
 * `/m/rs`, `/bin`, `/photos`, `/kiosk` — the same drift `focus-ring.ts` was
 * written to end for focus. This is that module for pointer and touch.
 *
 * ## The mobile-first law
 *
 * **1. HOVER IS NOT FEEDBACK.** A finger never hovers. Tailwind v4 already
 * compiles `hover:` to `@media (hover: hover)`, so a hover style is correctly
 * inert on touch — which means a surface whose ONLY state is `hover:` gives a
 * phone operator nothing at all when they tap it. Hover is the cursor's
 * courtesy; it is never the confirmation that a tap registered.
 *
 * **2. PRESS IS THE PRIMARY STATE.** `:active` fires for both a finger and a
 * mouse button, so it is the one state every pointer shares. It is REQUIRED on
 * anything tappable; hover is optional decoration on top of it.
 *
 * **3. THE BROWSER'S OWN FLASH IS TURNED OFF.** Mobile WebKit/Blink paint a
 * grey `-webkit-tap-highlight-color` box on tap. Left on, the operator sees the
 * browser's rectangle instead of our press state, in the browser's colour, at
 * the browser's timing. It is suppressed so there is exactly one press
 * affordance.
 *
 * **4. NO TAP DELAY.** `touch-manipulation` drops the legacy ~300ms
 * double-tap-zoom wait, which is the difference between a row that answers and
 * a row that feels broken.
 *
 * **5. 44px OR MORE.** {@link TAP_MIN_H_CLASS} is the floor for a standalone
 * tap target (`SURFACE_LAW` R2/R6). Rows that are naturally taller do not need
 * it; rows that would come in under it do.
 *
 * **6. TRANSITION THE PROPERTY, NEVER `all`.** The recipe names
 * `background-color` and honours `prefers-reduced-motion`. A press must never
 * animate a layout property — a row that moves under the finger loses the
 * target the finger is already committed to.
 *
 * **7. KEYBOARD GETS AN INSET RING.** A full-bleed list row is flush against
 * its siblings, so `focusRing('cell')` (inset) is the archetype — an offset
 * ring paints into the neighbouring row and gets clipped by the divider.
 *
 * ## Two press ARCHETYPES, not two laws
 *
 * A CONTROL presses by TRAVEL — `TACTILE_PRESS_TRAVEL_CLASS` in
 * `@/design-system/tokens/shadows`, the kiosk CTA's 3px drop. A ROW presses by
 * TONE, which is what this module adds. They are not competing recipes:
 *
 * | archetype | press | why |
 * |---|---|---|
 * | control (button, CTA, keycap) | 3px travel | it is an object with thickness; it goes down |
 * | row (list item, hit, queue line) | tone shift | it is a region of a surface; nothing to depress |
 *
 * A row must NOT travel. It has no edge to drop against, it is flush with the
 * rows above and below, and translating it moves the target out from under a
 * finger that has already committed to a position. Conversely a CTA must not
 * merely tint — see the shadows module for why the travel survived its lip.
 *
 * Consume via `cn(TAPPABLE_ROW_CLASS, …)` for a row and
 * `TACTILE_PRESS_TRAVEL_CLASS` for a control. Never hand-roll an `active:bg-*`
 * or an `active:scale-*`: a shrink and a drop are two motions for one press.
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
