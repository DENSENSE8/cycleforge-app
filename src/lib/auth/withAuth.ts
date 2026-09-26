/** API route wrapper. */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserBySid } from './current-user';
import { readSessionSid } from './session';
import { hasStepUp } from './stepup';
import { requiresStepUp, rolesIncludeAdmin, type PermissionString } from './permissions';
import { audit } from './audit';
import pool from '@/lib/db';
import { recordAudit } from '@/lib/audit-logs';
import { isTrialBlocked } from '@/lib/billing/trial-gate';
import { isFeatureGated } from '@/lib/billing/feature-gate';
import type { EntitlementFeature } from '@/lib/billing/feature-gate';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** Auth context handed to wrapped route handlers. */
import type { AuthContext, AnonymousAuthContext } from './auth-context';
export type { AuthContext, AnonymousAuthContext } from './auth-context';

/** Audit-floor config. */
export interface WithAuthAuditOpts {
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

export interface WithAuthOpts {
  permission?: PermissionString;
  stepUp?: boolean;
  /** Allow unauthenticated calls (for /api/auth/signin itself, /api/health, webhook routes with their own signature gate, etc). */
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
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response> | Response;

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const real = req.headers.get('x-real-ip');
  return real || null;
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
      extra: audit.extra ? audit.extra({ body, response }) : undefined,
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
    const sid = readSessionSid(req.cookies);
    const user = await getCurrentUserBySid(sid);

    // Hidden flag toggled by `ctx.markAuditWritten()`. We don't put it on
    // the ctx itself because it shouldn't be observable by handlers.
    let auditWritten = false;
    const markAuditWritten = () => { auditWritten = true; };

    if (!user) {
      if (!opts.allowAnonymous) {
        return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
      }
      // Anonymous route: hand the handler an empty context.
      const ctx: AnonymousAuthContext = {
        user: null,
        session: null,
        staffId: null,
        organizationId: null,
        role: null,
        permissions: new Set(),
        markAuditWritten,
      };
      return (handler as AnonymousApiHandler)(req, ctx);
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
      return NextResponse.json(
        { error: 'FORBIDDEN', permission: opts.permission, role: user.role },
        { status: 403 },
      );
    }

    // Admins are exempt from step-up (PIN / passkey) on destructive actions.
    // They already hold every permission; requiring a re-auth prompt on top of
    // that is friction the product doesn't want for the admin tier.
    const isAdmin = rolesIncludeAdmin(user.roles);
    const needsStepUp =
      !isAdmin && (opts.stepUp || (opts.permission ? requiresStepUp(opts.permission) : false));
    if (needsStepUp) {
      const scope = opts.permission ?? 'destructive';
      const granted = await hasStepUp(user.session.sid, scope);
      if (!granted) {
        return NextResponse.json(
          { error: 'STEPUP_REQUIRED', scope, method_hint: 'pin' },
          { status: 403 },
        );
      }
    }

    // Trial-expiry gate — OFF by default (TRIAL_ENFORCEMENT).
    if (await isTrialBlocked(user.organizationId, req.nextUrl.pathname)) {
      return NextResponse.json(
        { error: 'TRIAL_EXPIRED', hint: 'Subscribe at /settings/billing to continue.' },
        { status: 402 },
      );
    }

    // Plan-entitlement gate — OFF by default.
    if (opts.feature && (await isFeatureGated(opts.feature, user.organizationId))) {
      return NextResponse.json(
        { ok: false, error: 'FEATURE_GATED', feature: opts.feature, upgrade: true },
        { status: 403 },
      );
    }

    const ctx: AuthContext = {
      user,
      session: user.session,
      staffId: user.staffId,
      organizationId: user.organizationId,
      role: user.role,
      permissions: user.permissions,
      markAuditWritten,
    };

    // Clone the request body up front so the audit floor can replay it after
    // the handler has consumed `req.json()`. Done lazily — only routes that
    // configured `audit:` pay the buffering cost.
    const reqClone = opts.audit ? req.clone() : null;

    // Top-level error floor:
    let response: Response;
    try {
      response = opts.allowAnonymous
        ? await (handler as AnonymousApiHandler)(req, ctx)
        : await (handler as ApiHandler)(req, ctx);
    } catch (err) {
      const requestId = safeRandomUUID();
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      // Postgres errors carry .code; surface it so callers can branch.
      const pgCode = (err as { code?: string } | null)?.code;
      console.error(
        `[withAuth:${requestId}] ${req.method} ${req.nextUrl.pathname} threw:`,
        err,
      );
      const payload: Record<string, unknown> = { error: 'INTERNAL', requestId };
      if (process.env.NODE_ENV !== 'production') {
        payload.message = message;
        if (pgCode) payload.code = pgCode;
        if (stack) payload.stack = stack;
      }
      return NextResponse.json(payload, {
        status: 500,
        headers: { 'x-request-id': requestId },
      });
    }

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
  };
}
