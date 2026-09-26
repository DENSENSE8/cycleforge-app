import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { createSession, revokeSession } from '@/lib/auth/session';
import { authenticateAccountPassword, recordAccountSignin } from '@/lib/identity/account-signin';
import { v1SessionCreateBodySchema } from '@/lib/auth/v1-session-contract';
import { readV1Json, v1Data, v1Error } from '@/lib/api/v1-route';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

/** POST /api/v1/session — email + password → bearer token for a native client. Public (proxy PUBLIC_PATHS). */
export async function POST(req: NextRequest) {
  const parsed = await readV1Json(req, v1SessionCreateBodySchema, 'Invalid sign-in body.');
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');

  const result = await authenticateAccountPassword({
    headers: req.headers,
    email: body.email,
    password: body.password,
    workspaceSlug: body.workspace,
    ip,
    userAgent: ua,
  });
  switch (result.kind) {
    case 'rate_limited':
      return v1Error(429, 'RATE_LIMITED', 'Too many sign-in attempts.', {
        headers: result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : undefined,
      });
    case 'invalid_credentials':
      return v1Error(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    case 'account_not_active':
      return v1Error(403, 'ACCOUNT_NOT_ACTIVE', 'This account is not active.');
    case 'no_workspace':
      return v1Error(403, 'NO_WORKSPACE', 'This account has no workspace.');
    case 'not_member':
      return v1Error(403, 'NOT_A_MEMBER', 'Not a member of that workspace.');
    case 'needs_org_choice':
      return v1Error(409, 'ORG_CHOICE_REQUIRED', 'Choose a workspace and sign in again with its slug as `workspace`.', {
        extra: { workspaces: result.memberships.map((m) => ({ slug: m.organizationSlug, name: m.organizationName })) },
      });
    case 'ok':
      break;
  }

  const session = await createSession({
    staffId: result.target.staff_id,
    deviceKind: body.deviceKind,
    deviceLabel: body.deviceLabel ?? null,
    ip,
    userAgent: ua,
    persistent: body.persistent === true,
    credential: 'bearer',
  });
  await recordAccountSignin({
    accountId: result.accountId,
    target: result.target,
    session,
    event: 'signin.v1',
    ip,
    userAgent: ua,
  });

  return v1Data(
    {
      token: session.sid,
      expiresAt: session.expiresAt.toISOString(),
      staffId: session.staffId,
      workspace: { slug: result.target.organization_slug, name: result.target.organization_name },
    },
    { status: 201 },
  );
}

/** GET /api/v1/session — the principal behind this bearer (or cookie). */
export const GET = withAuth(async (_req, ctx) =>
  v1Data({
    staffId: ctx.staffId,
    name: ctx.user.name,
    role: ctx.role,
    permissions: [...ctx.permissions].sort(),
    deviceKind: ctx.session.deviceKind,
    expiresAt: ctx.session.expiresAt.toISOString(),
  }),
);

/** DELETE /api/v1/session — sign out; the token stops working immediately. */
export const DELETE = withAuth(async (_req, ctx) => {
  await revokeSession(ctx.session.sid);
  return new NextResponse(null, { status: 204 });
});
