import 'server-only';

/**
 * The phone companion's meeting point — one `kiosk_companion_links` row per
 * counter tablet.
 *
 * The TABLET stays the authority for its repair visit (the cart is local until
 * a desk holds it). It opens a link (a token it shows as a QR), pushes its
 * device snapshot on every sync, and takes the serials a phone scanned since
 * the last one. A staff PHONE reads the snapshot by token and queues serials.
 * Neither side ever writes the other's field: devices are the tablet's,
 * pending serials are the phone's until the tablet consumes them.
 *
 * Only a SHA-256 of the token is stored. Every query is org-scoped under the
 * tenant GUC (`withTenantTransaction` / `tenantQuery`) and stamps the org from
 * the caller's auth context, never the request.
 *
 * Callers: `/api/kiosk/companion` (open), `/api/kiosk/companion/sync`,
 * `/api/counter/companion` (phone read + scan).
 * Schema: `kiosk_companion_links` (2026-09-24c).
 * User: "a QR code that you would be able to scan on your phone to join the
 *   same repair service session and then scan something like a serial number".
 */

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  CompanionDevicesSchema,
  CompanionSerialSchema,
  mergeCompanionDevices,
  queueCompanionSerial,
  type CompanionDevice,
  type CompanionSerial,
} from './companion-shape';

/** A visit's worth of time; a new visit's QR rotates the token anyway. */
const LINK_TTL_MS = 4 * 60 * 60 * 1000;

const PendingSchema = z.array(CompanionSerialSchema);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Stored JSON that fails its shape reads as empty rather than crashing a sync. */
function readDevices(raw: unknown): CompanionDevice[] {
  const parsed = CompanionDevicesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function readPending(raw: unknown): CompanionSerial[] {
  const parsed = PendingSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Open (or re-open) THIS tablet's link. Rotates the token, so the QR a phone
 * scanned for an earlier visit stops answering.
 */
export async function openCompanionLink(
  orgId: OrgId,
  deviceId: number,
  devices: readonly CompanionDevice[],
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  await tenantQuery(
    orgId,
    `INSERT INTO kiosk_companion_links
       (organization_id, device_id, token_hash, devices, pending_serials, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, $5)
     ON CONFLICT (organization_id, device_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           devices = EXCLUDED.devices,
           pending_serials = '[]'::jsonb,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()`,
    [orgId, deviceId, hashToken(token), JSON.stringify(devices), expiresAt],
  );
  return { token, expiresAt };
}

/**
 * The tablet's sync: store its snapshot (with any not-yet-applied scans laid
 * over it) and hand back the scans it must apply, clearing them in the same
 * transaction so a scan is applied exactly once. `null` → no live link.
 */
export async function syncCompanionFromTablet(
  orgId: OrgId,
  deviceId: number,
  devices: readonly CompanionDevice[],
): Promise<{ pending: CompanionSerial[] } | null> {
  return withTenantTransaction(orgId, async (client) => {
    const found = await client.query<{ id: number; pending_serials: unknown }>(
      `SELECT id, pending_serials FROM kiosk_companion_links
        WHERE organization_id = $1 AND device_id = $2 AND expires_at > NOW()
        FOR UPDATE`,
      [orgId, deviceId],
    );
    const row = found.rows[0];
    if (!row) return null;
    const pending = readPending(row.pending_serials);
    await client.query(
      `UPDATE kiosk_companion_links
          SET devices = $2::jsonb, pending_serials = '[]'::jsonb, updated_at = NOW()
        WHERE id = $1`,
      [row.id, JSON.stringify(mergeCompanionDevices(devices, pending))],
    );
    return { pending };
  });
}

/** The phone's read: the visit's units, scans still in flight included. */
export async function readCompanionForPhone(
  orgId: OrgId,
  token: string,
): Promise<{ devices: CompanionDevice[]; expiresAt: string } | null> {
  const res = await tenantQuery<{ devices: unknown; pending_serials: unknown; expires_at: Date }>(
    orgId,
    `SELECT devices, pending_serials, expires_at FROM kiosk_companion_links
      WHERE organization_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
    [orgId, hashToken(token)],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    devices: mergeCompanionDevices(readDevices(row.devices), readPending(row.pending_serials)),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export type QueueSerialResult =
  | { ok: true; devices: CompanionDevice[] }
  | { ok: false; reason: 'not_found' | 'unknown_unit' };

/** The phone's scan: queue it for the tablet and show it on the snapshot at once. */
export async function queueSerialFromPhone(
  orgId: OrgId,
  token: string,
  serial: CompanionSerial,
): Promise<QueueSerialResult> {
  return withTenantTransaction(orgId, async (client) => {
    const found = await client.query<{ id: number; devices: unknown; pending_serials: unknown }>(
      `SELECT id, devices, pending_serials FROM kiosk_companion_links
        WHERE organization_id = $1 AND token_hash = $2 AND expires_at > NOW()
        FOR UPDATE`,
      [orgId, hashToken(token)],
    );
    const row = found.rows[0];
    if (!row) return { ok: false, reason: 'not_found' } as const;
    const devices = readDevices(row.devices);
    if (!devices.some((d) => d.lineId === serial.lineId)) {
      return { ok: false, reason: 'unknown_unit' } as const;
    }
    const pending = queueCompanionSerial(readPending(row.pending_serials), serial);
    await client.query(
      `UPDATE kiosk_companion_links SET pending_serials = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [row.id, JSON.stringify(pending)],
    );
    return { ok: true, devices: mergeCompanionDevices(devices, pending) } as const;
  });
}
