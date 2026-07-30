import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getReconciliationSnapshot } from '@/lib/orders/reconciliation-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/operations/reconciliation — CF-03 smear candidates + open
 * unmatched-tracking exceptions for the Operations Reconciliation Monitor.
 * Read-only; org from ctx.
 */
export const GET = withAuth(
  async (_req, ctx) => {
    const snapshot = await getReconciliationSnapshot(ctx.organizationId);
    return NextResponse.json({ ok: true, ...snapshot });
  },
  { permission: 'operations.view' },
);
