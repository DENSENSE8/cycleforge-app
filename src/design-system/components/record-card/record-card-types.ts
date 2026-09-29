/**
 * RecordCard contract — what a family adapter hands the card (layer 3 of
 * `docs/design-system/HANDOFF-record-card-foundation.md`). The card paints
 * this and nothing else: it never branches on the family (Law 1).
 */

import type { ComponentType, ReactNode } from 'react';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import type { StateName } from '@/design-system/tokens/lifecycle';
import type { RecordFactFace } from './record-fact';

/** `CARD_DISCLOSE` tiers (`tokens/desk-stage.ts`); `always` = no tier. */
export type CardDisclosureTier = 'always' | 'brand' | 'label' | 'detail';

/** One line of the record (an order's item). `facts` is keyed by `RecordFactColumn.id`; null / missing = this line has none. */
export interface RecordCardLine {
  id: number;
  title: string;
  photoUrl: string | null;
  facts: Readonly<Record<string, RecordFactFace | null>>;
  /** A line that needs attention (orders: out of stock) — danger ground in the status popover, counted while folded. */
  alert: boolean;
  /** Why it needs attention ("2 short · Brake lever"). */
  alertNote: string | null;
}

/** Deadline tones, earliest first: the top-right status of a record with a due date. */
export type RecordDeadlineTone = 'late' | 'today' | 'soon' | 'later' | 'none';

/** A due date's face (orders: the SLA). */
export interface RecordCardDeadline {
  face: string;
  tone: RecordDeadlineTone;
  /** Hover text; null = no tooltip. */
  tip: string | null;
}

/**
 * The top-right status — the family's most important state (Law 3), one
 * painter per kind: a DEADLINE (orders' ship-by), a STATE with no due date
 * (receiving's delivery / dock state, inked by its lifecycle tone), or a
 * DATE the record last moved (history's activity stamp; danger while `alert`).
 */
export type RecordCardStatus =
  | { kind: 'none' }
  | ({ kind: 'deadline' } & RecordCardDeadline)
  | { kind: 'state'; face: string; tone: StateName; tip: string | null }
  | { kind: 'date'; face: string; tip: string | null; alert: boolean };

/** A pill on line 1. With `onPress` it is a button; without, a static label. */
export interface RecordCardChip {
  id: string;
  tone: 'warning' | 'info';
  /** Face below the card's `label` tier (and the only face of a static chip). */
  short: string;
  /** Face from the `label` tier up; omitted = `short` at every width. */
  long?: string;
  tooltip?: string;
  onPress?: () => void;
  testId?: string;
}

/** The status icon's "needs attention" popover (orders: out of stock). Absent = a still icon with `meaning`. */
export interface RecordCardAlert {
  count: number;
  /** Popover header, right ("1 of 3 out of stock"). */
  summary: string;
  /** The icon button's aria label. */
  ariaLabel: string;
}

/**
 * The record's NEXT workflow step, as a present-tense verb (orders: Pick →
 * Pack → Scan out), painted as "→ Pack" at the card's bottom-right so the
 * operator reads "what happens to this next" without opening it.
 */
export interface RecordCardNextStep {
  /** The next verb, present tense ("Pack", "Scan out"). */
  label: string;
  /** That state's tone (its dot). */
  tone: StateName;
  /** Hover text ("Next: pack it — assigned to Ana"). */
  tip: string;
  /** The step cannot run yet (orders: a line is out of stock) — danger ink. */
  blocked: boolean;
}
/**
 * Family-owned line-one facts. The discriminant keeps these slots factual:
 * status has its own `RecordCardModel.status` channel and cannot be passed as
 * an unlabeled second node.
 */
export type RecordCardSlotFact =
  | { role: 'identity'; content: ReactNode }
  | { role: 'trailing'; content: ReactNode };


export interface RecordCardModel {
  /** Stable card key (list keys, expand / quick-look state). */
  key: string;
  /** The record id the body opens and the cursor walks (`data-desk-record-key`). */
  leadId: number;
  /** Rail tone + hatch, status icon ink, `data-state`. */
  state: RecordStateFace;
  stateIcon: ComponentType<{ className?: string }>;
  /** What the status icon means — its tooltip when there is no alert. */
  stateMeaning: string;
  alert: RecordCardAlert | null;
  aria: {
    /** The card: "Order #5043, Ready, Shimano XT derailleur". */
    card: string;
    /** The open target: "Open order #5043". */
    open: string;
    /** The checkbox: "Select order #5043". */
    check: string;
  };
  /** The channel the record came through: brand dot + name (from the `brand` tier) + optional badge. */
  channel: { label: string; tooltip: string; dot: ReactNode; badge: string | null } | null;
  /** The person on the record (buyer): from the `detail` tier, the first thing line 1 gives up. */
  person: string | null;
  chips: readonly RecordCardChip[];
  /**
   * Notes, read (and written) in line on line 1 — calm muted ink, never a
   * drop-down (owner 2026-09-27). `fixed` is someone else's words, read-only
   * (orders: the buyer's note); `own` is the team's latest note, edited in
   * place when the card gets `onSaveNote` — null shows the "Add note" state.
   */
  notes: { fixed: { label: string; text: string } | null; own: string | null };
  status: RecordCardStatus;
  /** Bottom-right: the next workflow step; null = nothing left (shipped). */
  next: RecordCardNextStep | null;
  /** Every line; [0] is the lead (the adapter puts alert lines first). */
  lines: readonly RecordCardLine[];
  /** Folded-row hint for hidden alert lines ("2 more out of stock"). */
  hiddenAlertLabel: (count: number) => string;
}

/**
 * The phone face's contract (`RecordCardMobile`, owner 2026-09-28 / 2026-09-29):
 * the desk card's facts minus what a phone never paints — no check, no hover
 * peek, no chips, no notes, no next step, no state rail, no record ref. The
 * family adapter fills it the same way.
 */
export interface RecordCardMobileModel {
  key: string;
  leadId: number;
  /** The channel the record came through — painted after the lead line's facts. */
  channel: { label: string; dot: ReactNode; badge: string | null } | null;
  /** Top-right: the due date (orders: the SLA). */
  deadline: RecordCardDeadline;
  /** Every line; [0] is the lead (the adapter puts alert lines first). */
  lines: readonly RecordCardLine[];
  aria: { card: string; open: string };
}
