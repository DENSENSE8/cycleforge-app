/**
 * Kiosk API route wrapper — the device-principal sibling of `withAuth`.
 * UNPAIRED IS A NON-STATE OUTSIDE PRODUCTION (operator 2026-09-14): the
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
  /** Issue THIS client's dogfood device for a tokenless dev request, returning the raw token so the wrapper can pin it as `cf_kiosk` on the… */
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
