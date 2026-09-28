/** PIN hashing + verification + lockout. */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pool from '@/lib/db';
import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordStaffLogin } from '@/lib/auth/record-staff-login';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const N = 1 << 15; // 32 768 — ~32MB memory cost
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALTLEN = 16;
// node default maxmem ≈ 32MB, so we bump it; otherwise scrypt() throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
const MAXMEM = 128 * 1024 * 1024;

const MIN_PIN_LEN = 4;
const MAX_PIN_LEN = 12;

export class PinError extends Error {
  constructor(public readonly code: 'TOO_SHORT' | 'TOO_LONG' | 'NOT_NUMERIC' | 'NO_PIN' | 'WRONG' | 'NOT_FOUND' | 'WEAK_PIN' | 'PIN_ALREADY_SET' | 'LOCKED') {
    super(code);
    this.name = 'PinError';
  }
}

function assertPinShape(pin: string): void {
  if (pin.length < MIN_PIN_LEN) throw new PinError('TOO_SHORT');
  if (pin.length > MAX_PIN_LEN) throw new PinError('TOO_LONG');
  if (!/^\d+$/.test(pin))      throw new PinError('NOT_NUMERIC');
}

/**
 * Reject the most fat-finger-easy PINs (all same digit, straight ascending or
 * descending sequence). Not a substitute for scrypt hashing — just a
 * UX nudge during PIN creation. Returns true if the PIN is too obvious.
 */
export function isObviousPin(pin: string): boolean {
  if (pin.length < MIN_PIN_LEN) return false; // shape error takes priority
  if (/^(\d)\1+$/.test(pin)) return true;       // 0000, 1111, …
  let asc = true, desc = true;
  for (let i = 1; i < pin.length; i++) {
    const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

export async function hashPin(pin: string): Promise<string> {
  assertPinShape(pin);
  const salt = randomBytes(SALTLEN);
  const key = await scrypt(pin, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyHash(pin: string, stored: string): Promise<boolean> {
  // stored = scrypt$N$r$p$saltHex$keyHex
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N_ = Number(parts[1]);
  const R_ = Number(parts[2]);
  const P_ = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!Number.isFinite(N_) || !Number.isFinite(R_) || !Number.isFinite(P_)) return false;
  const got = await scrypt(pin, salt, expected.length, { N: N_, r: R_, p: P_, maxmem: MAXMEM });
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

/** Set or change a staff member's PIN. */
export async function setStaffPin(staffId: number, pin: string, orgId?: OrgId): Promise<void> {
  const pinHash = await hashPin(pin);
  if (orgId) {
    await tenantQuery(
      orgId,
      `UPDATE staff
         SET pin_hash = $2,
             pin_set_at = NOW(),
             pin_failed_count = 0,
             pin_locked_until = NULL
       WHERE id = $1
         AND organization_id = $3`,
      [staffId, pinHash, orgId],
    );
    return;
  }
  await pool.query(
    `UPDATE staff
       SET pin_hash = $2,
           pin_set_at = NOW(),
           pin_failed_count = 0,
           pin_locked_until = NULL
     WHERE id = $1`,
    [staffId, pinHash],
  );
}

/** Consecutive wrong PINs before the staff member's PIN is locked. */
export const PIN_MAX_FAILURES = 5;
/** Lock duration after PIN_MAX_FAILURES wrong PINs. */
export const PIN_LOCK_MINUTES = 15;

type StaffPinRow = {
  id: number;
  name: string;
  role: string;
  status: string;
  pin_hash: string | null;
  default_home_path: string | null;
  default_home_path_mobile: string | null;
};

/** Verified PIN row. */
export type VerifiedStaffPin = StaffPinRow;

export interface VerifyStaffPinOptions {
  /**
   * True only when this PIN check IS a sign-in (station sign-in, staff switch):
   * stamps `staff.last_login_at`. Step-up, PIN change, kiosk-device and
   * QR-authorize checks pass false so they never record a sign-in.
   */
  recordLogin: boolean;
}

/**
 * Look up by ID and verify PIN, with a per-staff lockout: PIN_MAX_FAILURES
 * consecutive wrong PINs lock the PIN for PIN_LOCK_MINUTES regardless of the
 * caller's IP (a lock that has expired restarts the count). While locked, even
 * the right PIN is refused with LOCKED. Each statement is one short round trip
 * — no pooled connection is held across the ~32 MB scrypt.
 *
 * `orgId` scopes every statement (staff has no RLS; the predicate is the guard).
 */
export async function verifyStaffPin(
  staffId: number,
  pin: string,
  orgId: OrgId | undefined,
  options: VerifyStaffPinOptions,
): Promise<VerifiedStaffPin> {
  assertPinShape(pin);
  // One-trip read; writes (rare: failures, counter reset, login stamp) take the transactional path.
  const read = <R extends Record<string, unknown>>(text: string, params: unknown[]) =>
    orgId ? tenantQueryOneTrip<R>(orgId, text, params) : pool.query<R>(text, params);
  const write = <R extends Record<string, unknown>>(text: string, params: unknown[]) =>
    orgId ? tenantQuery<R>(orgId, text, params) : pool.query<R>(text, params);
  const orgPredicate = orgId ? 'AND organization_id = $2' : '';
  const scopeParams = orgId ? [staffId, orgId] : [staffId];

  const result = await read<StaffPinRow & { locked: boolean; pin_failed_count: number }>(
    `SELECT id, name, role, status, pin_hash,
            default_home_path, default_home_path_mobile,
            COALESCE(pin_locked_until > now(), false) AS locked,
            pin_failed_count
       FROM staff
      WHERE id = $1 ${orgPredicate}
      LIMIT 1`,
    scopeParams,
  );
  const found = result.rows[0];
  if (!found) throw new PinError('NOT_FOUND');
  const { locked, pin_failed_count: failedCount, ...row } = found;
  if (!row.pin_hash) throw new PinError('NO_PIN');
  if (locked) throw new PinError('LOCKED');

  if (!(await verifyHash(pin, row.pin_hash))) {
    const n = scopeParams.length;
    const fail = await write<{ locked: boolean }>(
      `UPDATE staff
          SET pin_failed_count = CASE WHEN pin_locked_until <= now() THEN 1
                                      ELSE COALESCE(pin_failed_count, 0) + 1 END,
              pin_locked_until = CASE
                WHEN (CASE WHEN pin_locked_until <= now() THEN 1
                           ELSE COALESCE(pin_failed_count, 0) + 1 END) >= $${n + 1}
                THEN now() + make_interval(mins => $${n + 2}::int)
                ELSE pin_locked_until END
        WHERE id = $1 ${orgPredicate}
        RETURNING COALESCE(pin_locked_until > now(), false) AS locked`,
      [...scopeParams, PIN_MAX_FAILURES, PIN_LOCK_MINUTES],
    );
    throw new PinError(fail.rows[0]?.locked ? 'LOCKED' : 'WRONG');
  }

  if (failedCount > 0) {
    await write(
      `UPDATE staff SET pin_failed_count = 0, pin_locked_until = NULL WHERE id = $1 ${orgPredicate}`,
      scopeParams,
    );
  }
  if (options.recordLogin) {
    await recordStaffLogin({ query: (text, params) => write(text, params ?? []) }, staffId);
  }
  return row;
}
