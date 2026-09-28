/** API route wrapper. */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserBySid } from './current-user';
import { readSessionSid, readV1BearerSid, V1_API_PREFIX } from './session';
import { v1Error, type V1ErrorCode } from '@/lib/api/v1-route';
import { hasStepUp } from './stepup';
import { requiresStepUp, rolesIncludeAdmin, type PermissionString } from './permissions';
import { shouldRequireStepUp } from './authorization-mode';
import { audit } from './audit';
import pool from '@/lib/db';
import { recordAudit } from '@/lib/audit-logs';
import { recordProspectiveStrictDenial } from './strict-rehearsal';
import { isTrialBlocked } from '@/lib/billing/trial-gate';
import { isFeatureGated } from '@/lib/billing/feature-gate';
import type { EntitlementFeature } from '@/lib/billing/feature-gate';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { captureError } from '@/lib/observability/errors';

/** Auth context handed to wrapped route handlers. */
import type { AuthContext, AnonymousAuthContext } from './auth-context';
export type { AuthContext, AnonymousAuthContext } from './auth-context';

/** Audit-floor config. */
interface WithAuthAuditOpts {
  source: string;
  action: string;
  entityType: string;
  entityId: (args: {
    body: unknown;
    response: unknown;
    req: NextRequest;
  }) => string | number | null;
  /** Extra metadata merged into the audit row. Optional. */
  extra?: (args: { body: unknown; response: unknown }) => Record<string, unknown>;
}

interface WithAuthOpts {
  permission?: PermissionString;
  /** Explicit security-critical re-authentication; enforced in every authorization mode. */
  stepUp?: boolean;
  /** Allow unauthenticated calls; handlers must still enforce their independent signature or input contract. */
  allowAnonymous?: boolean;
  /** Write a baseline `audit_logs` row on 2xx. Handler can opt out via `ctx.markAuditWritten()`. */
  audit?: WithAuthAuditOpts;
  /** Plan-entitlement gate. */
  feature?: EntitlementFeature;
}

type ApiHandler = (req: NextRequest, ctx: AuthContext) => Promise<Response> | Response;
type AnonymousApiHandler = (req: NextRequest, ctx: AnonymousAuthContext) => Promise<Response> | Response;
// Match Next's RouteHandlerConfig — second arg is a route context with
// `params` as a Promise. We ignore it in the wrapper; downstream handlers
// that need [id]-style params parse `req.nextUrl.pathname` instead.
type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };
type Refuse = (
  status: number,
  code: V1ErrorCode,
  message: string,
  legacy: Record<string, unknown>,
  init?: { extra?: Record<string, unknown>; headers?: Record<string, string> },
) => Response;
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response> | Response;

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const real = req.headers.get('x-real-ip');
  return real || null;
}

/** Inbound correlation ids are echoed only when they look like an id (no header injection, bounded length). */
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

function requestIdFor(req: NextRequest): string {
  const incoming = req.headers.get('x-request-id');
  return incoming && REQUEST_ID_RE.test(incoming) ? incoming : safeRandomUUID();
}

/** Stamp `x-request-id` on any response; immutable-header responses (Response.redirect, proxied fetches) are rewrapped. */
function withRequestId(res: Response, requestId: string): Response {
  try {
    res.headers.set('x-request-id', requestId);
    return res;
  } catch {
    const headers = new Headers(res.headers);
    headers.set('x-request-id', requestId);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

/**
 * Best-effort JSON parse of a cloned request/response. Returns null on
 * empty body or parse error — callers always handle null.
 */
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

/**
 * Write a baseline audit row after a wrapped handler resolves with 2xx.
 * Errors are swallowed — audit must never break the request response.
 */
async function writeAuditFloor(
  req: NextRequest,
  reqClone: Request | null,
  responseClone: Response,
  ctx: AuthContext | AnonymousAuthContext,
  audit: WithAuthAuditOpts,
): Promise<void> {
  try {
    // The wrapper holds clones of both streams so the handler's reads aren't disturbed.
    const [body, response] = await Promise.all([
      tryReadJson(reqClone),
      tryReadJson(responseClone),
    ]);

    const entityId = audit.entityId({ body, response, req });
    if (entityId == null || entityId === '') return;

    await recordAudit(pool, ctx, req, {
      source: audit.source,
      action: audit.action,
      entityType: audit.entityType,
      entityId,
      method: 'system',
      extra: {
        authorizationMode: ctx.authorizationMode,
        ...(audit.extra ? audit.extra({ body, response }) : {}),
      },
    });
  } catch (err) {
    // Don't propagate — audit floor is best-effort.
    console.warn(
      '[withAuth.audit] floor write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

// Overloads so TS narrows `ctx` based on `allowAnonymous`. Authenticated
// routes get `AuthContext` (staffId: number); anonymous-permitted routes get
// `AnonymousAuthContext` (staffId: number | null) and must null-check user.
export function withAuth(
  handler: AnonymousApiHandler,
  opts: WithAuthOpts & { allowAnonymous: true },
): RouteHandler;
export function withAuth(handler: ApiHandler, opts?: WithAuthOpts): RouteHandler;
export function withAuth(
  handler: ApiHandler | AnonymousApiHandler,
  opts: WithAuthOpts = {},
): RouteHandler {
  return async (req, _routeCtx) => {
    // Every response carries a correlation id: the caller's (if well-formed) or a fresh one.
    const requestId = requestIdFor(req);
    // `/api/v1` answers every refusal in its `{ error: { code, message } }` envelope;
    // the web routes keep their existing bodies.
    const isV1 = req.nextUrl.pathname.startsWith(V1_API_PREFIX);
    const refuse: Refuse = (status, code, message, legacy, init = {}) =>
      isV1 ? v1Error(status, code, message, init) : NextResponse.json(legacy, { status, headers: init.headers });
    // Filled in as soon as the session resolves so an error report carries the tenant.
    const scope: {
      orgId: string | null;
      staffId: number | null;
      authorizationMode: AuthContext['authorizationMode'] | null;
    } = { orgId: null, staffId: null, authorizationMode: null };

    let response: Response;
    try {
      response = await handle(req, refuse, scope);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      // Postgres errors carry .code; surface it so callers can branch.
      const pgCode = (err as { code?: string } | null)?.code;
      captureError(err, {
        requestId,
        route: `${req.method} ${req.nextUrl.pathname}`,
        orgId: scope.orgId,
        staffId: scope.staffId,
        vercelId: req.headers.get('x-vercel-id'),
        authorizationMode: scope.authorizationMode,
        ...(pgCode ? { pgCode } : {}),
      });
      // The legacy body carries the raw message and stack outside production; v1 never
      // does — native clients get the request id to quote and nothing internal.
      const payload: Record<string, unknown> = { error: 'INTERNAL', requestId };
      if (process.env.NODE_ENV !== 'production') {
        payload.message = message;
        if (pgCode) payload.code = pgCode;
        if (stack) payload.stack = stack;
      }
      response = refuse(500, 'INTERNAL', 'Something went wrong on our side.', payload, {
        extra: { requestId },
      });
    }
    return withRequestId(response, requestId);
  };

  async function handle(
    req: NextRequest,
    refuse: Refuse,
    scope: {
      orgId: string | null;
      staffId: number | null;
      authorizationMode: AuthContext['authorizationMode'] | null;
    },
  ): Promise<Response> {
    // A cookie sid loads only cookie sessions and a header sid only bearer sessions
    // (staff_sessions.credential). A stale cookie in a native HTTP stack must not mask a valid bearer.
    const cookieSid = readSessionSid(req.cookies);
    const bearerSid = readV1BearerSid(req.nextUrl.pathname, req.headers);
    const user =
      (cookieSid ? await getCurrentUserBySid(cookieSid, 'cookie') : null) ??
      (bearerSid ? await getCurrentUserBySid(bearerSid, 'bearer') : null);
    if (user) {
      scope.orgId = user.organizationId;
      scope.staffId = user.staffId;
      scope.authorizationMode = user.authorizationMode;
    }

    // Hidden flag toggled by `ctx.markAuditWritten()`. We don't put it on
    // the ctx itself because it shouldn't be observable by handlers.
    let auditWritten = false;
    const markAuditWritten = () => { auditWritten = true; };

    if (!user) {
      if (!opts.allowAnonymous) {
        return refuse(401, 'UNAUTHENTICATED', 'Sign in required.', { error: 'UNAUTHENTICATED' });
      }
      // Anonymous route: hand the handler an empty context.
      const ctx: AnonymousAuthContext = {
        user: null,
        session: null,
        staffId: null,
        organizationId: null,
        role: null,
        permissions: new Set(),
        authorizationMode: null,
        storedPermissions: new Set(),
        can: () => false,
        markAuditWritten,
      };
      return (handler as AnonymousApiHandler)(req, ctx);
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
      markAuditWritten,
    };

    if (opts.permission) {
      await recordProspectiveStrictDenial(pool, ctx, req, opts.permission);
    }

    if (opts.permission && !user.permissions.has(opts.permission)) {
      await audit({
        staffId: user.staffId,
        event: 'permission.denied',
        result: 'denied',
        sid: user.session.sid,
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent'),
        detail: { permission: opts.permission, api: true, path: req.nextUrl.pathname },
      });
      return refuse(
        403,
        'FORBIDDEN',
        `Missing permission ${opts.permission}.`,
        { error: 'FORBIDDEN', permission: opts.permission, role: user.role },
        { extra: { permission: opts.permission } },
      );
    }

    // Admins are exempt from step-up (PIN / passkey) on destructive actions.
    // They already hold every permission; requiring a re-auth prompt on top of
    // that is friction the product doesn't want for the admin tier.
    const isAdmin = rolesIncludeAdmin(user.roles);
    const needsStepUp = shouldRequireStepUp({
      mode: user.authorizationMode,
      isAdmin,
      explicit: opts.stepUp === true,
      permissionRequiresStepUp: opts.permission ? requiresStepUp(opts.permission) : false,
    });
    if (needsStepUp) {
      const scope = opts.permission ?? 'destructive';
      const granted = await hasStepUp(user.session.sid, scope);
      if (!granted) {
        return refuse(
          403,
          'STEPUP_REQUIRED',
          'Confirm with your PIN to continue.',
          { error: 'STEPUP_REQUIRED', scope, method_hint: 'pin' },
          { extra: { scope } },
        );
      }
    }

    // Trial-expiry gate — OFF by default (TRIAL_ENFORCEMENT).
    if (await isTrialBlocked(user.organizationId, req.nextUrl.pathname)) {
      return refuse(402, 'TRIAL_EXPIRED', 'Subscribe at /settings/billing to continue.', {
        error: 'TRIAL_EXPIRED',
        hint: 'Subscribe at /settings/billing to continue.',
      });
    }

    // Plan-entitlement gate — OFF by default.
    if (opts.feature && (await isFeatureGated(opts.feature, user.organizationId))) {
      return refuse(
        403,
        'FEATURE_GATED',
        `Your plan does not include ${opts.feature}.`,
        { ok: false, error: 'FEATURE_GATED', feature: opts.feature, upgrade: true },
        { extra: { feature: opts.feature } },
      );
    }


    // Clone the request body up front so the audit floor can replay it after
    // the handler has consumed `req.json()`. Done lazily — only routes that
    // configured `audit:` pay the buffering cost.
    const reqClone = opts.audit ? req.clone() : null;

    // Handler throws propagate to the wrapper's error floor (captureError + 500 with the request id).
    const response = opts.allowAnonymous
      ? await (handler as AnonymousApiHandler)(req, ctx)
      : await (handler as ApiHandler)(req, ctx);

    // Audit floor: only on 2xx and when the handler didn't write its own rich
    // row. Await it so serverless runtimes cannot freeze the invocation before
    // the security record is flushed; writeAuditFloor remains fail-open.
    if (
      opts.audit &&
      !auditWritten &&
      response.status >= 200 &&
      response.status < 300
    ) {
      const responseClone = response.clone();
      await writeAuditFloor(req, reqClone, responseClone, ctx, opts.audit);
    }

    return response;
  }
}
