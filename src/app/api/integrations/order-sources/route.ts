/**
 * GET /api/integrations/order-sources
 *
 * Safe metadata for the To-ship Sync Google Sheet chevron: connected
 * order-ingestion platforms (not Google Sheets — that is the dock face)
 * with operator labels like `Sync eBay · USAV`. Never returns secrets.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { loadOrderSyncMenuSources } from '@/lib/integrations/order-sync-menu-load';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, ctx) => {
  try {
    const sources = await loadOrderSyncMenuSources(
      ctx.organizationId,
      (perm) => ctx.permissions.has(perm),
    );
    return NextResponse.json({ success: true, sources });
  } catch (err) {
    return errorResponse(err, 'GET /api/integrations/order-sources');
  }
}, { permission: 'orders.view' });
