/**
 * Kiosk API route wrapper — the device-principal sibling of `withAuth`.
 *
 *   export const POST = withKioskAuth(async (req, ctx) => { ... });
 *
 * The handler receives a `KioskAuthContext` — `{ organizationId, principal:
 * 'kiosk', deviceId }` — resolved from the `cf_kiosk` device token, NEVER a
 * `staffId`. A request with no valid, active device token is refused with 401.
 * The device principal can create an intake for its own org and nothing else;
 * it cannot reach any staff surface.
 *
 * `deps` is injectable (defaulting to the real DB-backed resolver) so unit
 * tests exercise device-principal resolution and scope denial with zero DB —
 * the house `Deps`-injection pattern (see backend-patterns.md).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadKioskDeviceByToken, readKioskToken, type ResolvedKioskDevice } from './kiosk-device';
import type { KioskAuthContext } from './kiosk-context';

export interface KioskAuthDeps {
  /** Resolve a raw device token to its org + id, or null when missing/revoked/unpaired. */
  loadDevice: (token: string | null) => Promise<ResolvedKioskDevice | null>;
}

const defaultDeps: KioskAuthDeps = {
  loadDevice: (token) => loadKioskDeviceByToken(token),
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
    const device = await deps.loadDevice(token);
    if (!device) {
      // No paired/active device → the tablet must (re-)enroll. Distinct code so
      // the kiosk client can route to the pairing screen rather than /signin.
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
      return await handler(req, ctx);
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
