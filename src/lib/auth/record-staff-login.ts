/**
 * Stamp `staff.last_login_at` for a sign-in and return the staff member's
 * landing inputs (role + admin-set homes) so a sign-in route can feed
 * `resolveLandingPath` without a second read. A missing staff row yields nulls.
 */

import { resolveLandingPath, withWelcomeHandoff } from '@/lib/auth/landing-path';

export interface StaffLoginQueryable {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface StaffLogin {
  role: string | null;
  defaultHomePath: string | null;
  defaultHomePathMobile: string | null;
}

export async function recordStaffLogin(
  queryable: StaffLoginQueryable,
  staffId: number,
): Promise<StaffLogin> {
  const result = await queryable.query(
    `UPDATE staff
        SET last_login_at = NOW()
      WHERE id = $1
     RETURNING role, default_home_path, default_home_path_mobile`,
    [staffId],
  );
  const row = result.rows[0];
  return {
    role: typeof row?.role === 'string' ? row.role : null,
    defaultHomePath: typeof row?.default_home_path === 'string' ? row.default_home_path : null,
    defaultHomePathMobile:
      typeof row?.default_home_path_mobile === 'string' ? row.default_home_path_mobile : null,
  };
}

/**
 * For server-redirect sign-ins: stamp the login, then resolve where the
 * redirect lands (`resolveLandingPath`) with the sign-in welcome handed to the
 * desktop shell as `?welcome=1` (mobile sign-ins land unchanged). Returns an
 * app-relative path.
 */
export async function recordStaffLoginRedirect(
  queryable: StaffLoginQueryable,
  staffId: number,
  opts: { next?: string | null; mobile: boolean },
): Promise<string> {
  const login = await recordStaffLogin(queryable, staffId);
  const landing = resolveLandingPath({
    next: opts.next,
    role: login.role,
    defaultHomePath: login.defaultHomePath,
    defaultHomePathMobile: login.defaultHomePathMobile,
    mobile: opts.mobile,
  });
  return opts.mobile ? landing : withWelcomeHandoff(landing);
}
