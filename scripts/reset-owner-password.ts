/**
 * One-off: reset an account password (scrypt hash in accounts.password_hash).
 * Usage: npx tsx scripts/reset-owner-password.ts <email>
 * Prints JSON { email, password, verified } to stdout — capture for PW_OWNER_* env.
 */
import { randomBytes } from 'node:crypto';
import pool from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/identity/password';
import { getAccountByEmail } from '@/lib/identity/accounts';

async function main() {
  const email = (process.argv[2] || 'hi@usav.com').trim().toLowerCase();
  const password = `cf-usav-${randomBytes(12).toString('base64url')}`;

  const account = await getAccountByEmail(email);
  if (!account) throw new Error(`No account for ${email}`);

  const hash = await hashPassword(password);
  await pool.query(
    `UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [account.id, hash],
  );

  const stored = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM accounts WHERE id = $1`,
    [account.id],
  );
  const verified = await verifyPassword(password, stored.rows[0]?.password_hash ?? null);
  if (!verified) throw new Error('verify failed after update');

  console.log(JSON.stringify({ email, password, verified }));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});