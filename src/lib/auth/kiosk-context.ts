/**
 * Kiosk device-principal auth context, handed to route handlers by
 * `withKioskAuth`. A leaf module (no imports) so lower-level helpers can
 * reference the type without pulling in `withKioskAuth` and forming a cycle —
 * same shape rationale as `auth-context.ts` for the staff `AuthContext`.
 *
 * A kiosk request is NEVER a person: there is no `staffId`. The principal is
 * the enrolled tablet (`deviceId`), scoped to exactly one org. Staff identity
 * only appears transiently via PIN step-up on a privileged action (see
 * `resolveKioskStepUp`), and that stepped-up `staffId` is threaded into the
 * audit row, never onto this context.
 */
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
