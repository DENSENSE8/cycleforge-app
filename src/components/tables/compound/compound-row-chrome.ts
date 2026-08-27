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
 * One constant for both, because they must be exactly the same size. They are
 * the row's two full-bleed squares: the checkmark an operator scans down to
 * read what is selected, and the photo they scan down to find a box. Two
 * neighbouring tracks doing the same visual job at different widths read as a
 * mistake, so the width is declared once and both tracks spend it.
 *
 * **Why 3rem and not 4.** It is {@link COMPOUND_ROW_PX} expressed in rem, so
 * each gutter cell is 48×48 and a square source photo fills it corner to corner
 * with nothing cropped. A wider track would make the cell 64×48, and
 * `object-cover` would then quietly eat ~25% off the top and bottom of every
 * product photo — which is the opposite of showing the operator more of it.
 * It also keeps the model's total content width unchanged: `select` gains the
 * rem that `thumb` gives up, so no surface's horizontal-scroll threshold moves.
 *
 * **Neither track is operator-resizable.** `isGridColumnResizable` refuses
 * `select` unconditionally — it is a fixed control, not content — so a
 * draggable `thumb` could only ever break the equality the operator asked for.
 * The data tracks beside them stay draggable; these two are chrome.
 */
export const COMPOUND_GUTTER_TRACK_REM = COMPOUND_ROW_PX / 16;

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
