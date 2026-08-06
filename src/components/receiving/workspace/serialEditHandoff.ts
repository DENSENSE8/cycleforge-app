/**
 * Cross-remount handoff for "Edit serial from a non-active accordion row".
 *
 * Controllers still call {@link takeSerialEditHandoff} after a line remount.
 * Collapsed PO meta opens the Units display for edit (serial preview button);
 * take returns null unless a future affordance stashes a target.
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
