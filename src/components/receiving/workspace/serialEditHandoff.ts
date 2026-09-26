/** Cross-remount handoff for "Edit serial from a non-active accordion row". */
export interface PendingSerialEdit {
  id?: number;
  serial_number: string;
  condition_grade?: string | null;
}

/** Return and clear a pending edit for `lineId` — currently always null. */
export function takeSerialEditHandoff(_lineId: number): PendingSerialEdit | null {
  return null;
}
