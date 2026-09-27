/** Industrial record faces — the type and ink the To-ship record wears on the desk ledger AND on the phone (`/m/orders`). */

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
 * Fact label face — the region's label VOICE (`mode-label`, modes.ts
 * `labelVoice`): 10px mono bold caps at 0.08em on the floor (BRIEF §4
 * industrial; 700 is the heaviest mono cut loaded), 12px sans medium sentence
 * case on a desk (owner 2026-09-26). Write labels in sentence case in source.
 */
export const RECORD_LABEL_CLASS = 'mode-label';

/**
 * IDs / SKUs: data size, tabular. Industrial: mono bold (the floor reads
 * characters); triage: sans semibold (a desk reads words). `industrial:` is
 * the nearest-`data-mode` variant (`src/app/globals.css`).
 */
export const RECORD_ID_CLASS = 'font-sans text-role-data font-semibold tabular-nums industrial:font-mono industrial:font-bold';

/**
 * A key/value fact on one line — `BIN ZONE-F`, `SKU B0F3G6J45B`.
 * inner span, so key and value share ONE size and line box (owner 2026-09-25:
 */
export const RECORD_FACT_KEY_CLASS = 'font-semibold mode-label-case text-mode-muted';

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
 */
export const RECORD_RECESS_CLASS =
  'rounded-mode-control border border-mode-edge industrial:border-t-mode-control industrial:border-l-mode-control';

/**
 * Quantity on the record's right column — the labour multiplier, so it is the one boxed number in the row:
 * number heavier and a step larger than the IDs (owner 2026-09-24: one unit or
 */
export const RECORD_QTY_BADGE_CLASS = `inline-flex min-w-7 items-center justify-center ${RECORD_RECESS_CLASS} px-1.5 py-0.5 font-sans text-role-body font-bold leading-none tabular-nums industrial:font-mono`;

/**
 * Micro code voice — note badge, `+ Note`, condition chip. The region's label
 * voice (`--mode-label-*`, modes.ts): mono · caps · tracked on industrial,
 * sans · sentence case in triage. Write the text in sentence case in source.
 */
const RECORD_MICRO_CODE_CLASS =
  'rounded-mode-control font-[family-name:var(--mode-label-font)] text-role-micro font-bold mode-label-case leading-none';

/** State code ink resolved from the registry-owned functional tone. */
export function recordStateCodeClass(state: Pick<RecordStateFace, 'tone'>): string {
  return `state-code state-code-${state.tone}`;
}

/**
 * A tone's SOLID BADGE (owner 2026-09-25):
 * A tone's SOLID BADGE (owner 2026-09-25): the tone's `code` fill in its
 */
export function stateBadgeClass(tone: StateName): string {
  return `state-badge state-badge-${tone} px-1 py-px leading-none`;
}

/**
 * Buyer-note slot on band 1, right after the state code (owner 2026-09-24:
 * Buyer-note slot on band 1, right after the state code (owner 2026-09-24: a
 */
export const RECORD_NOTE_SLOT_CLASS = 'inline-flex w-11 shrink-0 items-center justify-center';

/**
 * The badge itself: warn-ink FILL with the bar ink on it. `text-mode-warn` is
 * the mode's 4.5:1 amber (the reason `URG` uses it), so inverting it keeps the
 * same contrast while reading as the loudest mark on the row.
 */
export const RECORD_NOTE_BADGE_CLASS = `inline-flex w-full items-center justify-center bg-mode-warn px-1 py-0.5 ${RECORD_MICRO_CODE_CLASS} text-mode-bar`;

/**
 * The EMPTY note slot where the note can be added in place (the desk To-ship
 * ledger): `+ NOTE` filled on the well in muted ink (owner 2026-09-25: an
 */
export const RECORD_NOTE_ADD_CLASS = `inline-flex w-full items-center justify-center gap-px bg-mode-well px-0.5 py-0.5 ${RECORD_MICRO_CODE_CLASS} text-mode-muted`;

/** The condition chip — the state badge's language (mono micro code, fixed width, icon first, 14px tall) as a SOLID fill in the grade's… */
export const RECORD_CONDITION_CHIP_CLASS = `inline-flex w-16 shrink-0 items-center gap-1 px-1 py-px ${RECORD_MICRO_CODE_CLASS}`;

/** Noted-record accent: */
export const RECORD_NOTE_SPINE_CLASS = 'shadow-[inset_-2px_0_0_var(--mode-warn-text)]';

/**
 * The open / checked record: an ink outline on the floor, a quiet fill on a
 * desk (owner 2026-09-26 — no heavy black lines on desktop; the outline's
 * colour is the mode's `mark`, transparent in triage).
 */
export const RECORD_OPEN_CLASS = 'bg-mode-hover outline outline-2 -outline-offset-2 outline-mode-mark';

/**
 * LAW — the record's TRAILING CELL (operator 2026-09-25:
 * LAW — the record's TRAILING CELL (operator 2026-09-25: "the alignment is
 */
export const RECORD_TRAILING_CELL_CLASS = 'inline-flex w-8 shrink-0 items-center justify-center';

/**
 * A details-panel row's trailing icon action (open ↗, edit ✎, copy) — the
 * same shape as the address copy / maps actions: a 28px square on the
 * region's control corner (rounded on the desk record, square on phones),
 * no seam. Pairs with `radius="control"` on `IconButton`.
 */
export const RECORD_TRAILING_ACTION_CLASS =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-mode-control text-mode-muted hover:bg-mode-hover hover:text-mode-ink';

/**
 * Right inset that lands a 14px glyph drawn INSIDE another control (the
 * SearchableSelectField chevron) on the trailing-cell axis: (32 − 14) / 2.
 * Pairs with {@link RECORD_TRAILING_CELL_CLASS}; never a different pr-*.
 */
export const RECORD_TRAILING_GLYPH_INSET_CLASS = 'pr-[9px]';
