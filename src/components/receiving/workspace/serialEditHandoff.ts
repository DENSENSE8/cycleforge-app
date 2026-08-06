/**
 * Cross-remount handoff for "Edit serial from a non-active accordion row".
 *
 * Controllers still call {@link takeSerialEditHandoff} after a line remount.
 * Collapsed PO meta no longer mounts a SerialChip edit menu (plain last-8 +
 * View All), so nothing stashes a target today — take always returns null until
 * an edit affordance is rewired.
 */
export interface PendingSerialEdit {
  id?: number;
  serial_number: string;
  condition_grade?: string | null;
}

/** Return and clear a pending edit for `lineId` — currently always null. */
export function takeSerialEditHandoff(_lineId: number): PendingSerialEdit | null {
  return null;
}
