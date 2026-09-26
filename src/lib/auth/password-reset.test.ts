/** Password-reset token tests. */

import 'dotenv/config';
import { test } from 'node:test';
import { strictEqual, notStrictEqual, ok } from 'node:assert';
import { createHash } from 'node:crypto';
import { hashResetToken } from '@/lib/auth/password-reset';

const HAS_DB = !!process.env.DATABASE_URL;

test('hashResetToken is sha256(token), deterministic, and not the raw token', () => {
  const token = 'abc123-not-a-real-token';
  const h = hashResetToken(token);
  strictEqual(h, createHash('sha256').update(token).digest('hex'), 'must be sha256 hex');
  strictEqual(h, hashResetToken(token), 'deterministic');
  notStrictEqual(h, token, 'stored hash must differ from the raw token');
  strictEqual(h.length, 64, 'sha256 hex is 64 chars');
});

test('mint → claim is single-use; a replay returns null', { skip: !HAS_DB }, async (t) => {
  const { default: pool } = await import('@/lib/db');
  const { mintPasswordResetToken, claimPasswordResetToken } = await import('@/lib/auth/password-reset');
  // The migration (2026-07-11b) is authored-but-unapplied; skip gracefully until it lands.
  const exists = await pool.query(`SELECT to_regclass('public.password_reset_tokens') AS t`);
  if (!(exists.rows[0] as { t: string | null }).t) {
    t.skip('password_reset_tokens table not migrated yet');
    return;
  }
  // Seed a throwaway account (global identity table; no org needed).
  const acc = await pool.query<{ id: string }>(
    `INSERT INTO accounts (display_name, status) VALUES ('pwreset-test', 'active') RETURNING id`,
  );
  const accountId = acc.rows[0]!.id;
  try {
    const { token } = await mintPasswordResetToken({ accountId, ip: '127.0.0.1' });
    const first = await claimPasswordResetToken(token);
    ok(first && first.accountId === accountId, 'first claim resolves the account');
    const second = await claimPasswordResetToken(token);
    strictEqual(second, null, 'a replay of a used token must not claim');
    strictEqual(await claimPasswordResetToken('never-minted-token'), null, 'unknown token → null');
  } finally {
    await pool.query(`DELETE FROM password_reset_tokens WHERE account_id = $1`, [accountId]);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
  }
});
