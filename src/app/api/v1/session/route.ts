import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { createSession, revokeSession } from '@/lib/auth/session';
import { authenticateAccountPassword, recordAccountSignin } from '@/lib/identity/account-signin';
import { v1SessionCreateBodySchema, v1SessionError } from '@/lib/auth/v1-session-contract';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' };

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip') || null;
}

/** POST /api/v1/session — email + password → bearer token for a native client. Public (proxy PUBLIC_PATHS). */
export async function POST(req: NextRequest) {
  const parsed = v1SessionCreateBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(v1SessionError('INVALID_REQUEST', 'Invalid sign-in body.'), { status: 400 });
  }
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
      return NextResponse.json(v1SessionError('RATE_LIMITED', 'Too many sign-in attempts.'), {
        status: 429,
        headers: result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : undefined,
      });
    case 'invalid_credentials':
      return NextResponse.json(v1SessionError('INVALID_CREDENTIALS', 'Email or password is incorrect.'), { status: 401 });
    case 'account_not_active':
      return NextResponse.json(v1SessionError('ACCOUNT_NOT_ACTIVE', 'This account is not active.'), { status: 403 });
    case 'no_workspace':
      return NextResponse.json(v1SessionError('NO_WORKSPACE', 'This account has no workspace.'), { status: 403 });
    case 'not_member':
      return NextResponse.json(v1SessionError('NOT_A_MEMBER', 'Not a member of that workspace.'), { status: 403 });
    case 'needs_org_choice':
      return NextResponse.json(
        {
          error: {
            code: 'ORG_CHOICE_REQUIRED',
            message: 'Choose a workspace and sign in again with its slug as `workspace`.',
            workspaces: result.memberships.map((m) => ({ slug: m.organizationSlug, name: m.organizationName })),
          },
        },
        { status: 409 },
      );
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
  });
  await recordAccountSignin({
    accountId: result.accountId,
    target: result.target,
    session,
    event: 'signin.v1',
    ip,
    userAgent: ua,
  });

  return NextResponse.json(
    {
      data: {
        token: session.sid,
        expiresAt: session.expiresAt.toISOString(),
        staffId: session.staffId,
        workspace: { slug: result.target.organization_slug, name: result.target.organization_name },
      },
    },
    { status: 201, headers: NO_STORE },
  );
}

/** GET /api/v1/session — the principal behind this bearer (or cookie). */
export const GET = withAuth(async (_req, ctx) =>
  NextResponse.json(
    {
      data: {
        staffId: ctx.staffId,
        name: ctx.user.name,
        role: ctx.role,
        permissions: [...ctx.permissions].sort(),
        deviceKind: ctx.session.deviceKind,
        expiresAt: ctx.session.expiresAt.toISOString(),
      },
    },
    { headers: NO_STORE },
  ),
);

/** DELETE /api/v1/session — sign out; the token stops working immediately. */
export const DELETE = withAuth(async (_req, ctx) => {
  await revokeSession(ctx.session.sid);
  return new NextResponse(null, { status: 204 });
});
