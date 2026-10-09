/**
 * Remove from list for the Live feed cards no order owns — a box nothing links
 * (`link = 'package'`) or a dock scan that never matched a box (`scan`) —
 * stored in `live_feed_dismissals` with a reason, an optional note, who and
 * when; restorable. An ORDER card leaves the list through
 * `order_list_removals` (`src/lib/orders/list-removal.ts`) instead. Reason ids
 * are code-owned. Client-safe.
 */

export const UNLINKED_DISMISS_REASONS = [
  { id: 'not_ours', label: 'Not our package', hint: 'Scanned here, but it belongs to someone else' },
  { id: 'duplicate', label: 'Duplicate scan or box', hint: 'Another card already stands for it' },
  { id: 'voided_label', label: 'Voided label', hint: 'The label was voided; nothing ships on it' },
  { id: 'test_scan', label: 'Test scan', hint: 'A test or a mis-scan, not a package' },
  { id: 'shipped_unlinked', label: 'Shipped — no order to link', hint: 'It left; no order in the system to pair it to' },
  { id: 'other', label: 'Other', hint: 'Say why in the note' },
] as const;

export type UnlinkedDismissReason = (typeof UNLINKED_DISMISS_REASONS)[number]['id'];

export const UNLINKED_DISMISS_REASON_IDS = UNLINKED_DISMISS_REASONS.map((reason) => reason.id) as [
  UnlinkedDismissReason,
  ...UnlinkedDismissReason[],
];

/** `other` needs the note to say why. */
export const UNLINKED_DISMISS_NOTE_REQUIRED: Readonly<Record<string, true>> = { other: true };

export const UNLINKED_DISMISS_NOTE_MAX = 500;
