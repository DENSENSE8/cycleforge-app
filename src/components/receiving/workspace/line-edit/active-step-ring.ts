/**
 * Moving-outline token — the shared "hardware-agnostic cursor" that isolates,
 * on an in-line capture face, the exact target the dock is asking for.
 *
 * This is the DO-plane half of the scan-cockpit DO/KNOW split
 * (`display/scan-cockpit.md`): the dock is the command palette (input), the
 * in-line row is the state visualizer (output). ONE derivation
 * (`useUnboxProcedureSteps(row).activeKey`) drives both — no second store.
 *
 * ## Two forms, one contract, one accent
 *
 *  - `ACTIVE_STEP_RING_CLASS` — the raw, station-neutral ring, for a component
 *    that applies the outline to itself (Phase 2 stepper "Current" token; the
 *    Testing / Arrival ports inherit it verbatim).
 *  - the data-attribute render path — the capture row stamps
 *    `data-active-step={activeKey}`, and unlayered CSS in `styles/globals.css`
 *    lights the ONE `[data-capture-segment]` / `[data-capture-condition]` it
 *    names. That is what makes the outline SNAP across segments with no React
 *    state-drilling and zero layout shift. Both forms resolve the SAME accent
 *    (`--ds-color-accent-bg`), so they cannot drift.
 *
 * ## Why an INSET outline (not a ring, not a glow)
 *
 * The capture bar is a flush, zero-padding joined instrument inside an
 * `overflow-hidden` shell. An `outline-offset: -2px` draws INSIDE the target's
 * border box, so it is unclippable by the shell and adds no width — the row
 * geometry is byte-identical armed or idle. Same precedent as
 * `focusRing('cell')`. A `box-shadow` glow would bleed past the flush seam and
 * read as decoration untied to state; this is a cursor, so it is an outline.
 *
 * ## Motion (Gate B — instant snap)
 *
 * No `transition` — the outline hard-cuts to the new target on `activeKey`
 * change, matching the armed-cursor instant grammar and bench speed. There is
 * therefore nothing to disable under reduced motion (it is a no-op by
 * construction).
 *
 * Colour is operator accent (`accent-bg` → `--ds-color-accent-bg`, staff-
 * themeable), never a page-local hex and never `bg-amber-*` — the same family
 * as the armed-cursor (`armed-cursor-face.ts`). Law:
 * Unbox centre (main) · Active-step outline.
 */

import { cn } from '@/utils/_cn';

/**
 * The raw moving-outline ring — a 2px inset accent outline on flush geometry.
 *
 * Apply directly where a component owns the outline itself. The in-line capture
 * row does NOT compose this class; it stamps `data-active-step` and the
 * unlayered globals.css rule paints the same `2px` / `-2px` / `--ds-color-accent-bg`
 * on the matched segment. Keep the two in lockstep.
 */
export const ACTIVE_STEP_RING_CLASS = cn(
  'outline-2 outline-accent-bg -outline-offset-2',
);

/**
 * Which `data-active-step` values light a given in-line capture target.
 *
 * The SEGMENT key (`photos`) and the STEP key (`item_photos`) differ, so the
 * Photos segment lights for either. Kept here so the globals.css selectors and
 * any future direct consumer read one map. The globals.css render path mirrors
 * this exactly — extend both together.
 */
export const ACTIVE_STEP_OUTLINE_TARGETS = {
  serial: ['serial'],
  photos: ['photos', 'item_photos'],
  condition: ['condition'],
} as const satisfies Record<string, readonly string[]>;
