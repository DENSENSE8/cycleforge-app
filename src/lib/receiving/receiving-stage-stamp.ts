/**
 * Receiving lifecycle axis + the row's stage stamp (Scanned / Unboxed /
 * Received / Tested instant and who did it) — shared by the desk receiving
 * table and the phone receiving rows, so it lives in logic, not a component dir.
 */

/** Lifecycle timestamp the receiving table day-bands + within-day order by. */
export type ReceivingActivityAxis = 'scanned' | 'unboxed' | 'received' | 'tested';

/** Stage stamp shown in the receiving history meta subrow (Unbox / Triage / Done / Testing). */
type ReceivingRowStageStamp = {
  instant: string;
  label: 'Scanned' | 'Unboxed' | 'Received' | 'Tested';
  staffName: string | null;
};

type ReceivingStageStampRow = {
  scanned_at?: string | null;
  received_at?: string | null;
  unboxed_at?: string | null;
  unbox_opened_at?: string | null;
  received_done_at?: string | null;
  tested_at?: string | null;
  scanned_by_name?: string | null;
  received_by_name?: string | null;
  unboxed_by_name?: string | null;
};

/** Which lifecycle instant owns the dense row clock for the active history axis. */
export function resolveReceivingRowStageStamp(
  row: ReceivingStageStampRow,
  axis: ReceivingActivityAxis,
): ReceivingRowStageStamp | null {
  if (axis === 'tested') {
    const tested = (row.tested_at || '').trim();
    if (tested) {
      return { instant: tested, label: 'Tested', staffName: null };
    }
    // Pending / not-yet-tested: fall through to unboxed clock.
    const unboxed = (row.unboxed_at || '').trim();
    if (unboxed) {
      return {
        instant: unboxed,
        label: 'Unboxed',
        staffName: (row.unboxed_by_name || '').trim() || null,
      };
    }
    return null;
  }
  if (axis === 'unboxed') {
    const opened = (row.unbox_opened_at || '').trim();
    if (opened) {
      return {
        instant: opened,
        label: 'Unboxed',
        staffName: (row.unboxed_by_name || '').trim() || null,
      };
    }
    const instant = (row.unboxed_at || '').trim();
    if (instant) {
      return {
        instant,
        label: 'Unboxed',
        staffName: (row.unboxed_by_name || '').trim() || null,
      };
    }
    const scanned = (row.scanned_at || '').trim();
    if (scanned) {
      return {
        instant: scanned,
        label: 'Scanned',
        staffName: (row.scanned_by_name || '').trim() || null,
      };
    }
    const received = (row.received_at || '').trim();
    if (!received) return null;
    return {
      instant: received,
      label: 'Scanned',
      staffName:
        (row.scanned_by_name || '').trim() ||
        (row.received_by_name || '').trim() ||
        null,
    };
  }
  if (axis === 'received') {
    const done = String(row.received_done_at ?? '').trim();
    if (done) {
      return { instant: done, label: 'Received', staffName: null };
    }
    const unboxed = (row.unboxed_at || '').trim();
    if (!unboxed) return null;
    return {
      instant: unboxed,
      label: 'Unboxed',
      staffName: (row.unboxed_by_name || '').trim() || null,
    };
  }
  const scanned = (row.scanned_at || '').trim();
  if (scanned) {
    return {
      instant: scanned,
      label: 'Scanned',
      staffName: (row.scanned_by_name || '').trim() || null,
    };
  }
  const received = (row.received_at || '').trim();
  if (!received) return null;
  return {
    instant: received,
    label: 'Scanned',
    staffName:
      (row.scanned_by_name || '').trim() ||
      (row.received_by_name || '').trim() ||
      null,
  };
}
