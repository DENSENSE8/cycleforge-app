/**
 * Industrial record ledger — the To-ship row geometry, in ONE place.
 *
 * BRIEF §4 industrial (desk): 5px state spine · square photo · three record
 * bands, 1px rules, radius 0. Row zoom is per list, per staff (S / M / L):
 *
 * | Zoom | Photo | Bands            | Row (incl. 1px rule) |
 * |------|-------|------------------|----------------------|
 * | S    | 32    | one 32px line    | 33                   |
 * | M    | 96    | 3 × 32px         | 97  (default)        |
 * | L    | 108   | 3 × 36px         | 109                  |
 *
 * Heights are FIXED per zoom so the virtualizer never measures — the same
 * numbers drive the first-paint stand-in, which is what keeps the SSR → client
 * swap from shifting a pixel. Band rules live INSIDE each band's box
 * (border-box), so three 32px bands are 96px, not 98.
 *
 * Classes, not colours: every colour a row paints comes from the mode
 * (`bg-mode-*`, `text-mode-*`, `border-mode-*`) or from `LIFECYCLE_CLASSES`.
 */

import type { CSSProperties } from 'react';

export type LedgerRowZoom = 'S' | 'M' | 'L';

export const LEDGER_ROW_ZOOMS: readonly LedgerRowZoom[] = ['S', 'M', 'L'];

export const LEDGER_DEFAULT_ZOOM: LedgerRowZoom = 'M';

export const LEDGER_ZOOM_LABEL: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'Small rows',
  M: 'Medium rows',
  L: 'Large rows',
};

export function isLedgerRowZoom(value: unknown): value is LedgerRowZoom {
  return value === 'S' || value === 'M' || value === 'L';
}

/** Full virtual-item height of one record, bottom rule included. */
export const LEDGER_ROW_PX: Readonly<Record<LedgerRowZoom, number>> = { S: 33, M: 97, L: 109 };

/**
 * A seed-group parent record: one band tall at every zoom (it carries the
 * order's identity and totals, never a second copy of a child's bands).
 */
export const LEDGER_GROUP_PX: Readonly<Record<LedgerRowZoom, number>> = { S: 33, M: 33, L: 37 };

/** One band's box (rule included). */
export const LEDGER_BAND_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'h-8',
  M: 'h-8',
  L: 'h-9',
};

/** Row box heights — must equal {@link LEDGER_ROW_PX}. */
export const LEDGER_ROW_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'h-[33px]',
  M: 'h-[97px]',
  L: 'h-[109px]',
};

/** Group parent box heights — must equal {@link LEDGER_GROUP_PX}. */
export const LEDGER_GROUP_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'h-[33px]',
  M: 'h-[33px]',
  L: 'h-[37px]',
};

/** Photo lane: a full-bleed square, no inset. */
export const LEDGER_PHOTO_CLASS: Readonly<Record<LedgerRowZoom, string>> = {
  S: 'w-8 h-8',
  M: 'w-24 h-24',
  L: 'w-[108px] h-[108px]',
};

/** The 5px state spine. */
export const LEDGER_SPINE_CLASS = 'w-[5px] shrink-0 self-stretch';

/**
 * Out-of-stock spine: the tone's fill under a diagonal hatch in the row
 * plane's colour — the non-colour carrier for the one state that stops work.
 */
export const LEDGER_SPINE_HATCH_CLASS =
  '[background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--mode-panel)_3px_5px)]';

/** Seed-group child indent — the lane under the group's shared spine. */
export const LEDGER_CHILD_INDENT_CLASS = 'w-4 shrink-0 self-stretch';

/** Mono label face: 10px heavy uppercase, 0.08em (BRIEF §4 industrial). */
export const LEDGER_LABEL_CLASS =
  'font-mono text-role-micro font-extrabold uppercase tracking-[0.08em]';

/** IDs / SKUs: mono bold 13. */
export const LEDGER_ID_CLASS = 'font-mono text-role-data font-bold tabular-nums';

/** Title: sans bold, one line, ellipsis. */
export const LEDGER_TITLE_CLASS = 'min-w-0 truncate text-role-body font-bold';

/**
 * Toolbar strip. Shared with the SSR stand-in so the first data row lands on
 * the same pixel before and after hydration.
 */
export const LEDGER_TOOLBAR_CLASS =
  'flex min-h-mode-hit min-w-0 shrink-0 items-center gap-1 border-b border-mode-ink bg-mode-bar pr-0';

/**
 * Lifts nested shared controls (toolbar menus drawn at the slot table's 28px
 * chrome face, the order-number chip) to the desk's 32px hit floor on this page
 * only, without forking them.
 */
export const LEDGER_NESTED_HIT_CLASS = '[&_button]:min-h-mode-hit';

/** Desk hit floor for every in-row control (32px). */
export const LEDGER_HIT_CLASS = 'min-h-mode-hit';

/**
 * Pins the type scale inside the ledger. Row heights are fixed for the
 * virtualizer, so the viewer's grid density (`--cf-density`, the slot table's
 * 100% zoom) must not grow text past its band; S / M / L is this list's zoom.
 */
export const LEDGER_DENSITY_STYLE = { '--cf-density': '1' } as CSSProperties;
