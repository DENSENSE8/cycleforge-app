/**
 * PIN hashing + verification + lockout.
 *
 * scrypt over argon2id because we don't want a native module: this code runs
 * in Next.js API routes (Node runtime) and node:crypto.scrypt is always there.
 * scrypt with the params below takes ~80–120ms on a modern laptop — fast
 * enough for an interactive sign-in, slow enough to slow down a leaked-DB
 * offline attack to "many lifetimes" for any 6-digit PIN.
 *
 * Storage format (single text column `staff.pin_hash`):
 *   scrypt$N$r$p$saltHex$keyHex
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

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

/** Consecutive wrong PINs tolerated before `pin_locked_until` is armed. */
const MAX_PIN_ATTEMPTS = 5;
/** How long a locked PIN stays refused, in minutes. */
const PIN_LOCKOUT_MINUTES = 15;

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

/**
 * Set or change a staff member's PIN. Caller is responsible for authz
 * (admin reset vs self-change). Clears lockout state on success.
 *
 * Tenant scope: when `orgId` is supplied (admin CRUD under
 * `admin.manage_staff`), the UPDATE is scoped to that org via `tenantQuery`,
 * so an admin can only set the PIN of a staff member in their OWN org — a
 * cross-org id is a no-op. When omitted (sign-in / enrollment / self-change
 * flows that have already resolved the staff id), the path is byte-identical
 * to before. `staff` is tenant-owned and carries `organization_id`.
 */
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

interface StaffPinRow {
  id: number;
  name: string;
  role: string;
  status: string;
  pin_hash: string | null;
  default_home_path: string | null;
  default_home_path_mobile: string | null;
}

/** Lockout state read alongside the staff row so the refusal happens pre-hash. */
interface StaffPinLookupRow extends StaffPinRow {
  pin_failed_count: number;
  pin_locked: boolean;
}

// `pin_locked` is computed in SQL against NOW() so the decision never depends
// on the app server's clock.
const PIN_LOOKUP_COLUMNS = `id, name, role, status, pin_hash,
            default_home_path, default_home_path_mobile,
            COALESCE(pin_failed_count, 0)::int AS pin_failed_count,
            (pin_locked_until IS NOT NULL AND pin_locked_until > NOW()) AS pin_locked`;

// Wrong-PIN penalty: bump the consecutive-failure counter and arm the lock once
// it reaches MAX_PIN_ATTEMPTS. $2 = threshold, $3 = lockout minutes.
const PIN_FAILURE_SET = `pin_failed_count = COALESCE(pin_failed_count, 0) + 1,
           pin_locked_until = CASE
             WHEN COALESCE(pin_failed_count, 0) + 1 >= $2
               THEN NOW() + ($3::int * INTERVAL '1 minute')
             ELSE pin_locked_until
           END`;

// Success clears the lockout state and bumps last_login_at.
const PIN_SUCCESS_SET = `last_login_at = NOW(),
           pin_failed_count = 0,
           pin_locked_until = NULL`;

async function readPinRow(staffId: number, orgId?: OrgId): Promise<StaffPinLookupRow | undefined> {
  const sql = `SELECT ${PIN_LOOKUP_COLUMNS}
       FROM staff
      WHERE id = $1${orgId ? ' AND organization_id = $2' : ''}
      LIMIT 1`;
  const result = orgId
    ? await tenantQuery(orgId, sql, [staffId, orgId])
    : await pool.query(sql, [staffId]);
  return result.rows[0] as StaffPinLookupRow | undefined;
}

/**
 * Record a wrong PIN. Runs in its OWN transaction, never inside the caller's —
 * a PinError thrown by the caller must not roll back the failure counter.
 */
async function recordPinFailure(staffId: number, orgId?: OrgId): Promise<void> {
  const params: unknown[] = [staffId, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MINUTES];
  const sql = `UPDATE staff
         SET ${PIN_FAILURE_SET}
       WHERE id = $1${orgId ? ' AND organization_id = $4' : ''}`;
  if (orgId) {
    await tenantQuery(orgId, sql, [...params, orgId]);
    return;
  }
  await pool.query(sql, params);
}

/** Clear the lockout counters and bump last_login_at after a correct PIN. */
async function recordPinSuccess(staffId: number, orgId?: OrgId): Promise<void> {
  const sql = `UPDATE staff
         SET ${PIN_SUCCESS_SET}
       WHERE id = $1${orgId ? ' AND organization_id = $2' : ''}`;
  if (orgId) {
    await tenantQuery(orgId, sql, [staffId, orgId]);
    return;
  }
  await pool.query(sql, [staffId]);
}

/**
 * Look up by ID and verify PIN. Returns the staff row on success.
 * Throws PinError on every failure path; callers map to HTTP codes.
 *
 * Lockout (WS: handoff item 12): `pin_locked_until` is READ before any hashing
 * — a locked account throws `LOCKED` without burning scrypt time — and
 * `pin_failed_count` is incremented on every wrong PIN, arming a
 * 15-minute lock at 5 consecutive failures. A correct PIN clears both. The
 * counter write lives outside any caller transaction so the thrown PinError
 * cannot roll it back.
 *
 * Tenant scope: when `orgId` is supplied (an admin-context caller verifying a
 * staff member known to be in their own org), the row lookup and every counter
 * write are scoped to that org via `tenantQuery`, so a cross-org id reads as
 * NOT_FOUND and is never mutated. When omitted — the normal /api/auth/*
 * sign-in, step-up and switch flows that resolve a staff by id without org
 * context — the queries are org-agnostic exactly as before.
 *
 * Credential-matching (assertPinShape / verifyHash / timingSafeEqual) is
 * IDENTICAL in both branches; only the row read + UPDATEs gain the org
 * predicate. `staff` is tenant-owned and carries `organization_id`.
 */
export async function verifyStaffPin(staffId: number, pin: string, orgId?: OrgId): Promise<StaffPinRow> {
  assertPinShape(pin);

  const row = await readPinRow(staffId, orgId);
  if (!row) throw new PinError('NOT_FOUND');
  if (!row.pin_hash) throw new PinError('NO_PIN');
  // Refuse BEFORE hashing: a locked PIN is not an oracle and not a CPU sink.
  if (row.pin_locked) throw new PinError('LOCKED');

  const ok = await verifyHash(pin, row.pin_hash);
  if (!ok) {
    await recordPinFailure(staffId, orgId);
    throw new PinError('WRONG');
  }

  await recordPinSuccess(staffId, orgId);
  return row;
}
