/**
 * Live feed flags — a staffer marks ANY card (an order, a box no order owns,
 * an unmatched dock scan) with a reason, an optional note, who and when
 * (`live_feed_flags`). Several reasons may be active on one card. The reason
 * ids are code-owned: stored as-is, never renamed in place. Client-safe.
 */

import type { PackageLink } from '@/lib/live-feed/types';

export type LiveFeedFlagTone = 'danger' | 'warning' | 'info';

export interface LiveFeedFlagReason {
  id: string;
  label: string;
  hint: string;
  tone: LiveFeedFlagTone;
  /** The cards it makes sense on; absent = every card. */
  links?: readonly PackageLink[];
}

export const LIVE_FEED_FLAG_REASONS = [
  { id: 'damaged', label: 'Damaged', hint: 'Unit or packaging is damaged', tone: 'danger' },
  { id: 'wrong_item', label: 'Wrong item', hint: 'What is in hand is not what was ordered', tone: 'danger' },
  { id: 'missing_item', label: 'Missing item or part', hint: 'Short a unit, an accessory or a part', tone: 'danger' },
  { id: 'label_problem', label: 'Label problem', hint: 'Wrong, voided, duplicate or unreadable label', tone: 'danger' },
  { id: 'address_issue', label: 'Address issue', hint: 'Undeliverable or suspicious ship-to', tone: 'warning' },
  { id: 'paperwork_missing', label: 'Paperwork missing', hint: 'Slip, manual or insert is not in the box', tone: 'warning' },
  { id: 'hold', label: 'Hold — do not ship', hint: 'Stop it here until someone clears the flag', tone: 'warning' },
  { id: 'awaiting_customer', label: 'Waiting on customer', hint: 'Blocked on a buyer reply', tone: 'warning' },
  { id: 'carrier_issue', label: 'Carrier issue', hint: 'Missed pickup, rejected, or no carrier scan', tone: 'warning' },
  {
    id: 'unknown_package',
    label: 'Unknown package',
    hint: 'No order owns it — find out whose it is',
    tone: 'warning',
    links: ['package', 'scan'],
  },
  { id: 'duplicate', label: 'Duplicate', hint: 'The same box or scan shows twice', tone: 'info' },
  { id: 'rush', label: 'Rush', hint: 'Pull it ahead of its ship-by', tone: 'info', links: ['order'] },
  { id: 'other', label: 'Other', hint: 'Say why in the note', tone: 'info' },
] as const satisfies readonly LiveFeedFlagReason[];

export type LiveFeedFlagReasonId = (typeof LIVE_FEED_FLAG_REASONS)[number]['id'];

export const LIVE_FEED_FLAG_REASON_IDS = LIVE_FEED_FLAG_REASONS.map((reason) => reason.id) as [
  LiveFeedFlagReasonId,
  ...LiveFeedFlagReasonId[],
];

/** `other` needs the note to say why. */
export const LIVE_FEED_FLAG_NOTE_REQUIRED: Readonly<Record<string, true>> = { other: true };

export const LIVE_FEED_FLAG_NOTE_MAX = 500;

/** One active flag on a card, as the board reads it. */
export interface LiveFeedFlag {
  reason: string;
  note: string | null;
  byStaffId: number | null;
  by: string | null;
  /** ISO instant. */
  at: string;
}

const BY_ID: Record<string, LiveFeedFlagReason> = Object.fromEntries(LIVE_FEED_FLAG_REASONS.map((reason) => [reason.id, reason]));

/** A stored reason's presentation; an id the catalog no longer knows keeps its own text. */
export function liveFeedFlagReason(id: string): LiveFeedFlagReason {
  return BY_ID[id] ?? { id, label: id, hint: '', tone: 'info' };
}

/** The reasons offered for a selection: those that fit every selected card's link. */
export function liveFeedFlagReasonsFor(links: readonly PackageLink[]): LiveFeedFlagReason[] {
  return LIVE_FEED_FLAG_REASONS.filter((reason) => {
    const fits: readonly PackageLink[] | undefined = 'links' in reason ? reason.links : undefined;
    return !fits || links.every((link) => fits.includes(link));
  });
}
