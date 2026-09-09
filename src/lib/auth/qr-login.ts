import { createHash, randomBytes } from 'node:crypto';
import pool from '@/lib/db';

export const QR_LOGIN_TTL_SECONDS = 5 * 60; // 5 minutes

export interface QrLoginSessionRow {
  id: string;
  token_hash: string;
  status: 'pending' | 'authorized' | 'consumed' | 'expired';
  staff_id: number | null;
  organization_id: string | null;
  device_kind: string;
  persistent: boolean;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
  authorized_at: Date | null;
  consumed_at: Date | null;
}

export function hashQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Begins a new QR sign-in handshake session. */
export async function createQrLoginSession(opts: {
  ip?: string | null;
  userAgent?: string | null;
  persistent?: boolean;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateQrToken();
  const tokenHash = hashQrToken(token);
  const expiresAt = new Date(Date.now() + QR_LOGIN_TTL_SECONDS * 1000);

  await pool.query(
    `INSERT INTO qr_login_sessions (token_hash, status, persistent, ip, user_agent, expires_at)
     VALUES ($1, 'pending', $2, $3, $4, $5)`,
    [tokenHash, opts.persistent === true, opts.ip || null, opts.userAgent || null, expiresAt],
  );

  return { token, expiresAt };
}

/** Looks up the current state of a QR sign-in session. */
export async function getQrLoginSessionByToken(token: string): Promise<QrLoginSessionRow | null> {
  const tokenHash = hashQrToken(token);
  const res = await pool.query<QrLoginSessionRow>(
    `SELECT * FROM qr_login_sessions WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  const row = res.rows[0];
  if (!row) return null;

  if (row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`UPDATE qr_login_sessions SET status = 'expired' WHERE id = $1`, [row.id]);
    return { ...row, status: 'expired' };
  }

  return row;
}

/** Called by the mobile device after confirming Face ID / passkey / credentials. */
export async function authorizeQrLoginSession(
  token: string,
  staffId: number,
  orgId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const tokenHash = hashQrToken(token);
  const res = await pool.query<QrLoginSessionRow>(
    `SELECT * FROM qr_login_sessions WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  const row = res.rows[0];
  if (!row) return { ok: false, error: 'TOKEN_NOT_FOUND' };
  if (row.status !== 'pending') return { ok: false, error: `TOKEN_${row.status.toUpperCase()}` };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`UPDATE qr_login_sessions SET status = 'expired' WHERE id = $1`, [row.id]);
    return { ok: false, error: 'TOKEN_EXPIRED' };
  }

  await pool.query(
    `UPDATE qr_login_sessions
        SET status = 'authorized',
            staff_id = $1,
            organization_id = $2,
            authorized_at = NOW()
      WHERE id = $3`,
    [staffId, orgId || null, row.id],
  );

  return { ok: true };
}

/** Atomic claim by desktop polling: moves from 'authorized' to 'consumed'. */
export async function claimQrLoginSession(token: string): Promise<QrLoginSessionRow | null> {
  const tokenHash = hashQrToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<QrLoginSessionRow>(
      `SELECT * FROM qr_login_sessions
        WHERE token_hash = $1
          AND status = 'authorized'
          AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `UPDATE qr_login_sessions
          SET status = 'consumed',
              consumed_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
