/**
 * One ACTIVE staff session, as `/settings/sessions` reads it.
 *
 * Snake_case on purpose: `GET /api/admin/sessions` returns the SQL row
 * verbatim (`route.ts` selects `s.sid, st.name AS staff_name, …`), so a
 * camelCase mirror here would be a mapping layer that exists only to be kept
 * in sync. The catalog's `paths` name these keys.
 *
 * `created_at` / `expires_at` are fetched by the route and NOT painted — the
 * desk has never shown them, and the slot port is not the place to invent a
 * column. They stay off this type's painted surface as documented non-goals;
 * a later session that wants "signed in at" adds a catalog field, not a cell.
 */

export interface AuthSessionTableRow {
  /** Opaque session id — the row key and the identity fact. */
  sid: string;
  staff_id: number;
  /** Joined `staff.name` — never paint `Staff #id`. */
  staff_name: string;
  /** `web` / `kiosk` / `mobile` … — the enum the desk painted as a pill. */
  device_kind: string;
  /** Operator-set device nickname; null on an unnamed browser. */
  device_label: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}
