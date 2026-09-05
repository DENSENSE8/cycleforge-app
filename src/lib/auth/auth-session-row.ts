/** One active sign-in session, as the settings table reads it. */
export interface AuthSessionRow {
  sid: string;
  staff_id: number;
  staff_name: string;
  device_kind: string;
  device_label: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}
