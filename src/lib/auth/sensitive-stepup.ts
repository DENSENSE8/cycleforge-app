/** Sensitive-information wall (WS6.1). */

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasStepUp } from './stepup';
import type { AuthContext } from './auth-context';

/** Canonical scope name for the sensitive-information wall step-up grant. */
const SENSITIVE_STEPUP_SCOPE = 'sensitive';

/**
 * Whether this staff member is subject to the sensitive wall. Returns false on
 * any error (missing column / row) so behavior is unchanged pre-migration.
 */
async function staffRequiresSensitiveStepUp(staffId: number): Promise<boolean> {
  try {
    const r = await pool.query<{ requires: boolean }>(
      `SELECT COALESCE(requires_sensitive_stepup, false) AS requires
         FROM staff WHERE id = $1 LIMIT 1`,
      [staffId],
    );
    return r.rows[0]?.requires === true;
  } catch {
    return false;
  }
}

/**
 * Guard for a sensitive route. Returns a 403 `STEP_UP_REQUIRED` response when
 * the caller is walled and lacks a live step-up grant in `scope`; otherwise
 * returns `null` (proceed).
 */
export async function requireSensitiveStepUp(
  ctx: AuthContext,
  scope: string = SENSITIVE_STEPUP_SCOPE,
): Promise<NextResponse | null> {
  const required = await staffRequiresSensitiveStepUp(ctx.staffId);
  if (!required) return null;

  const granted = await hasStepUp(ctx.session.sid, scope);
  if (granted) return null;

  return NextResponse.json(
    { error: 'STEP_UP_REQUIRED', scope, method_hint: 'pin' },
    { status: 403 },
  );
}
