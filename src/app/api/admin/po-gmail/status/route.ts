import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { assertDogfoodMailbox, PoGmailWrongTenantError } from '@/lib/po-gmail/client';
import { getIntegrationCredentials, type GmailCredentials } from '@/lib/integrations/credentials';
import { getConnectionStatus } from '@/lib/integrations/connectors/connections';

export const dynamic = 'force-dynamic';

const DISCONNECTED = {
  connected: false,
  accountEmail: null,
  connectedAt: null,
  scope: null,
  needsReconnect: false,
  needsReconnectReason: null,
};

export const GET = withAuth(async (_req, ctx) => {
  try {
    assertDogfoodMailbox(ctx.organizationId);

    // The organization_integrations row (provider='gmail') is the only token
    // home since the 2026-09-06 google_oauth_tokens plaintext-column drop.
    // No vault row → not connected; the po-gmail client fails closed the
    // same way (the legacy metadata row carries no tokens).
    const vault = await getConnectionStatus(ctx.organizationId, 'gmail');
    if (vault) {
      const creds = vault.connected
        ? await getIntegrationCredentials<GmailCredentials>(ctx.organizationId, 'gmail')
        : null;
      return NextResponse.json({
        connected: true,
        accountEmail: vault.displayLabel ?? creds?.accountEmail ?? null,
        connectedAt: vault.connectedAt ? vault.connectedAt.toISOString() : null,
        scope: creds?.scope ?? null,
        needsReconnect: vault.state !== 'active',
        needsReconnectReason: vault.lastError ?? null,
      });
    }

    return NextResponse.json(DISCONNECTED);
  } catch (error) {
    if (error instanceof PoGmailWrongTenantError) {
      return NextResponse.json(DISCONNECTED);
    }
    return errorResponse(error, 'GET /api/admin/po-gmail/status');
  }
}, { permission: 'admin.view' });
