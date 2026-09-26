/** WS6.3 — email verification tokens. */

import { randomBytes, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import dbPool from '@/lib/db';

type Executor = Pool | PoolClient;

/** Lifetime of an email-verification link, in minutes (matches F1 login tokens). */
export const EMAIL_VERIFY_TTL_MINUTES = 15;

interface MintedVerificationToken {
  /** Raw token — place ONLY in the emailed URL; never persisted in the clear. */
  token: string;
  expiresAt: Date;
}

/** sha256 of a raw token — the value stored in `email_login_tokens.token_hash`. */
export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a single-use email-verification token for a staff/org. Reuses
 * `email_login_tokens`. Pass the signup transaction client to mint inside the
 * signup tx, or omit `db` to use the pool.
 */
export async function mintEmailVerificationToken(
  args: { organizationId: string; staffId: number },
  db: Executor = dbPool,
): Promise<MintedVerificationToken> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashVerificationToken(token);
  const r = await db.query<{ expires_at: Date }>(
    `INSERT INTO email_login_tokens (organization_id, staff_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     RETURNING expires_at`,
    [args.organizationId, args.staffId, tokenHash, EMAIL_VERIFY_TTL_MINUTES],
  );
  return { token, expiresAt: r.rows[0]!.expires_at };
}

/** Absolute URL for the verify-email endpoint, embedding the raw token. */
export function buildVerifyEmailLink(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.example.com';
  return `${base.replace(/\/$/, '')}/api/auth/verify-email?token=${token}`;
}
