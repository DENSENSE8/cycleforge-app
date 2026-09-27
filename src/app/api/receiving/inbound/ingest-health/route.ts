/**
 * GET /api/receiving/inbound/ingest-health — is inbound ingestion whole?
 * The reconciliation counts (all should be 0) plus the ledger rows that need
 * a person: failed, dead-lettered, or invalid orders, newest first.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { reconcileInboundSpine } from '@/lib/inbound/import-batch';

export const GET = withAuth(async (_request, ctx) => {
  const [reconciliation, attention] = await Promise.all([
    reconcileInboundSpine(ctx.organizationId),
    tenantQuery<{
      id: number;
      origin: string;
      source: string;
      source_event_id: string;
      status: string;
      error: string | null;
      attempts: number;
      updated_at: string;
    }>(
      ctx.organizationId,
      `SELECT id, origin, source, source_event_id, status, error, attempts, updated_at
         FROM inbound_ingest_event
        WHERE organization_id = $1 AND status IN ('failed', 'dead', 'invalid')
        ORDER BY updated_at DESC
        LIMIT 100`,
      [ctx.organizationId],
    ),
  ]);
  return NextResponse.json({ success: true, reconciliation, attention: attention.rows });
}, { permission: 'receiving.view' });
