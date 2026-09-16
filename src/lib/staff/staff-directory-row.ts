/**
 * One TEAMMATE, as `/settings/staff` reads them.
 *
 * Snake_case on purpose: the page's own `SELECT` and `GET
 * /api/admin/staff/list` both return the SQL row verbatim, so a camelCase
 * mirror here would be a mapping layer that exists only to be kept in sync.
 * The catalog's `paths` name these keys.
 *
 * ## Fetched and NOT painted — documented non-goals
 *
 * The desk's query also selects `default_home_path` and `color_hex`.
 *
 * `default_home_path` was never painted by any of the seven retired cells and
 * the slot port is not the place to invent a column; it stays off this type.
 *
 * `color_hex` is the more interesting one, because the retired Name cell DID
 * paint it — a 2×2 dot before the name, `style={{ background: s.color_hex }}`.
 * It is not a column here, and it does not need to be: the staff colour is a
 * property of the STAFFER, not of this feed, and every other surface in the app
 * resolves it from the staff identity cache (`@/utils/staff-colors`) keyed on
 * the staff id. So `STAFF_DIRECTORY_FIELD_CATALOG` declares the teammate as a
 * `person` fact carrying `{ staffId, name }`, the shared slot cell paints it
 * with `StaffAvatar`, and the avatar fills itself with that staffer's colour
 * (and their photo, which the dot never had). A `color_hex` column crossing
 * this boundary would be a second source for a fact the app resolves once.
 *
 * ## Two facts, one pill
 *
 * `status` and `active` are independent columns that the retired `<StatusPill
 * status active>` merged into one word: an inactive staffer read `deactivated`
 * whatever their `status` said. Both stay separate facts here so each sorts and
 * searches on its own; the MERGE is the adapter's
 * ({@link staffEffectiveStatusLabel}), which is where a derived face belongs.
 */

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

/**
 * Coerce the stored string to the enum the API accepts.
 *
 * The column is a plain `text` and the migration that introduced it may not
 * have run (the page reads it through `to_jsonb` with a `'pin'` default), so
 * anything that is not `password` is a PIN — which is exactly what the retired
 * `<select value={row.auth_method === 'password' ? 'password' : 'pin'}>` did.
 * Three callers need that coercion in lockstep: the resolver that paints the
 * READ fact, the policy plane that seeds its control, and the label map above.
 */
export function staffAuthMethod(value: string | null | undefined): StaffAuthMethod {
  return value === 'password' ? 'password' : 'pin';
}

/** What the state pill says when the row names no lifecycle status at all. */
const UNKNOWN_STATUS_LABEL = 'unknown';

/**
 * The PILL's word — `status` overridden by `!active`, which is the derivation
 * the retired `StatusPill` performed and the reason both columns are facts.
 *
 * Lower-case on purpose: `active` / `invited` are the words the retired pill
 * printed and the words stored in the column, so the pill, the sort and the
 * search box all read the same string.
 */
export function staffEffectiveStatusLabel(
  status: string | null | undefined,
  active: boolean | null | undefined,
): string {
  if (!active) return 'deactivated';
  const word = String(status ?? '').trim();
  return word || UNKNOWN_STATUS_LABEL;
}
