import 'server-only';
/**
 * Enrolled print station — an org-owned computer that prints with no staff
 * signed in. Its credential is a `kiosk_devices` row of `kind = 'print_station'`
 * (one device-credential pattern: single-use pairing code → hashed device token
 * in an httpOnly cookie); its identity is the `print_stations` row bound to that
 * device. Kiosk resolution filters `kind = 'kiosk'`, so neither credential can
 * act as the other.
 */

import { randomInt, randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { deviceCookieOptions, newDeviceToken, sha256 } from '@/lib/auth/kiosk-device';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { PRINT_STATION_PAIR_CODE_LENGTH, type PrintStationDeviceState, type PrintStationEnrollment } from './print-station-registry-contracts';

/** Device-token cookie of an enrolled print station. Distinct from `cf_sid` and `cf_kiosk`. */
export const PRINT_STATION_COOKIE_NAME = 'cf_print_station';

/** Four digits are hand-carryable, so keep their exposure window deliberately short. */
const PRINT_STATION_ENROLL_TTL_MINUTES = 15;
const PRINT_STATION_ENROLL_CODE_ATTEMPTS = 20;

/** Cryptographically random decimal code, including leading zeroes. */
export function newPrintStationPairCode(): string {
  return randomInt(10 ** PRINT_STATION_PAIR_CODE_LENGTH)
    .toString()
    .padStart(PRINT_STATION_PAIR_CODE_LENGTH, '0');
}

function uniqueConstraint(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') return null;
  return 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : '';
}

// ── Enrollment (Hardware settings, authed) ──────────────────────────────────

export type PrintStationEnrollResult =
  | { ok: true; enrollment: PrintStationEnrollment }
  | { ok: false; status: 409; error: string };

export type PrintStationRePairResult =
  | { ok: true; enrollment: PrintStationEnrollment }
  | { ok: false; status: 404; error: string };

/**
 * Mint the station's device credential (enrolled, code hash, ~24h TTL) and its
 * `print_stations` row in one tenant transaction. The station is created never
 * heard (`last_seen_at = to_timestamp(0)`), so it reads offline until it pairs.
 */
export async function createPrintStationEnrollment(
  orgId: OrgId,
  opts: { name: string; staffId: number },
): Promise<PrintStationEnrollResult> {
  for (let attempt = 0; attempt < PRINT_STATION_ENROLL_CODE_ATTEMPTS; attempt += 1) {
    const code = newPrintStationPairCode();
    const stationId = `ps_${randomUUID()}`;
    try {
      return await withTenantTransaction(orgId, async (client): Promise<PrintStationEnrollResult> => {
        // Expired, never-paired stations cannot come back. Retire them before
        // issuing from the deliberately small 0000–9999 code space, freeing
        // both their code and their human name for a fresh enrollment.
        await client.query(
          `UPDATE print_stations AS s
              SET revoked_at = now(), paused_at = NULL, assigned_label = false, assigned_paper = false,
                  name = left(s.name, 80) || ' · expired ' || left(replace(s.station_id, 'ps_', ''), 8)
             FROM kiosk_devices AS d
            WHERE s.organization_id = $1
              AND d.organization_id = $1
              AND s.device_id = d.id
              AND s.kind = 'enrolled'
              AND s.revoked_at IS NULL
              AND d.kind = 'print_station'
              AND d.status = 'enrolled'
              AND d.enroll_code_expires_at <= now()`,
          [orgId],
        );
        await client.query(
          `UPDATE kiosk_devices
              SET status = 'revoked', revoked_at = now(), enroll_code_hash = NULL,
                  enroll_code_expires_at = NULL, updated_at = now()
            WHERE organization_id = $1
              AND kind = 'print_station'
              AND status = 'enrolled'
              AND enroll_code_expires_at <= now()`,
          [orgId],
        );

        const device = await client.query<{ id: string | number; enroll_code_expires_at: Date }>(
          `INSERT INTO kiosk_devices
             (organization_id, kind, label, status, enroll_code_hash, enroll_code_expires_at, enrolled_by_staff_id)
           VALUES ($1, 'print_station', $2, 'enrolled', $3, now() + ($4 || ' minutes')::interval, $5)
           RETURNING id, enroll_code_expires_at`,
          [orgId, opts.name, sha256(code), String(PRINT_STATION_ENROLL_TTL_MINUTES), opts.staffId],
        );
        const row = device.rows[0]!;
        await client.query(
          `INSERT INTO print_stations
             (organization_id, station_id, name, kind, device_id, enrolled_by_staff_id, last_seen_at)
           VALUES ($1, $2, $3, 'enrolled', $4, $5, to_timestamp(0))`,
          [orgId, stationId, opts.name, Number(row.id), opts.staffId],
        );
        return {
          ok: true,
          enrollment: { stationId, code, expiresAt: row.enroll_code_expires_at.toISOString() },
        };
      });
    } catch (error) {
      const constraint = uniqueConstraint(error);
      if (constraint === 'ux_kiosk_devices_enroll_code_hash') continue;
      if (constraint !== null) {
        return { ok: false, status: 409, error: `Another print station is already called “${opts.name}”.` };
      }
      throw error;
    }
  }
  throw new Error('Could not reserve a four-digit print-station pairing code. Try again.');
}

/**
 * Replace an enrolled station's device credential without replacing its
 * station row. Its name, org defaults and print history stay attached to the
 * same station id; the old device token stops working immediately.
 */
export async function rePairPrintStation(
  orgId: OrgId,
  stationId: string,
): Promise<PrintStationRePairResult> {
  for (let attempt = 0; attempt < PRINT_STATION_ENROLL_CODE_ATTEMPTS; attempt += 1) {
    const code = newPrintStationPairCode();
    try {
      return await withTenantTransaction(orgId, async (client): Promise<PrintStationRePairResult> => {
        const station = await client.query<{ device_id: string | number }>(
          `SELECT device_id
             FROM print_stations
            WHERE organization_id = $1
              AND station_id = $2
              AND kind = 'enrolled'
              AND revoked_at IS NULL
              AND device_id IS NOT NULL
            FOR UPDATE`,
          [orgId, stationId],
        );
        const row = station.rows[0];
        if (!row) return { ok: false, status: 404, error: 'Enrolled print station not found.' };

        const device = await client.query<{ enroll_code_expires_at: Date }>(
          `UPDATE kiosk_devices
              SET status = 'enrolled', device_token_hash = NULL,
                  enroll_code_hash = $3,
                  enroll_code_expires_at = now() + ($4 || ' minutes')::interval,
                  revoked_at = NULL, last_seen_at = NULL, updated_at = now()
            WHERE organization_id = $1
              AND id = $2
              AND kind = 'print_station'
            RETURNING enroll_code_expires_at`,
          [orgId, Number(row.device_id), sha256(code), String(PRINT_STATION_ENROLL_TTL_MINUTES)],
        );
        const credential = device.rows[0];
        if (!credential) return { ok: false, status: 404, error: 'Print station credential not found.' };

        await client.query(
          `UPDATE print_stations
              SET last_seen_at = to_timestamp(0), label_ready = false, paper_ready = false,
                  label_printer = NULL, paper_printer = NULL
            WHERE organization_id = $1 AND station_id = $2`,
          [orgId, stationId],
        );
        return {
          ok: true,
          enrollment: { stationId, code, expiresAt: credential.enroll_code_expires_at.toISOString() },
        };
      });
    } catch (error) {
      if (uniqueConstraint(error) === 'ux_kiosk_devices_enroll_code_hash') continue;
      throw error;
    }
  }
  throw new Error('Could not reserve a four-digit print-station pairing code. Try again.');
}

// ── Pairing (the station computer, pre-auth) ────────────────────────────────

export interface PrintStationPairing extends ResolvedPrintStationDevice {
  /** Raw device token — returned ONCE, set as the `cf_print_station` cookie, never stored. */
  token: string;
}

/**
 * Exchange a pairing code for the station's long-lived device token. Owner
 * pool, exactly like kiosk pairing: the code hash IS the capability, and the
 * org is only known once it matches.
 */
export async function pairPrintStationDevice(code: string): Promise<PrintStationPairing | null> {
  const token = newDeviceToken();
  const r = await pool.query<{ id: string | number; organization_id: string }>(
    `UPDATE kiosk_devices
        SET device_token_hash = $2,
            status = 'active',
            enroll_code_hash = NULL,
            enroll_code_expires_at = NULL,
            last_seen_at = now(),
            updated_at = now()
      WHERE enroll_code_hash = $1
        AND status = 'enrolled'
        AND kind = 'print_station'
        AND enroll_code_expires_at > now()
      RETURNING id, organization_id`,
    [sha256(code), sha256(token)],
  );
  const device = r.rows[0];
  if (!device) return null;
  const station = await stationForDevice(device.organization_id, Number(device.id));
  return station ? { ...station, token } : null;
}

// ── Resolution (every device request, pre-auth) ─────────────────────────────

export interface ResolvedPrintStationDevice extends PrintStationDeviceState {
  deviceId: number;
}

async function stationForDevice(organizationId: string, deviceId: number): Promise<ResolvedPrintStationDevice | null> {
  const { rows } = await tenantQuery<{ station_id: string; name: string; paused: boolean }>(
    organizationId as OrgId,
    `SELECT station_id, name, paused_at IS NOT NULL AS paused
       FROM print_stations
      WHERE organization_id = $1 AND device_id = $2 AND kind = 'enrolled' AND revoked_at IS NULL
      LIMIT 1`,
    [organizationId, deviceId],
  );
  const row = rows[0];
  return row ? { organizationId, deviceId, stationId: row.station_id, name: row.name, paused: row.paused } : null;
}

/** Resolve a presented device token to its org, device and live (not revoked) station. */
export async function loadPrintStationDevice(token: string | null | undefined): Promise<ResolvedPrintStationDevice | null> {
  if (!token || typeof token !== 'string' || token.length < 16) return null;
  const r = await pool.query<{ id: string | number; organization_id: string }>(
    `SELECT id, organization_id
       FROM kiosk_devices
      WHERE device_token_hash = $1
        AND status = 'active'
        AND kind = 'print_station'
      LIMIT 1`,
    [sha256(token)],
  );
  const device = r.rows[0];
  if (!device) return null;
  const deviceId = Number(device.id);
  const station = await stationForDevice(device.organization_id, deviceId);
  if (!station) return null;
  // Best-effort activity stamp; a failure here must never fail the request.
  void pool
    .query(`UPDATE kiosk_devices SET last_seen_at = now() WHERE id = $1`, [deviceId])
    .catch(() => { /* swallow — activity stamp is advisory */ });
  return station;
}

/** The raw device token off the request (the token IS the capability; it is hashed to verify). */
export function readPrintStationToken(req: NextRequest): string | null {
  return req.cookies.get(PRINT_STATION_COOKIE_NAME)?.value ?? null;
}

/** Pin the station's device token on a response — same options as every device credential. */
export function setPrintStationCookie(res: NextResponse, token: string): void {
  res.cookies.set(PRINT_STATION_COOKIE_NAME, token, deviceCookieOptions());
}
