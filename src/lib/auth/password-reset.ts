/**
 * Account-based password reset tokens.
 *
 * One-time, expiring, HASHED tokens over the GLOBAL `accounts` identity (reset is
 * cross-org). The raw token lives only in the emailed URL; we persist sha256, so
 * a leaked DB row can't be replayed. Mirrors the email_login_tokens posture but
 * in a DEDICATED table (`password_reset_tokens`) — a reset token authorizes only
 * a password change, never a session mint.
 *
 * Storage: migration 2026-07-11b_password_reset_tokens.sql (UNAPPLIED).
 */

import { randomBytes, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import dbPool from '@/lib/db';

type Executor = Pool | PoolClient;

/** Lifetime of a password-reset link, in minutes. Short — reset is high-value. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** sha256 of a raw token — the value stored in `password_reset_tokens.token_hash`. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface MintedResetToken {
  /** Raw token — place ONLY in the emailed URL; never persisted in the clear. */
  token: string;
  expiresAt: Date;
}

/** Mint a single-use password-reset token for an account. */
export async function mintPasswordResetToken(
  args: { accountId: string; ip?: string | null },
  db: Executor = dbPool,
): Promise<MintedResetToken> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(token);
  const r = await db.query<{ expires_at: Date }>(
    `INSERT INTO password_reset_tokens (account_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, now() + make_interval(mins => $3), $4)
     RETURNING expires_at`,
    [args.accountId, tokenHash, PASSWORD_RESET_TTL_MINUTES, args.ip ?? null],
  );
  return { token, expiresAt: r.rows[0]!.expires_at };
}

/**
 * Atomically claim a reset token: marks it used and returns the owning account
 * id, but ONLY if it is unexpired and unused. A concurrent replay gets null (the
 * UPDATE … WHERE used_at IS NULL matches zero rows the second time). Returns null
 * for unknown/expired/already-used tokens — callers must not distinguish.
 */
export async function claimPasswordResetToken(
  token: string,
  db: Executor = dbPool,
): Promise<{ accountId: string } | null> {
  const tokenHash = hashResetToken(token);
  const r = await db.query<{ account_id: string }>(
    `UPDATE password_reset_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING account_id`,
    [tokenHash],
  );
  const row = r.rows[0];
  return row ? { accountId: row.account_id } : null;
}

/** Build the absolute URL an operator clicks to set a new password. */
export function buildPasswordResetLink(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.example.com';
  return `${base.replace(/\/$/, '')}/signin/reset?token=${token}`;
}
