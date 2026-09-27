/**
 * RecordCard contract — what a family adapter hands the card (layer 3 of
 * `docs/design-system/HANDOFF-record-card-foundation.md`). The card paints
 * this and nothing else: it never branches on the family (Law 1).
 */

import type { ComponentType, ReactNode } from 'react';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
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

/** The top-right status — the family's most important state (Law 3). */
export interface RecordCardDeadline {
  face: string;
  tone: RecordDeadlineTone;
  /** Hover text; null = no tooltip. */
  tip: string | null;
}

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
  /** A free-text note: an icon on line 1 (tooltip) and the status popover's footer. */
  note: { text: string; label: string } | null;
  status: RecordCardDeadline;
  /** Every line; [0] is the lead (the adapter puts alert lines first). */
  lines: readonly RecordCardLine[];
  /** Folded-row hint for hidden alert lines ("2 more out of stock"). */
  hiddenAlertLabel: (count: number) => string;
}
