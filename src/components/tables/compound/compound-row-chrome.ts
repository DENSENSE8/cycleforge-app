/**
 * The compound row's fixed geometry — ONE display method, no operator setting.
 *
 * The two-row cell is deliberately not adjustable right now: getting every
 * table onto one layout is the job, and a density control multiplies the states
 * each surface has to be verified in. The repo already carries a
 * `table-density` SoT (`comfortable`/`compact`) for the FLAT rows; wiring the
 * compound row to it is a later pass, and when it happens these constants are
 * the single place that has to learn about it.
 *
 * Why px constants rather than Tailwind classes: three consumers must agree on
 * the row box or the grid tears — the cell's height (paint), the gutter cells'
 * full-bleed contents, and `LedgerGrid`'s `rowEstimate` (the virtualizer's
 * scroll math). A class string can only answer the first.
 */

/** Row box in px — the compound cell's height and the virtualizer estimate. */
export const COMPOUND_ROW_PX = 48;

/**
 * The GUTTER track — `select` and `thumb` — in rem. **A SQUARE of the row box.**
 *
 * The PHOTO gutter. This was one constant for both gutters until 2026-09-04,
 * when the select track shrank to {@link COMPOUND_SELECT_TRACK_REM} — see there
 * for why the equality was retired rather than broken by accident.
 *
 * **Why 3rem and not 4.** It is {@link COMPOUND_ROW_PX} expressed in rem, so
 * each gutter cell is 48×48 and a square source photo fills it corner to corner
 * with nothing cropped. A wider track would make the cell 64×48, and
 * `object-cover` would then quietly eat ~25% off the top and bottom of every
 * product photo — which is the opposite of showing the operator more of it.
 *
 * **Not operator-resizable.** The data tracks beside it stay draggable; the two
 * gutters are chrome.
 */
export const COMPOUND_GUTTER_TRACK_REM = COMPOUND_ROW_PX / 16;

/**
 * The SELECT gutter — narrower than the photo gutter, and deliberately not a
 * square.
 *
 * ## Why it split from {@link COMPOUND_GUTTER_TRACK_REM} (2026-09-04)
 *
 * The two gutters were one constant because they were doing the same visual
 * job: two full-bleed 48px squares, a checkmark column and a photo column, and
 * neighbouring tracks doing the same job at different widths read as a mistake.
 *
 * They stopped doing the same job. The photo is still content that gains from
 * every pixel — 48×48 is what lets a square source fill the cell with nothing
 * cropped by `object-cover`. The select gutter now holds a 16px control that
 * appears on row hover, and a 16px mark centred in a 48px track is 16px of
 * padding on each side: three times the control's own width, spent on the
 * column an operator's eye passes first. Operator 2026-09-04: smaller in width,
 * not a box or square, hard against the left edge with minimal padding.
 *
 * **1.5rem = 24px**: the 16px face plus 4px of slack a side — the least a
 * bordered control can take without its box touching the table's edge on one
 * side and the photo on the other. The cell keeps ZERO inset of its own
 * (`inset: 'none'`); those 4px are centring slack in the track, not padding.
 *
 * Still not operator-resizable — `isGridColumnResizable` refuses `select`
 * unconditionally. It is a fixed control, not content.
 */
export const COMPOUND_SELECT_TRACK_REM = 1.5;

/**
 * The same gutter track in px, at a 16px root.
 *
 * Used only as the intrinsic-size hint for `next/image`. The painted size comes
 * from `h-full w-full`, so a density-scaled rem track still fills correctly —
 * this number just stops the image being decoded at the wrong scale. (At a
 * non-default `--cf-density` the track scales while the row box does not, so
 * the cell stops being exactly square; the image still fills it.)
 */
export const COMPOUND_GUTTER_PX = COMPOUND_ROW_PX;
