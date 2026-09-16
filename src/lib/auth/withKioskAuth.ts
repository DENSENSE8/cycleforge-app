/**
 * Kiosk API route wrapper — the device-principal sibling of `withAuth`.
 *
 *   export const POST = withKioskAuth(async (req, ctx) => { ... });
 *
 * The handler receives a `KioskAuthContext` — `{ organizationId, principal:
 * 'kiosk', deviceId }` — resolved from the `cf_kiosk` device token, NEVER a
 * `staffId`.
 *
 * UNPAIRED IS A NON-STATE OUTSIDE PRODUCTION (operator 2026-09-14): the
 * pairing gate existed to enroll real counter tablets; in dev/test it only
 * produced races — a lost `cf_kiosk` cookie painted `KIOSK_UNPAIRED` banners
 * mid-iterate. Now the FIRST kiosk API call with no valid device binds the
 * dogfood device (org #1, same issuance as `/api/kiosk/dev-autopair`) and
 * proceeds — `withKioskAuth` never blocks iteration. Production keeps the
 * 401 enrollment contract untouched, so a REVOKED tablet stays dead there; a
 * dogfood surface on production re-binds through `/api/kiosk/dev-autopair`
 * (`healKioskBinding`) instead of through this gate.
 *
 * The re-bind is keyed by the durable `cf_kiosk_client` id, so it rotates only
 * THIS client's device row. Sharing one dogfood row was what made two dogfood
 * surfaces (production + localhost) evict each other into `KIOSK_UNPAIRED`.
 *
 * `deps` is injectable (defaulting to the real DB-backed resolver) so unit
 * tests exercise device-principal resolution and scope denial with zero DB —
 * the house `Deps`-injection pattern (see backend-patterns.md).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dogfoodKioskDeviceLabel,
  issueActiveKioskDeviceToken,
  loadKioskDeviceByToken,
  newKioskClientId,
  readKioskClientId,
  readKioskToken,
  setKioskCookies,
  type ResolvedKioskDevice,
} from './kiosk-device';
import type { KioskAuthContext } from './kiosk-context';

/** Org #1 — dogfood tenant UUID. Literal to mirror `/api/kiosk/dev-autopair`. */
const ORG_ONE = '00000000-0000-0000-0000-000000000001';

export interface KioskAuthDeps {
  /** Resolve a raw device token to its org + id, or null when missing/revoked/unpaired. */
  loadDevice: (token: string | null) => Promise<ResolvedKioskDevice | null>;
  /**
   * Issue THIS client's dogfood device for a tokenless dev request, returning
   * the raw token so the wrapper can pin it as `cf_kiosk` on the response.
   * Injectable so tests can pin the production 401 posture; only consulted when
   * NODE_ENV is not production.
   */
  devAutobind?: (clientId: string) => Promise<{ device: ResolvedKioskDevice; token: string } | null>;
  /** Test seam for the NODE_ENV gate (defaults to the real environment). */
  isProduction?: () => boolean;
}

const defaultDeps: KioskAuthDeps = {
  loadDevice: (token) => loadKioskDeviceByToken(token),
  devAutobind: async (clientId) => {
    try {
      // Same label as /api/kiosk/dev-autopair — this CLIENT's stable dogfood
      // row is REUSED (token reissued), so a stream of tokenless dev requests
      // neither grows kiosk_devices nor disturbs another surface's device.
      const issued = await issueActiveKioskDeviceToken(
        ORG_ONE,
        dogfoodKioskDeviceLabel(clientId),
      );
      return {
        device: {
          organizationId: issued.organizationId,
          deviceId: issued.deviceId,
          label: issued.label,
        },
        token: issued.token,
      };
    } catch {
      // Issuance itself failing (DB down, org absent) falls through to 401 —
      // the gate stays honest instead of masking a real outage.
      return null;
    }
  },
  isProduction: () => process.env.NODE_ENV === 'production',
};

type KioskHandler = (req: NextRequest, ctx: KioskAuthContext) => Promise<Response> | Response;
type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response> | Response;

export function withKioskAuth(
  handler: KioskHandler,
  deps: KioskAuthDeps = defaultDeps,
): RouteHandler {
  return async (req, _routeCtx) => {
    const token = readKioskToken(req);
    let device = await deps.loadDevice(token);
    let boundToken: string | null = null;
    let boundClientId: string | null = null;
    if (!device && !(deps.isProduction?.() ?? false)) {
      // Dev/test: never strand the surface on a pairing race — bind THIS
      // client's dogfood device in place (same row /api/kiosk/dev-autopair
      // issues for this `cf_kiosk_client`) and keep the request moving.
      const clientId = readKioskClientId(req) ?? newKioskClientId();
      const bound = (await deps.devAutobind?.(clientId)) ?? null;
      if (bound) {
        device = bound.device;
        boundToken = bound.token;
        boundClientId = clientId;
      }
    }
    if (!device) {
      // Production, or issuance failed → the tablet must (re-)enroll. Distinct
      // code so the kiosk client can route to the pairing screen, not /signin.
      return NextResponse.json({ error: 'KIOSK_UNPAIRED' }, { status: 401 });
    }

    let auditWritten = false;
    const ctx: KioskAuthContext = {
      organizationId: device.organizationId,
      principal: 'kiosk',
      deviceId: device.deviceId,
      deviceLabel: device.label,
      markAuditWritten: () => { auditWritten = true; },
    };
    void auditWritten; // reserved for a future audit floor; kept symmetric with withAuth

    // Top-level error floor mirroring withAuth: an uncaught throw returns JSON
    // (with stack in non-prod) instead of Next's bodyless 500.
    try {
      const res = await handler(req, ctx);
      if (boundToken && res instanceof NextResponse) {
        // Pin the binding so later requests arrive already paired — including
        // the client id, or the next re-bind would mint a second row.
        setKioskCookies(res, { token: boundToken, clientId: boundClientId ?? undefined });
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const pgCode = (err as { code?: string } | null)?.code;
      console.error(`[withKioskAuth] ${req.method} ${req.nextUrl.pathname} threw:`, err);
      const payload: Record<string, unknown> = { error: 'INTERNAL', message };
      if (pgCode) payload.code = pgCode;
      if (process.env.NODE_ENV !== 'production' && stack) payload.stack = stack;
      return NextResponse.json(payload, { status: 500 });
    }
  };
}
