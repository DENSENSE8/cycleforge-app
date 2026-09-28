/** Per-handler auth gate for routes whose signature requires Next's typed `{ params }` second arg (dynamic segments like `[id]`, `[barcode]`). */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { AuthContext } from '@/lib/auth/withAuth';
import { getCurrentUserBySid } from '@/lib/auth/current-user';
import { readSessionSid } from '@/lib/auth/session';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import { requiresStepUp, rolesIncludeAdmin } from '@/lib/auth/permissions';
import { shouldRequireStepUp } from '@/lib/auth/authorization-mode';
import { hasStepUp } from '@/lib/auth/stepup';
import { audit } from '@/lib/auth/audit';
import { recordAudit } from '@/lib/audit-logs';
import { recordProspectiveStrictDenial } from '@/lib/auth/strict-rehearsal';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const real = req.headers.get('x-real-ip');
  return real || null;
}

type RouteGuardResult =
  | { denied: NextResponse; ctx: null }
  | { denied: null; ctx: AuthContext };

export async function requireRoutePerm(
  req: NextRequest,
  perm: PermissionString,
): Promise<RouteGuardResult> {
  const sid = readSessionSid(req.cookies);
  const user = await getCurrentUserBySid(sid);

  if (!user) {
    return {
      denied: NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
      ctx: null,
    };
  }

  const ctx: AuthContext = {
    user,
    session: user.session,
    staffId: user.staffId,
    organizationId: user.organizationId,
    role: user.role,
    permissions: user.permissions,
    authorizationMode: user.authorizationMode,
    storedPermissions: user.storedPermissions,
    can: (permission) => user.permissions.has(permission),
    // Dynamic-param routes have no wrapper audit floor.
    markAuditWritten: () => {},
  };

  await recordProspectiveStrictDenial(pool, ctx, req, perm);

  if (!user.permissions.has(perm)) {
    await audit({
      staffId: user.staffId,
      event: 'permission.denied',
      result: 'denied',
      sid: user.session.sid,
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent'),
      detail: { permission: perm, api: true, path: req.nextUrl.pathname },
    });
    return {
      denied: NextResponse.json(
        { error: 'FORBIDDEN', permission: perm, role: user.role },
        { status: 403 },
      ),
      ctx: null,
    };
  }

  const isAdmin = rolesIncludeAdmin(user.roles);
  if (shouldRequireStepUp({
    mode: user.authorizationMode,
    isAdmin,
    explicit: false,
    permissionRequiresStepUp: requiresStepUp(perm),
  })) {
    const granted = await hasStepUp(user.session.sid, perm);
    if (!granted) {
      return {
        denied: NextResponse.json(
          { error: 'STEPUP_REQUIRED', scope: perm, method_hint: 'pin' },
          { status: 403 },
        ),
        ctx: null,
      };
    }
  }

  return { denied: null, ctx };
}

/** Audit-floor for dynamic-param routes. */
interface RouteAuditOpts {
  source: string;
  action: string;
  entityType: string;
  entityId: (args: {
    body: unknown;
    response: unknown;
    req: NextRequest;
  }) => string | number | null;
  extra?: (args: { body: unknown; response: unknown }) => Record<string, unknown>;
}

async function tryReadJson(input: Request | Response | null): Promise<unknown> {
  if (!input) return null;
  try {
    const text = await input.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function recordRouteAudit(
  req: NextRequest,
  ctx: AuthContext,
  response: Response,
  opts: RouteAuditOpts,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return;
  try {
    const [body, parsedResponse] = await Promise.all([
      tryReadJson(req.clone()),
      tryReadJson(response.clone()),
    ]);
    const entityId = opts.entityId({ body, response: parsedResponse, req });
    if (entityId == null || entityId === '') return;
    await recordAudit(pool, ctx, req, {
      source: opts.source,
      action: opts.action,
      entityType: opts.entityType,
      entityId,
      method: 'system',
      extra: {
        authorizationMode: ctx.authorizationMode,
        ...(opts.extra ? opts.extra({ body, response: parsedResponse }) : {}),
      },
    });
  } catch (err) {
    console.warn(
      '[recordRouteAudit] write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
