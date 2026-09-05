import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { decryptIntegrationPayload } from '@/lib/integrations/crypto';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  GROK_PENDING_COOKIE,
  GROK_PENDING_TTL_MS,
  credentialsFromTokenSet,
  persistGrokCredentials,
  pollGrokDeviceCode,
  type GrokPendingDevice,
} from '@/lib/integrations/grok/oauth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function clearPending(res: NextResponse): NextResponse {
  res.cookies.set(GROK_PENDING_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

/**
 * POST /api/integrations/grok/device/poll
 *
 * Poll auth.x.ai for the in-flight SuperGrok device-code. Tenant + device_code
 * live in the httpOnly pending cookie (never in the query string).
 */
export const POST = withAuth(async (req, ctx) => {
  const raw = req.cookies.get(GROK_PENDING_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: 'No SuperGrok sign-in in progress.' }, { status: 400 });
  }

  let pending: GrokPendingDevice;
  try {
    pending = decryptIntegrationPayload<GrokPendingDevice>(raw);
  } catch {
    return clearPending(
      NextResponse.json({ ok: false, error: 'The SuperGrok sign-in link was invalid — please retry.' }, { status: 400 }),
    );
  }

  if (pending.organizationId !== ctx.organizationId) {
    return clearPending(
      NextResponse.json({ ok: false, error: 'SuperGrok sign-in does not belong to this workspace.' }, { status: 403 }),
    );
  }
  if (!pending.issuedAt || Date.now() - pending.issuedAt > GROK_PENDING_TTL_MS || Date.now() > pending.expiresAt) {
    return clearPending(
      NextResponse.json({ ok: false, status: 'expired', error: 'The SuperGrok sign-in code expired — start Connect again.' }, { status: 400 }),
    );
  }

  const result = await pollGrokDeviceCode(pending.deviceCode);
  if (result.status === 'pending') {
    return NextResponse.json({ ok: true, status: 'pending', intervalSec: result.intervalSec ?? pending.intervalSec });
  }
  if (result.status === 'authorized') {
    const creds = credentialsFromTokenSet(result.tokens, 'oauth');
    await persistGrokCredentials({
      orgId: ctx.organizationId,
      creds,
      createdBy: pending.createdBy ?? ctx.staffId,
    });
    await recordAudit(pool, ctx, req, {
      source: 'integrations/grok/device/poll',
      action: AUDIT_ACTION.INTEGRATION_CONNECT,
      entityType: AUDIT_ENTITY.INTEGRATION,
      entityId: 'grok',
      method: 'manual',
      after: {
        provider: 'grok',
        connectedVia: 'oauth',
        accountEmail: creds.accountEmail ?? null,
      },
    });
    ctx.markAuditWritten();
    return clearPending(NextResponse.json({ ok: true, status: 'authorized' }));
  }

  const status = result.status === 'expired' || result.status === 'denied' ? 400 : 502;
  return clearPending(NextResponse.json({ ok: false, status: result.status, error: result.error }, { status }));
}, { permission: 'admin.manage_features' });
