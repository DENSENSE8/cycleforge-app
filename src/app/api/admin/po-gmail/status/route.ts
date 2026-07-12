import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { assertDogfoodMailbox, PoGmailWrongTenantError } from '@/lib/po-gmail/client';
import { getIntegrationCredentials, type GmailCredentials } from '@/lib/integrations/credentials';
import { getConnectionStatus } from '@/lib/integrations/connectors/connections';

export const dynamic = 'force-dynamic';

interface Row {
  account_email: string | null;
  created_at: string;
  scope: string | null;
  needs_reconnect: boolean;
  needs_reconnect_reason: string | null;
}

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

    // Vault-first: the organization_integrations row (provider='gmail') is the
    // preferred token home. Report its state; the legacy google_oauth_tokens
    // row is only consulted when no vault row exists (pre-migration connect).
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

    // Legacy fallback — same row shape as before the vault migration.
    const { rows, rowCount } = await pool.query<Row>(
      `SELECT account_email, created_at, scope, needs_reconnect, needs_reconnect_reason
         FROM google_oauth_tokens
        WHERE provider = 'po_gmail'
        LIMIT 1`,
    );
    return NextResponse.json({
      connected: (rowCount ?? 0) > 0,
      accountEmail: rows[0]?.account_email ?? null,
      connectedAt: rows[0]?.created_at ?? null,
      scope: rows[0]?.scope ?? null,
      needsReconnect: rows[0]?.needs_reconnect ?? false,
      needsReconnectReason: rows[0]?.needs_reconnect_reason ?? null,
    });
  } catch (error) {
    if (error instanceof PoGmailWrongTenantError) {
      return NextResponse.json(DISCONNECTED);
    }
    return errorResponse(error, 'GET /api/admin/po-gmail/status');
  }
}, { permission: 'admin.view' });
