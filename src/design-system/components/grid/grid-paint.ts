/**
 * First-paint + windowing knobs for dense LedgerGrid surfaces.
 *
 * Virtualization already keeps off-screen rows out of the DOM. These
 * constants stop the virtualizer from over-building the first paint
 * (Speed Index) while leaving enough overscan that a keyboard-held
 * ↓ or a fast wheel does not flash empty tracks.
 *
 * Do not add `content-visibility: auto` on virtualized rows — TanStack
 * unmounts them, and `content-visibility` fights `measureElement`.
 */

/** Visible-window overscan. 6 × 40px row ≈ 240px each side. */
export const LEDGER_GRID_OVERSCAN = 6;

/** First-paint row-height estimate (Receiving golden `h-10`). */
export const LEDGER_GRID_ROW_ESTIMATE_PX = 40;

/** Sticky day-band header estimate. */
export const LEDGER_GRID_HEADER_ESTIMATE_PX = 36;
