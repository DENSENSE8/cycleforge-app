/** Per-staff sign-in policy (WS6.1). */

import pool from '@/lib/db';

type StaffAuthMethod = 'pin' | 'password';

/**
 * Resolve a staff member's sign-in method. Defaults to 'pin' on any error
 * (missing column / missing row) so behavior is unchanged pre-migration.
 */
export async function getStaffAuthMethod(staffId: number): Promise<StaffAuthMethod> {
  try {
    const r = await pool.query<{ auth_method: string | null }>(
      `SELECT auth_method FROM staff WHERE id = $1 LIMIT 1`,
      [staffId],
    );
    const v = (r.rows[0]?.auth_method ?? 'pin').toLowerCase();
    return v === 'password' ? 'password' : 'pin';
  } catch {
    return 'pin';
  }
}
