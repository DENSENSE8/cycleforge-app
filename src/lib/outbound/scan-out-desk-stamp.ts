/**
 * Scan-out timestamp + desk-selection source.
 *
 * Dock gun scans may backdate only as far as a plausible offline outbox
 * (one shift). The slot-table selection bar lets an operator name who scanned
 * the carton out and when — that window is longer, still bounded.
 */

export const SCAN_OUT_DOCK_MAX_BACKDATE_MS = 24 * 60 * 60 * 1000;
export const SCAN_OUT_DESK_MAX_BACKDATE_MS = 90 * 24 * 60 * 60 * 1000;
export const SCAN_OUT_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const SCAN_OUT_DESK_SOURCE = 'desk-selection';

export function scanOutMaxBackdateMs(source: unknown): number {
  return source === SCAN_OUT_DESK_SOURCE
    ? SCAN_OUT_DESK_MAX_BACKDATE_MS
    : SCAN_OUT_DOCK_MAX_BACKDATE_MS;
}

export function parseScanOutStaffId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/**
 * Accept a client timestamp, or drop it (caller uses server now).
 * Never in the future beyond clock skew; never older than `maxBackdateMs`.
 */
export function isScanOutCreatedAtInWindow(
  raw: unknown,
  nowMs: number,
  maxBackdateMs: number,
): boolean {
  if (raw == null || raw === '') return false;
  const ms = new Date(String(raw)).getTime();
  if (!Number.isFinite(ms)) return false;
  const age = nowMs - ms;
  if (age < -SCAN_OUT_MAX_CLOCK_SKEW_MS || age > maxBackdateMs) return false;
  return true;
}
