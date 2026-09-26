/** POST /api/auth/password-reset/request (PUBLIC) */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimitAsync } from '@/lib/api-guard';
import { getAccountByEmail } from '@/lib/identity/accounts';
import { mintPasswordResetToken, buildPasswordResetLink } from '@/lib/auth/password-reset';
import { sendEmailBestEffort } from '@/lib/email/send';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().trim().toLowerCase().email() });

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

export async function POST(req: NextRequest) {
  // Per-IP throttle (burst protection).
  const ipLimited = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-password-reset-request',
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimited.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: ipLimited.retryAfterSec },
      { status: 429 },
    );
  }

  let email: string;
  try {
    email = Body.parse(await req.json()).email;
  } catch {
    // Even a malformed body should not reveal anything — but 400 is fine for shape.
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  // Per-email throttle (independent of IP) so an attacker can't spam one inbox.
  const emailLimited = await checkRateLimitAsync({
    headers: req.headers,
    routeKey: 'auth-password-reset-request-email',
    scope: email,
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });

  if (emailLimited.ok) {
    const account = await getAccountByEmail(email);
    if (account && account.status === 'active') {
      const ip = clientIp(req);
      const { token } = await mintPasswordResetToken({ accountId: account.id, ip });
      const link = buildPasswordResetLink(token);
      void sendEmailBestEffort({
        to: email,
        subject: 'Reset your password',
        text:
          `We received a request to reset your password.\n\n` +
          `Click to choose a new password (valid 30 minutes, one-time use):\n  ${link}\n\n` +
          `If you didn't request this, you can safely ignore this email — your password is unchanged.\n`,
      });
    }
  }

  // Constant response regardless of whether the email exists or was throttled.
  return NextResponse.json({ ok: true });
}
