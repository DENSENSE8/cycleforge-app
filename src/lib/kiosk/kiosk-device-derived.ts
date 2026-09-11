/**
 * Derived fleet freshness for one enrolled kiosk tablet.
 *
 * Dwell and hardware_status are read-time signals — not DDL columns. Callers:
 * listKioskDevices (API waist) and unit tests. Thresholds match the fleet SoT
 * (15m stale / 24h offline).
 */

import type {
  KioskDeviceTableRow,
  KioskHardwareStatus,
} from '@/lib/kiosk/kiosk-device-row';

export type { KioskHardwareStatus };

const STALE_AFTER_SEC = 15 * 60;
const OFFLINE_AFTER_SEC = 24 * 60 * 60;

/** Seconds since last_seen_at, or null when the heartbeat is missing / invalid. */
export function dwellSecondsFromLastSeen(
  lastSeenAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!lastSeenAt) return null;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

/**
 * Compact dwell face for Dates tip / status track — `45s` · `12m` · `6h` · `8d`.
 */
export function formatDwellFace(dwellSeconds: number | null | undefined): string | null {
  if (dwellSeconds == null || dwellSeconds < 0) return null;
  if (dwellSeconds < 60) return `${dwellSeconds}s`;
  if (dwellSeconds < 3600) return `${Math.floor(dwellSeconds / 60)}m`;
  if (dwellSeconds < 86400) return `${Math.floor(dwellSeconds / 3600)}h`;
  return `${Math.floor(dwellSeconds / 86400)}d`;
}

const HARDWARE_LABEL: Record<KioskHardwareStatus, string> = {
  ok: 'OK',
  stale: 'Stale',
  offline: 'Offline',
  no_reader: 'No reader',
};

export function hardwareStatusLabel(status: KioskHardwareStatus): string {
  return HARDWARE_LABEL[status];
}

/**
 * Freshness + reader presence for an active tablet. Revoked / awaiting stay
 * `offline` so the status track still paints a signal without inventing a
 * pairing-state fork.
 */
export function deriveHardwareStatus(input: {
  status: KioskDeviceTableRow['status'];
  dwellSeconds: number | null;
  squareTerminalDeviceId: string | null;
}): KioskHardwareStatus {
  if (input.status !== 'active') return 'offline';
  const dwell = input.dwellSeconds;
  if (dwell == null || dwell > OFFLINE_AFTER_SEC) return 'offline';
  if (dwell > STALE_AFTER_SEC) return 'stale';
  if (!String(input.squareTerminalDeviceId ?? '').trim()) return 'no_reader';
  return 'ok';
}

/** Attach derived fields to a raw list row (API / adapter waist). */
export function withKioskDeviceDerived<
  T extends {
    status: KioskDeviceTableRow['status'];
    lastSeenAt: string | null;
    squareTerminalDeviceId: string | null;
  },
>(row: T, nowMs: number = Date.now()): T & {
  dwellSeconds: number | null;
  hardwareStatus: KioskHardwareStatus;
} {
  const dwellSeconds = dwellSecondsFromLastSeen(row.lastSeenAt, nowMs);
  return {
    ...row,
    dwellSeconds,
    hardwareStatus: deriveHardwareStatus({
      status: row.status,
      dwellSeconds,
      squareTerminalDeviceId: row.squareTerminalDeviceId,
    }),
  };
}
