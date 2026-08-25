/**
 * Idle-invisible icon chrome — the 1px box is always there so hover only
 * recolors it (no reflow). Paint lights on hover, :focus-visible, and
 * `@media (hover: none)` so a mounted tablet is not hover-gated.
 *
 * Compose with `size-8` (rails) or `size-7` (beam / composer). Active
 * accent stroke wins over the hover plate. Bare glyphs (Help, avatar)
 * take {@link railIconBare} — they already draw their own circle.
 */

/** Hover / focus / coarse-pointer plate. Size is the caller's. */
export const railIconPlate =
  'border border-transparent bg-transparent shadow-none hover:border-input hover:bg-muted focus-visible:border-input focus-visible:bg-muted focus-visible:ring-0 [@media(hover:none)]:border-input [@media(hover:none)]:bg-muted';

/** Armed / selected — accent stroke, no muted fill on top of it. */
export const railIconActive =
  'border-edge-accent text-ink-accent hover:border-edge-accent hover:bg-transparent focus-visible:border-edge-accent [@media(hover:none)]:border-edge-accent [@media(hover:none)]:bg-transparent';

/** Glyph that is already a shape — no second ring, ever. */
export const railIconBare =
  'border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:bg-transparent';

/** Disabled plated icon — no fake hover/coarse plate on a dead control. */
export const railIconPlateDisabled =
  'disabled:border-transparent disabled:bg-transparent disabled:hover:border-transparent disabled:hover:bg-transparent disabled:[@media(hover:none)]:border-transparent disabled:[@media(hover:none)]:bg-transparent';

/** Splitter paint: hover / group-hover / focus / coarse; caller adds drag fill. */
export const splitHairline =
  'bg-transparent hover:bg-edge-accent group-hover:bg-edge-accent group-focus-visible:bg-edge-accent [@media(hover:none)]:bg-edge-accent';
