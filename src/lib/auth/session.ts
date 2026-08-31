/**
 * Server-side opaque sessions in Postgres. Cookie carries only a 32-byte
 * random sid; everything else (staff_id, role, device, expiry, revocation)
 * lives in `staff_sessions`. That means we can revoke a single device or
 * an entire user's sessions instantly — something a JWT can't do without a
 * blocklist.
 *
 * Idle-timeout policy by device_kind (when staff.session_policy='default'):
 *   station  →  8 hr idle, 24 hr absolute  (workstation default, survives a coffee break + lunch)
 *   personal → 12 hr idle, 30 days absolute (the "Remember me" device — long-lived)
 *   phone    →  4 hr idle,  4 hr absolute  (matches Ably token TTL)
 *
 * Per-staff session_policy overrides:
 *   extended   — personal devices get 7d idle / 90d absolute; others unchanged
 *   persistent — no idle, 1 year absolute, sliding (touchSession refreshes it).
 *                Stays signed in indefinitely so long as the staff keeps using
 *                the device. Still revocable from the admin UI.
 *
 * Per-session "Keep me signed in":
 *   `staff_sessions.persistent` carries the sign-in checkbox. It resolves the
 *   same PERSISTENT_WINDOW as the per-staff policy, for THIS device only —
 *   the checkbox is a per-sign-in choice, the policy is admin config, and the
 *   two OR together (see resolveSessionWindow). A persistent session also
 *   ignores shift-end expiry, because a session that dies at the end of the
 *   shift is not "signed in no matter what".
 */

import { randomBytes } from 'node:crypto';
import pool from '@/lib/db';
import { parseOrgSettings } from '@/lib/tenancy/settings';
import { enforceMaxConcurrentSessions, type ConcurrencyDeps } from '@/lib/auth/session-concurrency';

/**
 * Canonical session cookie. Renamed from the legacy `usav_sid` (dogfood-branded)
 * to the vendor-neutral `cf_sid`. During the transition every READER accepts
 * either name (see {@link readSessionSid}); writers set `cf_sid` and clear the
 * legacy cookie. The name is duplicated (inlined) in `src/proxy.ts` because the
 * Edge runtime can't import this Node module — keep the two in sync.
 */
export const SESSION_COOKIE_NAME = 'cf_sid';
/** Legacy cookie name — still honored on read during the 30-day migration. */
export const LEGACY_SESSION_COOKIE_NAME = 'usav_sid';

/** A cookie store with the minimal shape both `req.cookies` and `cookies()` expose. */
interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/**
 * Read the session sid preferring the canonical `cf_sid`, falling back to the
 * legacy `usav_sid`. Returns `{ sid, legacy }` so callers can migrate a request
 * that authenticated on the legacy cookie (re-issue `cf_sid`, clear `usav_sid`).
 */
export function readSessionCookie(store: CookieReader): { sid: string | null; legacy: boolean } {
  const current = store.get(SESSION_COOKIE_NAME)?.value;
  if (current) return { sid: current, legacy: false };
  const legacy = store.get(LEGACY_SESSION_COOKIE_NAME)?.value;
  if (legacy) return { sid: legacy, legacy: true };
  return { sid: null, legacy: false };
}

/** Convenience: just the sid (cf_sid or legacy usav_sid), or null. */
export function readSessionSid(store: CookieReader): string | null {
  return readSessionCookie(store).sid;
}

export type DeviceKind = 'station' | 'personal' | 'phone';
export type SessionPolicy = 'default' | 'extended' | 'persistent';
export const SESSION_POLICIES: readonly SessionPolicy[] = ['default', 'extended', 'persistent'] as const;

export interface SessionRow {
  sid: string;
  staffId: number;
  /** Active tenant for this session — see migrations/2026-05-22_organizations_tenancy.sql. */
  organizationId: string;
  deviceKind: DeviceKind;
  deviceLabel: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Minted with "Keep me signed in" checked — no idle timeout, sliding year. */
  persistent: boolean;
}

export interface IdleWindow {
  idleMs: number;
  absoluteMs: number;
}

const IDLE_WINDOWS: Record<DeviceKind, IdleWindow> = {
  station:  { idleMs:  8 * 60 * 60 * 1000,    absoluteMs: 24 * 60 * 60 * 1000 },
  personal: { idleMs: 12 * 60 * 60 * 1000,    absoluteMs: 30 * 24 * 60 * 60 * 1000 },
  phone:    { idleMs:  4 * 60 * 60 * 1000,    absoluteMs:  4 * 60 * 60 * 1000 },
};

const EXTENDED_PERSONAL: IdleWindow = {
  idleMs:     7 * 24 * 60 * 60 * 1000,
  absoluteMs: 90 * 24 * 60 * 60 * 1000,
};

const PERSISTENT_WINDOW: IdleWindow = {
  idleMs:     Number.POSITIVE_INFINITY,
  absoluteMs: 365 * 24 * 60 * 60 * 1000,
};

/**
 * Resolve the effective idle/absolute window given device + staff policy +
 * the session's own "Keep me signed in" flag.
 *
 * The session flag and the staff policy are an OR, never a replacement: an
 * admin who put a staff on `session_policy='persistent'` keeps that window
 * whether or not the box was checked, and checking the box grants it to this
 * device regardless of the staff's policy.
 */
export function resolveSessionWindow(
  kind: DeviceKind,
  policy: SessionPolicy,
  sessionPersistent = false,
): IdleWindow {
  if (sessionPersistent || policy === 'persistent') return PERSISTENT_WINDOW;
  if (policy === 'extended' && kind === 'personal') return EXTENDED_PERSONAL;
  return IDLE_WINDOWS[kind];
}

/**
 * The whole expiry decision for a new session, as a pure function: device
 * window ∩ staff policy ∩ "Keep me signed in" ∩ (optionally) the end of the
 * staff's shift.
 *
 * Extracted from {@link createSession} so the shift-vs-persistent interaction
 * can be pinned by a DB-free test — it is the part that silently defeats the
 * checkbox when it goes wrong.
 */
export function resolveSessionExpiry(opts: {
  deviceKind: DeviceKind;
  policy: SessionPolicy;
  persistent: boolean;
  /** End of the staff's active shift, when they have one. */
  shiftEndsAt?: Date | null;
  /** Injectable clock; defaults to now. */
  now?: number;
}): { expiresAt: Date; window: IdleWindow; honorsShift: boolean } {
  const now = opts.now ?? Date.now();
  const window = resolveSessionWindow(opts.deviceKind, opts.policy, opts.persistent);
  const defaultExpiresAt = new Date(now + window.absoluteMs);

  // Shift-bound expiry wins (if it's sooner). Falls back to the device's
  // absolute window when no shift is provided.
  //
  // Exception: a persistent session opted out of auto-signout — whether that
  // came from the staff's policy or from "Keep me signed in" on this device,
  // the whole point is to stay signed in across days. Binding the session to
  // shift end (min() below) would silently defeat that, so we ignore the
  // shift window for it and use the full 1-year persistent window.
  const honorsShift =
    !opts.persistent &&
    opts.policy !== 'persistent' &&
    opts.shiftEndsAt != null &&
    opts.shiftEndsAt.getTime() > now;

  return {
    expiresAt: honorsShift
      ? new Date(Math.min(opts.shiftEndsAt!.getTime(), defaultExpiresAt.getTime()))
      : defaultExpiresAt,
    window,
    honorsShift,
  };
}

/** @deprecated prefer cookieMaxAgeForSession(session) so policy is honored. */
export function getCookieMaxAgeSeconds(kind: DeviceKind): number {
  return Math.floor(IDLE_WINDOWS[kind].absoluteMs / 1000);
}

/** Cookie max-age for a freshly-created/loaded session row. */
export function cookieMaxAgeForSession(session: { expiresAt: Date }): number {
  return Math.max(60, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
}

function newSid(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Parse the "Keep me signed in" flag off an untrusted request body.
 * Anything that isn't literally `true` reads as false — an absent or
 * malformed field must never quietly grant an indefinite session.
 */
export function asPersistentFlag(raw: unknown): boolean {
  return raw === true;
}

export interface CreateSessionOpts {
  staffId: number;
  deviceKind: DeviceKind;
  deviceLabel?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Optional hard expiry. When set, overrides the device-kind absolute
   * window — used to tie session lifetime to the end of the staff's shift
   * so they get auto-signed-out when their shift ends.
   *
   * Ignored for a persistent session — see {@link CreateSessionOpts.persistent}.
   */
  expiresAt?: Date;
  /**
   * The sign-in page's "Keep me signed in" checkbox, for THIS device.
   * True → no idle timeout, a 1-year sliding absolute window, and shift-end
   * expiry is ignored (a shift-bound expiry would silently defeat the whole
   * promise). Defaults to false, which is exactly today's behaviour.
   */
  persistent?: boolean;
}

interface SessionDbRow {
  sid: string; staff_id: number; organization_id: string;
  device_kind: DeviceKind; device_label: string | null;
  ip: string | null; user_agent: string | null;
  created_at: Date; last_seen_at: Date; expires_at: Date; revoked_at: Date | null;
  persistent: boolean;
}

/** Real-DB deps for {@link enforceMaxConcurrentSessions}. */
const defaultConcurrencyDeps: ConcurrencyDeps = {
  async listActiveSids(staffId) {
    const r = await pool.query<{ sid: string; last_seen_at: Date }>(
      `SELECT sid, last_seen_at FROM staff_sessions
        WHERE staff_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [staffId],
    );
    return r.rows.map((row) => ({ sid: row.sid, lastSeenAt: row.last_seen_at }));
  },
  async revokeSids(sids) {
    if (!sids.length) return;
    await pool.query(`UPDATE staff_sessions SET revoked_at = NOW() WHERE sid = ANY($1) AND revoked_at IS NULL`, [sids]);
  },
};

export async function createSession(opts: CreateSessionOpts): Promise<SessionRow> {
  const sid = newSid();

  // Read the staff's current session policy so we apply the right window.
  // Falls back to 'default' if the session_policy column isn't deployed yet.
  let policy: SessionPolicy = 'default';
  try {
    const policyR = await pool.query(
      `SELECT COALESCE(session_policy, 'default') AS policy FROM staff WHERE id = $1`,
      [opts.staffId],
    );
    policy = (policyR.rows[0]?.policy ?? 'default') as SessionPolicy;
  } catch {
    policy = 'default';
  }
  const persistent = opts.persistent === true;
  const { expiresAt } = resolveSessionExpiry({
    deviceKind: opts.deviceKind,
    policy,
    persistent,
    shiftEndsAt: opts.expiresAt ?? null,
  });

  // staff_sessions.organization_id is derived from staff.organization_id at
  // insert time so the session inherits the tenant the staff currently
  // belongs to. When org-switching lands this will become a parameter.
  const r = await pool.query(
    `INSERT INTO staff_sessions (sid, staff_id, organization_id, device_kind, device_label, ip, user_agent, expires_at, persistent)
     SELECT $1, $2, st.organization_id, $3, $4, $5::inet, $6, $7, $8
       FROM staff st
      WHERE st.id = $2
     RETURNING sid, staff_id, organization_id, device_kind, device_label, ip::text AS ip, user_agent,
               created_at, last_seen_at, expires_at, revoked_at, persistent`,
    [sid, opts.staffId, opts.deviceKind, opts.deviceLabel ?? null, opts.ip ?? null, opts.userAgent ?? null, expiresAt, persistent],
  );
  const row = r.rows[0] as SessionDbRow | undefined;
  if (!row) {
    throw new Error(`createSession: staff ${opts.staffId} not found`);
  }

  // Enforce the org's maxConcurrentSessions cap (0 = unlimited). Best-effort:
  // a failure here must never break sign-in. The just-created session is the
  // newest, so trimming revokes the OLDEST devices, never this one.
  try {
    const settingsR = await pool.query<{ settings: unknown }>(
      `SELECT o.settings FROM staff st JOIN organizations o ON o.id = st.organization_id WHERE st.id = $1`,
      [opts.staffId],
    );
    const limit = parseOrgSettings(settingsR.rows[0]?.settings).maxConcurrentSessions;
    if (limit > 0) {
      await enforceMaxConcurrentSessions(opts.staffId, limit, defaultConcurrencyDeps);
    }
  } catch {
    /* swallow — session already created; concurrency trim is best-effort */
  }

  return {
    sid: row.sid,
    staffId: row.staff_id,
    organizationId: row.organization_id,
    deviceKind: row.device_kind,
    deviceLabel: row.device_label,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    persistent: row.persistent,
  };
}

/**
 * Load a session by sid. Returns null if missing, revoked, expired, or idle
 * past its device's window. On a successful load, also touches last_seen_at.
 *
 * Keep this hot path lean — middleware calls it on every request.
 */
export async function loadSession(sid: string | null | undefined): Promise<SessionRow | null> {
  if (!sid || typeof sid !== 'string' || sid.length < 32) return null;

  const r = await pool.query(
    `SELECT s.sid, s.staff_id, s.organization_id, s.device_kind, s.device_label,
            s.ip::text AS ip, s.user_agent,
            s.created_at, s.last_seen_at, s.expires_at, s.revoked_at,
            COALESCE(s.persistent, false) AS persistent,
            COALESCE(st.session_policy, 'default') AS session_policy
       FROM staff_sessions s
       LEFT JOIN staff st ON st.id = s.staff_id
      WHERE s.sid = $1
      LIMIT 1`,
    [sid],
  );
  const row = r.rows[0] as (SessionDbRow & { session_policy: SessionPolicy }) | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at.getTime() <= Date.now()) return null;

  const window = resolveSessionWindow(row.device_kind as DeviceKind, row.session_policy, row.persistent);
  const idleFor = Date.now() - row.last_seen_at.getTime();
  if (Number.isFinite(window.idleMs) && idleFor > window.idleMs) {
    // Auto-revoke on idle so the row reflects the truth.
    await pool.query(`UPDATE staff_sessions SET revoked_at = NOW() WHERE sid = $1`, [sid]);
    return null;
  }

  return {
    sid: row.sid,
    staffId: row.staff_id,
    organizationId: row.organization_id,
    deviceKind: row.device_kind,
    deviceLabel: row.device_label,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    persistent: row.persistent,
  };
}

/**
 * Diagnostic variant of loadSession — returns the same row plus a `reason`
 * tag explaining why a null was produced. Used by /api/auth/session to
 * surface a `x-auth-debug` header so we can tell at a glance whether a
 * sign-out was caused by missing cookie, idle timeout, revocation, etc.
 *
 * Side-effect parity: still auto-revokes on idle, exactly like loadSession.
 */
export type SessionNullReason =
  | 'no-cookie'
  | 'sid-malformed'
  | 'no-row'
  | 'revoked'
  | 'expired'
  | 'idle-timed-out'
  | 'db-error';

export async function loadSessionWithReason(
  sid: string | null | undefined,
): Promise<{ session: SessionRow | null; reason: SessionNullReason | 'ok' }> {
  if (!sid) return { session: null, reason: 'no-cookie' };
  if (typeof sid !== 'string' || sid.length < 32) {
    return { session: null, reason: 'sid-malformed' };
  }

  let r;
  try {
    r = await pool.query(
      `SELECT s.sid, s.staff_id, s.organization_id, s.device_kind, s.device_label,
              s.ip::text AS ip, s.user_agent,
              s.created_at, s.last_seen_at, s.expires_at, s.revoked_at,
              COALESCE(s.persistent, false) AS persistent,
              COALESCE(st.session_policy, 'default') AS session_policy
         FROM staff_sessions s
         LEFT JOIN staff st ON st.id = s.staff_id
        WHERE s.sid = $1
        LIMIT 1`,
      [sid],
    );
  } catch {
    return { session: null, reason: 'db-error' };
  }

  const row = r.rows[0] as (SessionDbRow & { session_policy: SessionPolicy }) | undefined;
  if (!row) return { session: null, reason: 'no-row' };
  if (row.revoked_at) return { session: null, reason: 'revoked' };
  if (row.expires_at.getTime() <= Date.now()) return { session: null, reason: 'expired' };

  const window = resolveSessionWindow(row.device_kind as DeviceKind, row.session_policy, row.persistent);
  const idleFor = Date.now() - row.last_seen_at.getTime();
  if (Number.isFinite(window.idleMs) && idleFor > window.idleMs) {
    await pool.query(`UPDATE staff_sessions SET revoked_at = NOW() WHERE sid = $1`, [sid]);
    return { session: null, reason: 'idle-timed-out' };
  }

  return {
    session: {
      sid: row.sid,
      staffId: row.staff_id,
      organizationId: row.organization_id,
      deviceKind: row.device_kind,
      deviceLabel: row.device_label,
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      persistent: row.persistent,
    },
    reason: 'ok',
  };
}

/**
 * Bump last_seen_at and return the session's (possibly slid) expires_at so
 * the caller can refresh the cookie's max-age to match. Best-effort; failure
 * must not break the request, so it resolves to null on error.
 *
 * Called from the /api/auth/session heartbeat after a successful loadSession.
 */
export async function touchSession(sid: string): Promise<Date | null> {
  try {
    // For a persistent session — whether from the staff's policy or from
    // "Keep me signed in" on this device — slide expires_at forward so it
    // never crosses its absolute window as long as they keep using it.
    // Default/extended policies leave expires_at alone — absolute window is
    // a hard ceiling for them.
    const persistentMs = PERSISTENT_WINDOW.absoluteMs;
    const r = await pool.query(
      `UPDATE staff_sessions s
          SET last_seen_at = NOW(),
              expires_at = CASE
                WHEN COALESCE(s.persistent, false)
                  OR COALESCE(st.session_policy, 'default') = 'persistent'
                  THEN NOW() + ($2 || ' milliseconds')::INTERVAL
                ELSE s.expires_at
              END
         FROM staff st
        WHERE s.sid = $1
          AND s.revoked_at IS NULL
          AND st.id = s.staff_id
      RETURNING s.expires_at`,
      [sid, String(persistentMs)],
    );
    return (r.rows[0] as { expires_at: Date } | undefined)?.expires_at ?? null;
  } catch {
    // swallow
    return null;
  }
}

export async function revokeSession(sid: string): Promise<void> {
  await pool.query(`UPDATE staff_sessions SET revoked_at = NOW() WHERE sid = $1 AND revoked_at IS NULL`, [sid]);
}

export async function revokeAllSessionsForStaff(staffId: number): Promise<number> {
  const r = await pool.query(
    `UPDATE staff_sessions SET revoked_at = NOW() WHERE staff_id = $1 AND revoked_at IS NULL`,
    [staffId],
  );
  return r.rowCount ?? 0;
}

export async function listActiveSessions(staffId: number): Promise<SessionRow[]> {
  const r = await pool.query(
    `SELECT sid, staff_id, organization_id, device_kind, device_label, ip::text AS ip, user_agent,
            created_at, last_seen_at, expires_at, revoked_at, persistent
       FROM staff_sessions
      WHERE staff_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_seen_at DESC`,
    [staffId],
  );
  return (r.rows as SessionDbRow[]).map((row) => ({
    sid: row.sid,
    staffId: row.staff_id,
    organizationId: row.organization_id,
    deviceKind: row.device_kind,
    deviceLabel: row.device_label,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    persistent: row.persistent,
  }));
}
