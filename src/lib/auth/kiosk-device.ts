/**
 * Kiosk device principal — enrollment, pairing, resolution, revocation.
 *
 * A customer-facing tablet (/kiosk) authenticates as an org-scoped DEVICE, not
 * a person. Lifecycle:
 *
 *   enroll  (manager, authed)  → mint a short-lived, single-use pairing CODE;
 *                                row status='enrolled', only the code HASH stored.
 *   pair    (tablet, pre-auth) → exchange the code for a long-lived device TOKEN;
 *                                row status='active', code cleared, only the
 *                                token HASH stored. Sets the `cf_kiosk` cookie.
 *   resolve (every request)    → hash the presented token, look the device up on
 *                                the OWNER pool (pre-auth, FORCE-inert — mirrors
 *                                session.ts:loadSession by sid), read org FROM
 *                                the row.
 *   revoke  (manager, authed)  → status='revoked', token cleared; dies instantly.
 *
 * Only hashes are ever stored. Both the code and the token are 32/12-byte random
 * values, so a fast SHA-256 (not a slow PIN-style KDF) is the correct at-rest
 * transform — there is no low-entropy brute-force surface. See
 * 2026-07-17_kiosk_devices.sql for the table + pre-auth-lookup rationale.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { verifyStaffPin, PinError } from '@/lib/auth/pin';
import { effectivePermissionsForStaff } from '@/lib/auth/role-store';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { OrgId } from '@/lib/tenancy/constants';

/** Device-token cookie. Distinct from the staff `cf_sid` so a kiosk can never present a staff session. */
export const KIOSK_COOKIE_NAME = 'cf_kiosk';

/** Default pairing-code lifetime — long enough for a manager to walk the code to the tablet. */
export const DEFAULT_ENROLL_TTL_MINUTES = 30;

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Long-lived device credential — 32 bytes url-safe. */
function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Short-lived, single-use pairing code — 12 chars url-safe, readable enough to hand-carry. */
function newEnrollCode(): string {
  return randomBytes(9).toString('base64url');
}

// ── Resolution (pre-auth, owner pool) ───────────────────────────────────────

export interface ResolvedKioskDevice {
  deviceId: number;
  organizationId: string;
  label: string;
}

/**
 * Resolve a presented device token to its org + id. Runs on the OWNER pool
 * because the org is unknown until the row is found (pre-auth), exactly like
 * `loadSession(sid)`. The token hash is globally unique, so this is a single
 * indexed lookup. `last_seen_at` is bumped best-effort (never blocks auth).
 * Returns null for a missing/revoked/unpaired token.
 */
export async function loadKioskDeviceByToken(
  token: string | null | undefined,
): Promise<ResolvedKioskDevice | null> {
  if (!token || typeof token !== 'string' || token.length < 16) return null;
  const r = await pool.query(
    `SELECT id, organization_id, label
       FROM kiosk_devices
      WHERE device_token_hash = $1
        AND status = 'active'
      LIMIT 1`,
    [sha256(token)],
  );
  const row = r.rows[0] as { id: number; organization_id: string; label: string } | undefined;
  if (!row) return null;
  // Best-effort activity stamp; a failure here must never fail the request.
  void pool
    .query(`UPDATE kiosk_devices SET last_seen_at = now() WHERE id = $1`, [row.id])
    .catch(() => { /* swallow — activity stamp is advisory */ });
  return { deviceId: row.id, organizationId: row.organization_id, label: row.label };
}

/** Read the raw device token off the request cookie (the token IS the capability; we hash to verify). */
export function readKioskToken(req: NextRequest): string | null {
  return req.cookies.get(KIOSK_COOKIE_NAME)?.value ?? null;
}

// ── Enrollment (manager, authed, org known) ─────────────────────────────────

interface CreateKioskEnrollmentOpts {
  label: string;
  enrolledByStaffId: number;
  ttlMinutes?: number;
}

interface KioskEnrollment {
  deviceId: number;
  /** Raw pairing code — returned ONCE, never stored. Hand to the tablet. */
  code: string;
  expiresAt: Date;
}

/**
 * Mint an enrolled `kiosk_devices` row + a one-time pairing code. INSERT runs
 * inside the tenant transaction so `organization_id` is stamped from the GUC.
 */
export async function createKioskEnrollment(
  orgId: OrgId,
  opts: CreateKioskEnrollmentOpts,
): Promise<KioskEnrollment> {
  const code = newEnrollCode();
  const ttl = opts.ttlMinutes ?? DEFAULT_ENROLL_TTL_MINUTES;
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `INSERT INTO kiosk_devices (organization_id, label, status, enroll_code_hash, enroll_code_expires_at, enrolled_by_staff_id)
       VALUES ($1, $2, 'enrolled', $3, now() + ($4 || ' minutes')::interval, $5)
       RETURNING id, enroll_code_expires_at`,
      [orgId, opts.label, sha256(code), String(ttl), opts.enrolledByStaffId],
    );
    const row = r.rows[0] as { id: number; enroll_code_expires_at: Date };
    return { deviceId: row.id, code, expiresAt: row.enroll_code_expires_at };
  });
}

// ── Pairing (tablet, pre-auth) ──────────────────────────────────────────────

interface KioskPairing {
  deviceId: number;
  organizationId: string;
  label: string;
  /** Raw device token — returned ONCE, set as the `cf_kiosk` cookie, never stored. */
  token: string;
}

/**
 * Exchange a pairing code for a long-lived device token. Atomic + single-use:
 * the code-consuming UPDATE only matches an `enrolled`, unexpired row, so a
 * replay finds nothing (mirrors `consumeEnrollment`). Runs on the owner pool —
 * pre-auth, org unknown until the row matches; the org is then read FROM the
 * row, never trusted from the request subdomain alone.
 *
 * When `expectedOrganizationId` is set (kiosk host slug → org), the UPDATE
 * also requires `organization_id` to match — wrong-tenant codes fail closed
 * as a miss (same shape as expired/unknown), and never activate the device.
 */
export async function pairKioskDevice(
  code: string | null | undefined,
  opts?: { expectedOrganizationId?: string | null },
): Promise<KioskPairing | null> {
  if (!code || typeof code !== 'string' || code.length < 8) return null;
  const expectedOrg = opts?.expectedOrganizationId?.trim() || null;
  const token = newDeviceToken();
  const r = await pool.query(
    `UPDATE kiosk_devices
        SET device_token_hash = $2,
            status = 'active',
            enroll_code_hash = NULL,
            enroll_code_expires_at = NULL,
            updated_at = now()
      WHERE enroll_code_hash = $1
        AND status = 'enrolled'
        AND enroll_code_expires_at > now()
        AND ($3::uuid IS NULL OR organization_id = $3::uuid)
      RETURNING id, organization_id, label`,
    [sha256(code), sha256(token), expectedOrg],
  );
  const row = r.rows[0] as { id: number; organization_id: string; label: string } | undefined;
  if (!row) return null;
  return { deviceId: row.id, organizationId: row.organization_id, label: row.label, token };
}

// ── Listing (manager, authed) ───────────────────────────────────────────────

interface KioskDeviceSummary {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAt: string | null;
  createdAt: string;
  enrolledByStaffId: number | null;
}

/**
 * List a tenant's kiosk devices, newest first, for the Settings → Devices
 * surface. Org-scoped via the tenant transaction (never a cross-org read).
 * Never returns any hash — only management-facing facts.
 */
export async function listKioskDevices(orgId: OrgId): Promise<KioskDeviceSummary[]> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `SELECT id, label, status, last_seen_at, created_at, enrolled_by_staff_id
         FROM kiosk_devices
        WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC`,
      [orgId],
    );
    return (r.rows as Array<{
      id: number; label: string; status: KioskDeviceSummary['status'];
      last_seen_at: Date | null; created_at: Date; enrolled_by_staff_id: number | null;
    }>).map((row) => ({
      // pg serializes bigint as a string; the summary type (and the revoke
      // route's `z.number()` body) expect a real number, so coerce at the waist.
      id: Number(row.id),
      label: row.label,
      status: row.status,
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      enrolledByStaffId: row.enrolled_by_staff_id,
    }));
  });
}

// ── Revocation (manager, authed) ────────────────────────────────────────────

/**
 * Revoke a device. Org-scoped UPDATE inside the tenant transaction so a manager
 * can only revoke a device in their own org. Returns true when a row flipped.
 */
export async function revokeKioskDevice(orgId: OrgId, deviceId: number): Promise<boolean> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `UPDATE kiosk_devices
          SET status = 'revoked',
              revoked_at = now(),
              device_token_hash = NULL,
              updated_at = now()
        WHERE id = $1
          AND organization_id = $2
          AND status <> 'revoked'
        RETURNING id`,
      [deviceId, orgId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}

// ── PIN step-up (privileged kiosk actions) ──────────────────────────────────

/**
 * Resolve a staff PIN presented for a privileged kiosk action into a verified
 * `staffId`, org-scoped so a PIN only authorizes within the device's own org.
 * Base intake stays anonymous; only refund / repair-approval / price-override /
 * take-payment style actions call this, and the returned id is what
 * `recordAudit` attributes the write to (the device stays the `via`).
 *
 * `requiredPermission` is a REQUIRED argument with no default, deliberately.
 * It decides whether a valid PIN is *enough* to authorize the action, which is a
 * safety classification — and a defaulted safety classification is a silent
 * opt-out that every call site you did not visit takes automatically, with the
 * compiler staying quiet about exactly the ones you missed
 * (`.claude/rules/backend-patterns.md`). Pass an explicit `null` to mean "a
 * valid PIN is sufficient" so that choice is visible at the call site.
 *
 * Returns null on a bad PIN, an unknown staff, OR a staff who authenticated
 * correctly but does not hold the permission. The caller cannot distinguish —
 * a step-up prompt must not tell an unattended room which PINs are real.
 */
export async function resolveKioskStepUp(
  orgId: OrgId,
  staffId: number,
  pin: string,
  requiredPermission: PermissionString | null,
): Promise<number | null> {
  if (!Number.isFinite(staffId) || staffId <= 0 || !pin) return null;
  try {
    const row = await verifyStaffPin(staffId, pin, orgId);
    if (requiredPermission) {
      const permissions = await effectivePermissionsForStaff(row.id, {}, orgId);
      if (!permissions.has(requiredPermission)) {
        // Authenticated, but not authorized for THIS action. Log it — a real
        // person tried to take an action their role does not cover, and that is
        // worth seeing; returning null silently would hide it entirely.
        console.warn('[kiosk-stepup] permission denied', {
          staffId: row.id,
          requiredPermission,
        });
        return null;
      }
    }
    return row.id;
  } catch (err) {
    if (err instanceof PinError) return null;
    throw err;
  }
}
