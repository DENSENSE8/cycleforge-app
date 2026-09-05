/** One teammate, as Settings → Team reads them. */
export interface StaffDirectoryRow {
  id: number;
  name: string;
  role: string;
  status: string;
  active: boolean;
  has_pin: boolean;
  last_login_at: string | null;
  default_home_path: string | null;
  color_hex: string;
  /** WS6.1 per-staff auth policy: `'pin' | 'password'`. */
  auth_method: string;
  requires_sensitive_stepup: boolean;
}
