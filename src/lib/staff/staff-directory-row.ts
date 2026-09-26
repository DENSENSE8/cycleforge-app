/** One TEAMMATE, as `/settings/staff` reads them. */

export interface StaffDirectoryRow {
  /** `staff.id` — the row key, the identity fact, and the write payload's target. */
  id: number;
  name: string;
  /** Primary role, mirrored from `staff_roles[0]`. Edited in Settings › Access. */
  role: string;
  /** `active` / `invited` / … — the lifecycle word, independent of {@link active}. */
  status: string;
  active: boolean;
  /** `pin_hash IS NOT NULL` — whether this teammate can sign in at a kiosk. */
  has_pin: boolean;
  /** WS6.1 per-staff auth policy: `'pin'` | `'password'`. */
  auth_method: string;
  /** WS6.1: require a password step-up before sensitive screens. */
  requires_sensitive_stepup: boolean;
  /** ISO instant, or null for a teammate who has never signed in. */
  last_login_at: string | null;
}

/** The two sign-in methods the policy write gate (`/api/admin/staff/update`) accepts. */
export const STAFF_AUTH_METHODS = ['pin', 'password'] as const;

export type StaffAuthMethod = (typeof STAFF_AUTH_METHODS)[number];

/** Enum → the operator's word. The retired `<option>` labels, verbatim. */
export const STAFF_AUTH_METHOD_LABEL: Readonly<Record<StaffAuthMethod, string>> = {
  pin: 'PIN',
  password: 'Password',
};

/** Coerce the stored string to the enum the API accepts. */
export function staffAuthMethod(value: string | null | undefined): StaffAuthMethod {
  return value === 'password' ? 'password' : 'pin';
}

/** What the state pill says when the row names no lifecycle status at all. */
const UNKNOWN_STATUS_LABEL = 'unknown';

/** The PILL's word — `status` overridden by `!active`, which is the derivation the retired `StatusPill` performed and the reason both… */
export function staffEffectiveStatusLabel(
  status: string | null | undefined,
  active: boolean | null | undefined,
): string {
  if (!active) return 'deactivated';
  const word = String(status ?? '').trim();
  return word || UNKNOWN_STATUS_LABEL;
}
