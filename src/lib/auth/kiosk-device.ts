/** Kiosk device principal — enrollment, pairing, resolution, revocation. */

import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { verifyStaffPin, PinError } from '@/lib/auth/pin';
import { effectivePermissionsForStaff } from '@/lib/auth/role-store';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import type { OrgId } from '@/lib/tenancy/constants';
import { withKioskDeviceDerived } from '@/lib/kiosk/kiosk-device-derived';
import type { KioskHardwareStatus } from '@/lib/kiosk/kiosk-device-row';

/** Device-token cookie. Distinct from the staff `cf_sid` so a kiosk can never present a staff session. */
export const KIOSK_COOKIE_NAME = 'cf_kiosk';

/** Durable per-CLIENT id cookie (dogfood auto-bind only). */
const KIOSK_CLIENT_COOKIE_NAME = 'cf_kiosk_client';

/** `cf_kiosk` / `cf_kiosk_client` lifetime — a counter tablet is paired once and left alone. */
const KIOSK_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Default pairing-code lifetime — long enough to stage an MDM tablet without racing. */
export const DEFAULT_ENROLL_TTL_MINUTES = 7 * 24 * 60;

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

/** Resolve a presented device token to its org + id. */
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
  // `kiosk_devices.id` is BIGSERIAL, which node-postgres returns as a STRING.
  // Handed out as-is, every `deviceId === otherId` comparison downstream was
  // string-vs-number and false (a tablet read its own cart as "held elsewhere").
  const row = r.rows[0] as { id: number | string; organization_id: string; label: string } | undefined;
  if (!row) return null;
  const deviceId = Number(row.id);
  // Best-effort activity stamp; a failure here must never fail the request.
  void pool
    .query(`UPDATE kiosk_devices SET last_seen_at = now() WHERE id = $1`, [deviceId])
    .catch(() => { /* swallow — activity stamp is advisory */ });
  return { deviceId, organizationId: row.organization_id, label: row.label };
}

/** Read the raw device token off the request cookie (the token IS the capability; we hash to verify). */
export function readKioskToken(req: NextRequest): string | null {
  return req.cookies.get(KIOSK_COOKIE_NAME)?.value ?? null;
}

/** Charset + length a dogfood client id must satisfy before it may key a device row. */
const KIOSK_CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Fresh per-client id — 12 url-safe chars, short enough to read in Settings → Devices. */
export function newKioskClientId(): string {
  return randomBytes(9).toString('base64url');
}

/** This browser/tablet's dogfood client id, or null when absent or implausible. */
export function readKioskClientId(req: NextRequest): string | null {
  const raw = req.cookies.get(KIOSK_CLIENT_COOKIE_NAME)?.value ?? null;
  return raw && KIOSK_CLIENT_ID_RE.test(raw) ? raw : null;
}

/** What a response is pinning — either half may be omitted. */
interface KioskBindingCookies {
  /** Raw device token, when this response issued one. */
  token?: string;
  /** Durable client id, when this response minted or refreshed it. */
  clientId?: string;
}

/**
 * Pin the kiosk binding on a response. One place decides the cookie options
 * for BOTH cookies — pair, dogfood bind and in-place re-bind must agree on
 * httpOnly / host-only / year-long or a tablet silently loses its device.
 */
export function setKioskCookies(res: NextResponse, cookies: KioskBindingCookies): void {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: KIOSK_COOKIE_MAX_AGE_SECONDS,
    // intentionally no `domain` — host-only on `{slug}.kiosk.app…`
  };
  if (cookies.token) res.cookies.set(KIOSK_COOKIE_NAME, cookies.token, options);
  if (cookies.clientId) res.cookies.set(KIOSK_CLIENT_COOKIE_NAME, cookies.clientId, options);
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
    const row = r.rows[0] as { id: number | string; enroll_code_expires_at: Date };
    return { deviceId: Number(row.id), code, expiresAt: row.enroll_code_expires_at };
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

/** Exchange a pairing code for a long-lived device token. */
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
  const row = r.rows[0] as { id: number | string; organization_id: string; label: string } | undefined;
  if (!row) return null;
  return { deviceId: Number(row.id), organizationId: row.organization_id, label: row.label, token };
}

/** Prefix every dogfood auto-bind row carries, so Settings → Devices groups them. */
const DOGFOOD_KIOSK_LABEL_PREFIX = 'Dogfood auto-bind';

/** Label of the dogfood row owned by ONE client. */
export function dogfoodKioskDeviceLabel(clientId: string): string {
  return `${DOGFOOD_KIOSK_LABEL_PREFIX} · ${clientId}`;
}

/** Idle window after which an auto-bound dogfood credential is retired. */
const DOGFOOD_KIOSK_IDLE_DAYS = 14;

/** Retire dogfood credentials nobody has used in {@link DOGFOOD_KIOSK_IDLE_DAYS}. */
export async function revokeStaleDogfoodKioskDevices(
  orgId: OrgId,
  keepLabel: string,
): Promise<number> {
  const r = await pool.query(
    `UPDATE kiosk_devices
        SET status = 'revoked',
            device_token_hash = NULL,
            revoked_at = now(),
            updated_at = now()
      WHERE organization_id = $1
        AND status = 'active'
        AND label LIKE $2
        AND label <> $3
        AND COALESCE(last_seen_at, created_at) < now() - ($4 || ' days')::interval`,
    [orgId, `${DOGFOOD_KIOSK_LABEL_PREFIX} · %`, keepLabel, String(DOGFOOD_KIOSK_IDLE_DAYS)],
  );
  return r.rowCount ?? 0;
}

/** Mint or rotate an active device token for a named kiosk row. */
export async function issueActiveKioskDeviceToken(
  orgId: OrgId,
  label: string,
): Promise<{ token: string; deviceId: number; organizationId: string; label: string }> {
  // Owner-pool autocommit, same as `pairKioskDevice`. Neon serverless +
  // BEGIN/COMMIT on the tenant wrapper was returning an id that never landed
  // (sequence bumped, row absent) so `cf_kiosk` hashed to nothing → KIOSK_UNPAIRED.
  const token = newDeviceToken();
  const hash = sha256(token);
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM kiosk_devices
      WHERE organization_id = $1 AND label = $2
      ORDER BY id ASC
      LIMIT 1`,
    [orgId, label],
  );
  if (existing.rows[0]) {
    const deviceId = Number(existing.rows[0].id);
    const upd = await pool.query<{ id: number }>(
      `UPDATE kiosk_devices
          SET device_token_hash = $1, status = 'active', updated_at = now(), revoked_at = NULL
        WHERE id = $2 AND organization_id = $3
        RETURNING id`,
      [hash, deviceId, orgId],
    );
    if (!upd.rows[0]) {
      throw new Error('DOGFOOD_KIOSK_UPDATE_FAILED');
    }
    return { token, deviceId, organizationId: orgId, label };
  }
  const staff = await pool.query<{ id: number }>(
    `SELECT id FROM staff WHERE organization_id = $1 ORDER BY id ASC LIMIT 1`,
    [orgId],
  );
  const staffId = staff.rows[0] ? Number(staff.rows[0].id) : null;
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO kiosk_devices (
       organization_id, label, status, device_token_hash, enrolled_by_staff_id
     ) VALUES ($1, $2, 'active', $3, $4)
     RETURNING id`,
    [orgId, label, hash, staffId],
  );
  const deviceId = Number(ins.rows[0]!.id);
  return { token, deviceId, organizationId: orgId, label };
}

// ── Listing (manager, authed) ───────────────────────────────────────────────

interface KioskDeviceSummary {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAt: string | null;
  createdAt: string;
  enrolledByStaffId: number | null;
  /** Joined staff.name — person face never paints Staff #id. */
  enrolledByName: string | null;
  /** Square Terminal paired to this lane; null = cash / payment-link only. */
  squareTerminalDeviceId: string | null;
  dwellSeconds: number | null;
  hardwareStatus: KioskHardwareStatus;
}

/**
 * List a tenant's kiosk devices, newest first, for the Settings → Devices
 * surface. Org-scoped via the tenant transaction (never a cross-org read).
 * Never returns any hash — only management-facing facts.
 */
export async function listKioskDevices(orgId: OrgId): Promise<KioskDeviceSummary[]> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `SELECT d.id, d.label, d.status, d.last_seen_at, d.created_at, d.enrolled_by_staff_id,
              d.square_terminal_device_id,
              s.name AS enrolled_by_name
         FROM kiosk_devices d
         LEFT JOIN staff s
           ON s.id = d.enrolled_by_staff_id
          AND s.organization_id = d.organization_id
        WHERE d.organization_id = $1
        ORDER BY d.created_at DESC, d.id DESC`,
      [orgId],
    );
    return (r.rows as Array<{
      id: number; label: string; status: KioskDeviceSummary['status'];
      last_seen_at: Date | null; created_at: Date; enrolled_by_staff_id: number | null;
      enrolled_by_name: string | null;
      square_terminal_device_id: string | null;
    }>).map((row) =>
      withKioskDeviceDerived({
        // pg serializes bigint as a string; the summary type (and the revoke
        // route's `z.number()` body) expect a real number, so coerce at the waist.
        id: Number(row.id),
        label: row.label,
        status: row.status,
        lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
        enrolledByStaffId: row.enrolled_by_staff_id,
        enrolledByName: String(row.enrolled_by_name ?? '').trim() || null,
        squareTerminalDeviceId: row.square_terminal_device_id,
      }),
    );
  });
}

/** Pair (or unpair) a Square Terminal with a counter lane. */
export async function setKioskDeviceTerminal(
  orgId: OrgId,
  deviceId: number,
  squareTerminalDeviceId: string | null,
): Promise<boolean> {
  const value = String(squareTerminalDeviceId ?? '').trim() || null;
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query(
      `UPDATE kiosk_devices
          SET square_terminal_device_id = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND status <> 'revoked'`,
      [orgId, deviceId, value],
    );
    return (r.rowCount ?? 0) > 0;
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

/** Resolve a staff PIN presented for a privileged kiosk action into a verified `staffId`, org-scoped so a PIN only authorizes within the… */
export async function resolveKioskStepUp(
  orgId: OrgId,
  staffId: number,
  pin: string,
  requiredPermission: PermissionString | null,
): Promise<number | null> {
  if (!Number.isFinite(staffId) || staffId <= 0 || !pin) return null;
  try {
    const row = await verifyStaffPin(staffId, pin, orgId, { recordLogin: false });
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

// ── Pinless staff sign-in (counter tools, not money) ────────────────────────

/**
 * Resolve a staffer the counter tablet SIGNED IN as, without a PIN.
 * Operator 2026-09-22: *"remove the pin, use the same pinless sign in for the
 */
export async function resolveKioskStaffActor(
  orgId: OrgId,
  staffId: number,
): Promise<number | null> {
  if (!Number.isFinite(staffId) || staffId <= 0) return null;
  const res = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id
       FROM staff
      WHERE id = $1
        AND organization_id = $2
        AND COALESCE(status, 'active') IN ('active', 'invited')
        AND COALESCE(active, true) = true
      LIMIT 1`,
    [staffId, orgId],
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}
