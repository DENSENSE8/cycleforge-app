import { cn } from '@/utils/_cn';

/**
 * In-field ACTION CELL — the one face for a control riding inside a search
 * field's trailing row: **paste** · **in-field refine** (the filter funnel) ·
 * **rail collapse**.
 *
 * ```text
 * [🔍  filter tracking…………………………………  📋  ⧉ ]
 *                                      paste refine
 * ```
 *
 * `TechRailSearchBar` has described these as one grammar since it was written —
 * *"all three use a 24px control / 14px glyph box and one centered row"* — but
 * the cell was DECLARED in three places (`SearchField`'s paste button,
 * `RailFilterCollapseButton`)
 * and had already drifted: the two field cells hover blue, collapse hovered to
 * `text-text-default`. A sentence in a docblock cannot fail. A shared token can
 * only be broken on purpose.
 *
 * **Class-level, not a component, on purpose.** The refine cell must be a raw
 * `<button>` that Radix `Popover.Trigger asChild` can ref, and it nests a hot
 * dot; paste adds a hover-reveal class; collapse rides an `IconButton` for its
 * focus ring. One face, three legitimately different shells — a component here
 * would have to grow a prop per shell, which is how a face becomes a fork.
 *
 * Peer, one rung up: {@link WorkbenchBandControl} is the same idea for the
 * band's own controls (Views · KPI · inspector), sized to the ROW rather than
 * to the field.
 */

/**
 * Resting + hover tone. Split out because the collapse cell keeps `IconButton`
 * (which owns the box and the focus ring) and needs only this half.
 */
export const FIELD_ACTION_TONE_CLASS = 'text-text-faint hover:text-blue-600';

/**
 * The whole 24px cell, for a raw `<button>` shell. `transition-[opacity,color]`
 * rather than `transition-colors` so a hover-revealed cell (paste) fades with
 * the same curve its peers change color on.
 */
export const FIELD_ACTION_CLASS = cn(
  'inline-flex h-6 w-6 shrink-0 items-center justify-center transition-[opacity,color] duration-100 ease-out active:scale-95',
  FIELD_ACTION_TONE_CLASS,
);

/** 14px glyph inside the cell — never a bare `h-4` twin. */
export const FIELD_ACTION_GLYPH_CLASS = 'h-3.5 w-3.5';
