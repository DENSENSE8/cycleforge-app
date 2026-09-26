/** POST /api/auth/email-login/request */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { sendEmailBestEffort } from '@/lib/email/send';
import { getAccountByEmail } from '@/lib/identity/accounts';
import { listMembershipsForAccount } from '@/lib/identity/memberships';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';

const Schema = z.object({ email: z.string().trim().toLowerCase().email() });

export const POST = withAuth(async (req: NextRequest) => {
  const limited = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-email-login',
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: limited.retryAfterSec },
      { status: 429 },
    );
  }

  let email: string;
  try {
    email = Schema.parse(await req.json()).email;
  } catch {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  // Account-based resolution (account_emails → accounts → memberships) — NOT a `staff WHERE email LIMIT 1` scan (which silently…
  const account = await getAccountByEmail(email);
  const memberships = account && account.status === 'active'
    ? await listMembershipsForAccount(account.id)
    : [];

  if (memberships.length > 0) {
    let target = memberships[0]!;
    const reqOrgId = await resolveOrgIdFromRequest(req);
    if (reqOrgId !== NIL_ORG_ID) {
      const match = memberships.find((m) => m.organization_id === reqOrgId);
      if (match) target = match;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO email_login_tokens (organization_id, staff_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '15 minutes')`,
      [target.organization_id, target.staff_id, tokenHash],
    );
    const base =
      process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.example.com';
    const link = `${base}/api/auth/email-login/verify?token=${token}`;
    void sendEmailBestEffort({
      to: email,
      subject: 'Your sign-in link',
      text:
        `Hi ${account?.displayName ?? 'there'},\n\n` +
        `Click to sign in (valid 15 minutes, one-time use):\n  ${link}\n\n` +
        `If you didn't request this, you can safely ignore this email.\n`,
    });
  }

  // Constant response regardless of whether the email exists.
  return NextResponse.json({ ok: true });
}, { allowAnonymous: true });
