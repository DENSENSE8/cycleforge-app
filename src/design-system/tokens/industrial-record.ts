/**
 * Industrial record faces — the type and ink the To-ship record wears on the
 * desk ledger AND on the phone (`/m/orders`). One source so the two clients
 * cannot drift (HANDOFF-industrial-record-ledger Step 1 / Step 3). Geometry
 * (band heights, lanes) stays per client; the FACES are shared.
 */

import { STATE_TONE_CLASSES, type StateName } from './lifecycle';

/** A registry-owned state face consumed by record rows and evidence. */
export interface RecordStateFace {
  id: string;
  code: string;
  label: string;
  tone: StateName;
  icon: string;
  hatched?: boolean;
}

/**
 * Mono label face: 10px bold uppercase, 0.08em (BRIEF §4 industrial). 700 is
 * the heaviest mono cut loaded (`src/lib/fonts.ts`); asking for 800/900 here
 * rendered as 600 before that cut shipped (owner 2026-09-25, item 7).
 */
export const RECORD_LABEL_CLASS = 'font-mono text-role-micro font-bold uppercase tracking-[0.08em]';

/** IDs / SKUs: mono bold 13. */
export const RECORD_ID_CLASS = 'font-mono text-role-data font-bold tabular-nums';

/**
 * A key/value fact on one line — `BIN ZONE-F`, `SKU B0F3G6J45B`. The value
 * wears {@link RECORD_ID_CLASS} on the outer span; the key is this class on an
 * inner span, so key and value share ONE size and line box (owner 2026-09-25:
 * a 10px key beside a 13px value read as two heights).
 */
export const RECORD_FACT_KEY_CLASS = 'font-semibold uppercase tracking-[0.04em] text-mode-muted';

/**
 * Price: the ID face in the success ink, so the money catches the eye where
 * it is shown — the evidence column / sheet only. The floor row omits it:
 * price is noise during pick, pack and triage (owner 2026-09-24).
 */
export const RECORD_PRICE_CLASS = `${RECORD_ID_CLASS} ${STATE_TONE_CLASSES.success.text}`;

/** Title: sans bold, one line, ellipsis. */
export const RECORD_TITLE_CLASS = 'min-w-0 truncate text-role-body font-bold';

/**
 * RECESS — an editable box reads sunk into the plane it sits on (owner
 * 2026-09-25, item 8). BRIEF §4: 1px rules, no shadows — so the depth is drawn
 * with the rules alone: top + left in the control ink (18.9:1, the ≥ 3:1 edge
 * that identifies the control), right + bottom in the edge grey, as if light
 * falls from the top-left. Worn by the QTY box and the note field.
 */
export const RECORD_RECESS_CLASS = 'border border-mode-edge border-t-mode-control border-l-mode-control';

/**
 * Quantity on the record's right column — the labour multiplier, so it is the
 * one boxed number in the row: a recessed box (it is clicked to edit), the
 * number heavier and a step larger than the IDs (owner 2026-09-24: one unit or
 * ten, read without searching).
 */
export const RECORD_QTY_BADGE_CLASS = `inline-flex min-w-7 items-center justify-center ${RECORD_RECESS_CLASS} px-1.5 py-0.5 font-mono text-role-body font-bold leading-none tabular-nums`;

/** State code ink resolved from the registry-owned functional tone. */
export function recordStateCodeClass(state: Pick<RecordStateFace, 'tone'>): string {
  return `state-code state-code-${state.tone}`;
}

/**
 * A tone's SOLID BADGE (owner 2026-09-25): the tone's `code` fill in its
 * `codeInk` (`STATE_TONES`, ≥ 4.5:1 every tone). Worn by the desk state code
 * (`LifecycleCode`) and the evidence header's next step, in the record's tone.
 * The caller sets the width.
 */
export function stateBadgeClass(tone: StateName): string {
  return `state-badge state-badge-${tone} px-1 py-px leading-none`;
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
  'inline-flex w-full items-center justify-center bg-mode-warn px-1 py-0.5 font-mono text-role-micro font-bold uppercase leading-none tracking-[0.08em] text-mode-bar';

/**
 * The EMPTY note slot where the note can be added in place (the desk To-ship
 * ledger): `+ NOTE` filled on the well in muted ink (owner 2026-09-25: an
 * empty state that is filled, an inline option to add a note). Same box as
 * the amber badge, so adding a note never shifts the row; grey, not amber, so
 * it never reads as a note that exists.
 */
export const RECORD_NOTE_ADD_CLASS =
  'inline-flex w-full items-center justify-center gap-px bg-mode-well px-0.5 py-0.5 font-mono text-role-micro font-bold uppercase leading-none tracking-[0.08em] text-mode-muted';

/**
 * The condition chip — the state badge's language (mono micro code, fixed
 * width, icon first, 14px tall) as a SOLID fill in the grade's colour (owner
 * 2026-09-25: solid like the state badge, not hollow). Rigid width: `A` and
 * `L-NEW` occupy the same box, so BIN and SKU never shift. The caller adds
 * the fill + ink (`CONDITION_GRADE_TONE[grade].solid`, ≥ 4.5:1), or the well
 * with muted ink when no grade is set.
 */
export const RECORD_CONDITION_CHIP_CLASS =
  'inline-flex w-16 shrink-0 items-center gap-1 px-1 py-px font-mono text-role-micro font-bold uppercase leading-none tracking-[0.08em]';

/**
 * Noted-record accent: a 2px amber inset on the RIGHT edge of the existing 5px
 * state spine — zero width change, no second vertical line (owner removed
 * double lines on seed children). The spine's own tone/hatch stays readable,
 * so a noted OOS row still reads OOS first.
 */
export const RECORD_NOTE_SPINE_CLASS = 'shadow-[inset_-2px_0_0_var(--mode-warn-text)]';

/**
 * LAW — the record's TRAILING CELL (operator 2026-09-25: "the alignment is
 * correct; pin it"). Every right-edge affordance of a ledger row or evidence
 * fact — disclosure +/−, open ↗, edit ✎, a picker's ⌄, the price Items chevron
 * — is a 14px glyph centred in ONE 32px cell flush with the content edge, so
 * they all stack on one vertical axis (measured ±0.5px). A new trailing
 * control goes in this cell; nothing pads, margins or `ml-auto`s its own way
 * to the edge. Mount `EvidenceDisclosure` / `EvidenceFactDisclosure`, which
 * own the cell, before hand-placing one.
 */
export const RECORD_TRAILING_CELL_CLASS = 'inline-flex w-8 shrink-0 items-center justify-center';

/**
 * Right inset that lands a 14px glyph drawn INSIDE another control (the
 * SearchableSelectField chevron) on the trailing-cell axis: (32 − 14) / 2.
 * Pairs with {@link RECORD_TRAILING_CELL_CLASS}; never a different pr-*.
 */
export const RECORD_TRAILING_GLYPH_INSET_CLASS = 'pr-[9px]';
