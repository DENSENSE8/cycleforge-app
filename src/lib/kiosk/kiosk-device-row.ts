/** One enrolled kiosk tablet, as the settings table reads it. */
export interface KioskDeviceTableRow {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAt: string | null;
  createdAt: string;
  enrolledByStaffId: number | null;
  /** Square Terminal paired to this lane; null = cash / payment-link only. */
  squareTerminalDeviceId: string | null;
}
