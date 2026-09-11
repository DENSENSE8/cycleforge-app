/** One enrolled kiosk tablet, as the settings table reads it. */

export type KioskHardwareStatus = 'ok' | 'stale' | 'offline' | 'no_reader';

export interface KioskDeviceTableRow {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAt: string | null;
  createdAt: string;
  enrolledByStaffId: number | null;
  /** Joined staff.name for enrolled_by — never paint Staff #id. */
  enrolledByName: string | null;
  /** Square Terminal paired to this lane; null = cash / payment-link only. */
  squareTerminalDeviceId: string | null;
  /** Derived: seconds since last_seen_at (null when never seen). */
  dwellSeconds: number | null;
  /** Derived: freshness + reader presence for the status track. */
  hardwareStatus: KioskHardwareStatus;
}
