/**
 * Industrial record faces — the type and ink the To-ship record wears on the
 * desk ledger AND on the phone (`/m/orders`). One source so the two clients
 * cannot drift (HANDOFF-industrial-record-ledger Step 1 / Step 3). Geometry
 * (band heights, lanes) stays per client; the FACES are shared.
 */

import { LIFECYCLE, LIFECYCLE_CLASSES, STATE_TONE_CLASSES, type LifecycleState } from './lifecycle';

/** Mono label face: 10px heavy uppercase, 0.08em (BRIEF §4 industrial). */
export const RECORD_LABEL_CLASS = 'font-mono text-role-micro font-extrabold uppercase tracking-[0.08em]';

/** IDs / SKUs: mono bold 13. */
export const RECORD_ID_CLASS = 'font-mono text-role-data font-bold tabular-nums';

/**
 * Price: the ID face in the success ink, so the money catches the eye where
 * it is shown — the evidence column / sheet only. The floor row omits it:
 * price is noise during pick, pack and triage (owner 2026-09-24).
 */
export const RECORD_PRICE_CLASS = `${RECORD_ID_CLASS} ${STATE_TONE_CLASSES.success.text}`;

/** Title: sans bold, one line, ellipsis. */
export const RECORD_TITLE_CLASS = 'min-w-0 truncate text-role-body font-bold';

/**
 * Quantity on the record's right column — the labour multiplier, so it is the
 * one boxed number in the row: a hairline badge in its own ink, heavier and a
 * step larger than the IDs (owner 2026-09-24: one unit or ten, read without
 * searching).
 */
export const RECORD_QTY_BADGE_CLASS =
  'inline-flex min-w-7 items-center justify-center border border-current px-1.5 py-0.5 font-mono text-role-body font-black leading-none tabular-nums';

/**
 * State code ink. Warning codes (`URG`, `HLD`) read in the mode's warn ink —
 * amber fails 4.5:1 as text.
 */
export function recordStateCodeClass(state: LifecycleState): string {
  return LIFECYCLE[state].tone === 'warning' ? 'text-mode-warn' : LIFECYCLE_CLASSES[state].text;
}

/**
 * Buyer-note slot on band 1, right after the state code (owner 2026-09-24: a
 * buyer note is an active fulfillment exception, not metadata). The SLOT is
 * rigid on every record — a noted order fills it with the amber `NOTE` badge,
 * an un-noted one keeps it empty at the same width — so platform and order #
 * never shift between rows.
 */
export const RECORD_NOTE_SLOT_CLASS = 'inline-flex w-11 shrink-0 items-center justify-center';

/**
 * The badge itself: warn-ink FILL with the bar ink on it. `text-mode-warn` is
 * the mode's 4.5:1 amber (the reason `URG` uses it), so inverting it keeps the
 * same contrast while reading as the loudest mark on the row.
 */
export const RECORD_NOTE_BADGE_CLASS =
  'inline-flex w-full items-center justify-center bg-mode-warn px-1 py-0.5 font-mono text-role-micro font-black uppercase leading-none tracking-[0.08em] text-mode-bar';

/**
 * Noted-record accent: a 2px amber inset on the RIGHT edge of the existing 5px
 * state spine — zero width change, no second vertical line (owner removed
 * double lines on seed children). The spine's own tone/hatch stays readable,
 * so a noted OOS row still reads OOS first.
 */
export const RECORD_NOTE_SPINE_CLASS = 'shadow-[inset_-2px_0_0_var(--mode-warn-text)]';
