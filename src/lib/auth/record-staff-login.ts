/**
 * Stamp `staff.last_login_at` and report whether this is the staff member's
 * first sign-in of the PST calendar day (America/Los_Angeles).
 *
 * The previous timestamp is read and overwritten in ONE statement — once the
 * UPDATE lands the prior value is gone, so the comparison cannot happen later.
 * First-of-day is true when there was no previous sign-in, or its PST date is
 * before today's PST date. A missing staff row yields `false`.
 */

export interface StaffLoginQueryable {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export async function recordStaffLogin(
  queryable: StaffLoginQueryable,
  staffId: number,
): Promise<{ firstSigninToday: boolean }> {
  const result = await queryable.query(
    `WITH prev AS (
       SELECT last_login_at FROM staff WHERE id = $1
     )
     UPDATE staff s
        SET last_login_at = NOW()
       FROM prev
      WHERE s.id = $1
     RETURNING (
       prev.last_login_at IS NULL
       OR (prev.last_login_at AT TIME ZONE 'America/Los_Angeles')::date
          < (NOW() AT TIME ZONE 'America/Los_Angeles')::date
     ) AS first_today`,
    [staffId],
  );
  return { firstSigninToday: result.rows[0]?.first_today === true };
}
