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
 * the row box or the grid tears — the cell's `min-height` (paint), the
 * thumbnail (the one cell whose content can outgrow the row), and `LedgerGrid`'s
 * `rowEstimate` (the virtualizer's scroll math). A class string can only answer
 * the first.
 */

/** Row box in px — the compound cell's min-height and the virtualizer estimate. */
export const COMPOUND_ROW_PX = 48;

/** Square thumbnail edge. Must stay under {@link COMPOUND_ROW_PX}. */
export const COMPOUND_THUMB_PX = 32;

/**
 * The thumbnail TRACK, in rem, as used by every family's compound column model.
 * Wider than the image so the photo has inset on both sides and the track never
 * has to move if the image grows.
 */
export const COMPOUND_THUMB_TRACK_REM = 4;
