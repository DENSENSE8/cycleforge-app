import { createHash, randomBytes } from 'node:crypto';
import pool from '@/lib/db';
import {
  formatHandoffDisplayCode,
  HANDOFF_SHORT_CODE_ALPHABET,
  parseHandoffDisplayCode,
} from '@/lib/auth/qr-handoff-code';

/**
 * GateGuard: callers = /api/auth/qr/* routes, SignInQrPanel, PhoneHandoffQrDialog,
 * /m/claim. Schema: qr_login_sessions (+ flow, short_code). User: implement B
 * desk→phone session handoff.
 */

export const QR_LOGIN_TTL_SECONDS = 5 * 60; // 5 minutes

export {
  formatHandoffDisplayCode,
  parseHandoffDisplayCode,
} from '@/lib/auth/qr-handoff-code';

/** phone_to_desk = existing desk QR / phone authorizes. desk_to_phone = B handoff. */
export type QrLoginFlow = 'phone_to_desk' | 'desk_to_phone';

export interface QrLoginSessionRow {
  id: string;
  token_hash: string;
  status: 'pending' | 'authorized' | 'consumed' | 'expired';
  flow: QrLoginFlow;
  short_code: string | null;
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

/** Four-char human code shown on desk + typed on phone (no prefix). */
export function generateHandoffShortCode(): string {
  const bytes = randomBytes(4);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += HANDOFF_SHORT_CODE_ALPHABET[bytes[i]! % HANDOFF_SHORT_CODE_ALPHABET.length]!;
  }
  return out;
}
/** Begins a new phone→desk QR sign-in handshake session. */
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

/**
 * Desk (already signed in) mints a one-time handoff for the phone to claim.
 * Staff/org are stamped at mint time; status stays pending until claim.
 */
export async function createDeskToPhoneHandoff(opts: {
  staffId: number;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
  persistent?: boolean;
}): Promise<{ token: string; shortCode: string; displayCode: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + QR_LOGIN_TTL_SECONDS * 1000);
  const persistent = opts.persistent !== false;

  for (let attempt = 0; attempt < 8; attempt++) {
    const token = generateQrToken();
    const tokenHash = hashQrToken(token);
    const shortCode = generateHandoffShortCode();
    try {
      await pool.query(
        `INSERT INTO qr_login_sessions (
           token_hash, status, flow, short_code, staff_id, organization_id,
           device_kind, persistent, ip, user_agent, expires_at, authorized_at
         ) VALUES (
           $1, 'pending', 'desk_to_phone', $2, $3, $4,
           'phone', $5, $6, $7, $8, NOW()
         )`,
        [
          tokenHash,
          shortCode,
          opts.staffId,
          opts.organizationId,
          persistent,
          opts.ip || null,
          opts.userAgent || null,
          expiresAt,
        ],
      );
      return {
        token,
        shortCode,
        displayCode: formatHandoffDisplayCode(shortCode),
        expiresAt,
      };
    } catch (err) {
      const code = (err as { code?: string }).code;
      // unique_violation on short_code — retry with a fresh code
      if (code === '23505') continue;
      throw err;
    }
  }
  throw new Error('HANDOFF_SHORT_CODE_EXHAUSTED');
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

/** Called by the mobile device after the signed-in phone session (or PIN fallback) authorizes the desk. */
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
  if ((row.flow ?? 'phone_to_desk') === 'desk_to_phone') {
    return { ok: false, error: 'WRONG_FLOW' };
  }
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
          AND COALESCE(flow, 'phone_to_desk') = 'phone_to_desk'
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

/**
 * Phone claims a desk→phone handoff: pending + desk_to_phone + staff set → consumed.
 * Returns the row so the caller can mint a phone session.
 */
export async function claimDeskToPhoneHandoff(token: string): Promise<QrLoginSessionRow | null> {
  const tokenHash = hashQrToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<QrLoginSessionRow>(
      `SELECT * FROM qr_login_sessions
        WHERE token_hash = $1
          AND status = 'pending'
          AND flow = 'desk_to_phone'
          AND staff_id IS NOT NULL
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

/** Lookup + claim by human 4-char short code (typed on phone). */
export async function getQrLoginSessionByShortCode(
  shortCodeRaw: string,
): Promise<QrLoginSessionRow | null> {
  const shortCode = parseHandoffDisplayCode(shortCodeRaw);
  if (!shortCode) return null;

  const res = await pool.query<QrLoginSessionRow>(
    `SELECT * FROM qr_login_sessions
      WHERE short_code = $1
        AND flow = 'desk_to_phone'
      ORDER BY created_at DESC
      LIMIT 1`,
    [shortCode],
  );
  const row = res.rows[0];
  if (!row) return null;

  if (row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`UPDATE qr_login_sessions SET status = 'expired' WHERE id = $1`, [row.id]);
    return { ...row, status: 'expired' };
  }

  return row;
}

export async function claimDeskToPhoneHandoffByShortCode(
  shortCodeRaw: string,
): Promise<QrLoginSessionRow | null> {
  const shortCode = parseHandoffDisplayCode(shortCodeRaw);
  if (!shortCode) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<QrLoginSessionRow>(
      `SELECT * FROM qr_login_sessions
        WHERE short_code = $1
          AND status = 'pending'
          AND flow = 'desk_to_phone'
          AND staff_id IS NOT NULL
          AND expires_at > NOW()
        FOR UPDATE`,
      [shortCode],
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
