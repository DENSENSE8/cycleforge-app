/** Kiosk device-principal auth context, handed to route handlers by `withKioskAuth`. */
export interface KioskAuthContext {
  /** Active tenant id — read FROM the device row, never trusted from the request. */
  organizationId: string;
  /** Discriminates a device principal from a staff `AuthContext`. */
  principal: 'kiosk';
  /** `kiosk_devices.id` of the enrolled tablet making the request. */
  deviceId: number;
  /** Operator-facing tablet label, for audit `via` context. */
  deviceLabel: string;
  /** Mirror of `AuthContext.markAuditWritten` — opt out of any wrapper audit floor. */
  markAuditWritten: () => void;
}
