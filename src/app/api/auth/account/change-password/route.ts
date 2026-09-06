/**
 * POST /api/auth/account/change-password
 *
 * Self-service password change for the signed-in account. Requires the current
 * password when one is already set (proves possession, resists a hijacked
 * session silently rotating the credential); a PIN-only account with no password
 * yet may set one directly (it is already authenticated by session).
 *
 * Body: { currentPassword?, newPassword }
 * Auth: any authenticated staff (session cookie). No permission gate — you can
 *   only ever change YOUR OWN account (resolved from the session, never the body).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitAsync, clientIpOrNull } from '@/lib/api-guard';
import { resolveAccountIdForStaff, listMembershipsForAccount } from '@/lib/identity/memberships';
import { revokeAllSessionsForStaff } from '@/lib/auth/session';
import { audit } from '@/lib/auth/audit';
import { setAccountPassword } from '@/lib/identity/accounts';
import { verifyPassword, PasswordError } from '@/lib/identity/password';

export const runtime = 'nodejs';

const Body = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200),
});

export const POST = withAuth(async (req, ctx) => {
  // Trusted-hop client IP (api-guard): the leftmost x-forwarded-for hop is
  // caller-chosen, which made every IP-keyed throttle and audit row forgeable.
  const ip = clientIpOrNull(req.headers);
  const ua = req.headers.get('user-agent');

  const rl = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-change-password',
    scope: ctx.staffId,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec }, { status: 429 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const accountId = await resolveAccountIdForStaff(ctx.staffId);
  if (!accountId) {
    return NextResponse.json({ error: 'NO_ACCOUNT' }, { status: 404 });
  }

  const acc = await pool.query<{ password_hash: string | null }>(
    `SELECT password_hash FROM accounts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [accountId],
  );
  const row = acc.rows[0];
  if (!row) {
    return NextResponse.json({ error: 'NO_ACCOUNT' }, { status: 404 });
  }

  // If a password is already set, the caller must prove they know it.
  if (row.password_hash) {
    const ok = parsed.currentPassword
      ? await verifyPassword(parsed.currentPassword, row.password_hash)
      : false;
    if (!ok) {
      await audit({
        staffId: ctx.staffId, sid: ctx.session.sid,
        event: 'password.changed', result: 'denied', ip, userAgent: ua,
        detail: { reason: 'current_password_invalid' },
      });
      return NextResponse.json({ error: 'CURRENT_PASSWORD_INVALID' }, { status: 401 });
    }
  }

  try {
    await setAccountPassword(accountId, parsed.newPassword);
  } catch (err) {
    if (err instanceof PasswordError) {
      return NextResponse.json({ error: 'WEAK_PASSWORD', code: err.code }, { status: 400 });
    }
    throw err;
  }

  // Credential rotated → evict every OTHER session for this account (all orgs
  // it maps into), keeping the caller's own sid alive so a password change
  // doesn't sign you out of the device you're standing at.
  const memberships = await listMembershipsForAccount(accountId);
  let revoked = 0;
  for (const m of memberships) {
    revoked += await revokeAllSessionsForStaff(m.staff_id, { exceptSid: ctx.session.sid });
  }

  await audit({
    staffId: ctx.staffId, sid: ctx.session.sid,
    event: 'password.changed', result: 'ok', ip, userAgent: ua,
    detail: { accountId, siblingSessionsRevoked: revoked },
  });

  return NextResponse.json({ ok: true });
}, { allowAnonymous: false });
