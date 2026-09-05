import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { assertCanConnectProvider } from '@/lib/integrations/connectors/connections';
import { encryptIntegrationPayload } from '@/lib/integrations/crypto';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  GROK_PENDING_COOKIE,
  GROK_PENDING_TTL_MS,
  importHostGrokSession,
  persistGrokCredentials,
  startGrokDeviceCode,
  type GrokPendingDevice,
} from '@/lib/integrations/grok/oauth';

export const dynamic = 'force-dynamic';

function back(origin: string, q: string): NextResponse {
  return NextResponse.redirect(`${origin}/settings/integrations?${q}`);
}

function pendingCookie(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * GET /api/integrations/grok/connect
 *
 * SuperGrok subscription OAuth. Two doors, same vault:
 *   1. This machine already ran `grok login` → import ~/.grok/auth.json into
 *      the org vault (connect-time copy, not a live token home).
 *   2. Otherwise start RFC 8628 device-code and send the operator to Settings
 *      to approve at auth.x.ai.
 */
export const GET = withAuth(async (req, ctx) => {
  const origin = req.nextUrl.origin;
  const refusal = await assertCanConnectProvider(ctx.organizationId, 'grok');
  if (refusal) return NextResponse.json(refusal, { status: 403 });

  try {
    const host = await importHostGrokSession();
    if (host) {
      await persistGrokCredentials({
        orgId: ctx.organizationId,
        creds: host,
        createdBy: ctx.staffId,
      });
      await recordAudit(pool, ctx, req, {
        source: 'integrations/grok/connect',
        action: AUDIT_ACTION.INTEGRATION_CONNECT,
        entityType: AUDIT_ENTITY.INTEGRATION,
        entityId: 'grok',
        method: 'manual',
        after: {
          provider: 'grok',
          connectedVia: 'host',
          accountEmail: host.accountEmail ?? null,
        },
      });
      ctx.markAuditWritten();
      return back(origin, 'success=grok_connected');
    }
  } catch (err) {
    console.error('[grok/connect] host import failed:', err instanceof Error ? err.message : String(err));
    // Fall through to device-code — a stale host file should not block sign-in.
  }

  try {
    const device = await startGrokDeviceCode();
    const pending: GrokPendingDevice = {
      organizationId: ctx.organizationId,
      createdBy: ctx.staffId,
      issuedAt: Date.now(),
      deviceCode: device.deviceCode,
      intervalSec: device.intervalSec,
      expiresAt: device.expiresAt,
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      verificationUriComplete: device.verificationUriComplete,
    };
    const res = back(
      origin,
      `grok_device=1&user_code=${encodeURIComponent(device.userCode)}&verification_uri=${encodeURIComponent(device.verificationUriComplete)}`,
    );
    res.cookies.set(
      GROK_PENDING_COOKIE,
      encryptIntegrationPayload(pending),
      pendingCookie(Math.ceil(GROK_PENDING_TTL_MS / 1000)),
    );
    return res;
  } catch (err) {
    console.error('[grok/connect] device start failed:', err instanceof Error ? err.message : String(err));
    return back(origin, 'error=grok_device_start_failed');
  }
}, { permission: 'admin.manage_features' });
