/** One ACTIVE staff session, as `/settings/sessions` reads it. */

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
