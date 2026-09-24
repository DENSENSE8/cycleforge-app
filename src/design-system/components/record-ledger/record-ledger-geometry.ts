/**
 * Record ledger geometry — the industrial record's box, in ONE place, for every
 * page that adopts the ledger after To ship (HANDOFF-industrial-record-ledger
 * "The record" law 4, desk Medium):
 *
 *   spine 5 │ photo 96 │ 3 × 32px bands │ right lane (date · QTY · next)
 *   row = 97 incl. the 1px rule between records
 *
 * Heights are FIXED so the virtualizer never measures. Band rules live INSIDE
 * each band's box (border-box), so three 32px bands are 96px, not 98.
 *
 * Classes, not colours: every colour a record paints comes from the region's
 * mode (`*-mode-*`) or from `LIFECYCLE_CLASSES`, so the same record reads in an
 * industrial or a triage region without a second copy. Page files take their
 * geometry from here and never type a px value of their own.
 */

import type { CSSProperties } from 'react';

/** Full virtual-item height of one record, bottom rule included. */
export const RECORD_ROW_PX = 97;

/** Row box height — must equal {@link RECORD_ROW_PX}. */
export const RECORD_ROW_CLASS = 'h-[97px]';

/** One band's box (rule included). */
export const RECORD_BAND_CLASS = 'h-8';

/** Photo lane: a full-bleed square, no inset. */
export const RECORD_PHOTO_CLASS = 'h-24 w-24';

/** The 5px state spine. */
export const RECORD_SPINE_CLASS = 'w-[5px] shrink-0 self-stretch';

/**
 * Out-of-stock spine: the tone's fill under a diagonal hatch in the row plane's
 * colour — the non-colour carrier for the one state that stops work.
 */
export const RECORD_SPINE_HATCH_CLASS =
  '[background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--mode-panel)_3px_5px)]';

/**
 * The right lane — ONE column down all three bands (date · QTY · next), so its
 * hairline is the same pixel on every band.
 */
export const RECORD_RIGHT_LANE_CLASS =
  'flex h-full w-32 shrink-0 items-center justify-end gap-1.5 border-l border-mode-edge px-2';

/** Location lane on band 1 — wide enough for a segmented bin code before it clips. */
export const RECORD_LOCATION_CLASS = 'w-44 shrink-0';

/** Desk hit floor for every in-record control (32px desk, 48 touch). */
export const RECORD_HIT_CLASS = 'min-h-mode-hit';

/**
 * Toolbar strip over the records — the mode's hit height plus a 1px ink rule,
 * the same line the evidence column's head draws so the two read as one bar.
 */
export const RECORD_TOOLBAR_CLASS =
  'flex min-h-mode-hit min-w-0 shrink-0 items-stretch border-b border-mode-ink bg-mode-bar';

/**
 * The evidence column beside the ledger — the desktop terminal's
 * `.evidence-panel` (`max(288px, 24vw)`), always mounted at ≥64rem container so
 * opening a record never reflows the rows. Below that it overlays the rows.
 */
export const RECORD_EVIDENCE_WIDTH_CLASS = 'w-[max(18rem,24vw)]';

/**
 * Pins the type scale inside the ledger. Row heights are fixed for the
 * virtualizer, so the viewer's grid density (`--cf-density`) must not grow
 * text past its band.
 */
export const RECORD_DENSITY_STYLE = { '--cf-density': '1' } as CSSProperties;
