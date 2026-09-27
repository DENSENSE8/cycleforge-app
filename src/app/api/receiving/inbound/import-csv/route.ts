/**
 * POST /api/receiving/inbound/import-csv — CSV / TSV rows → inbound orders.
 *
 * Rows are grouped into orders and land through the one writer
 * (`runInboundImportBatch` → `ingestInboundOrder`, one transaction per order,
 * every order in the ingest ledger). `dryRun: true` validates the whole file
 * without landing anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { InboundImportCsvBody } from '@/lib/schemas/inbound-desk';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { runInboundImportBatch } from '@/lib/inbound/import-batch';

const Body = InboundImportCsvBody.extend({
  dryRun: z.boolean().optional().default(false),
  label: z.string().trim().max(200).optional().nullable(),
});

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(Body, raw);
  if (parsed instanceof NextResponse) return parsed;

  const batch = await runInboundImportBatch(ctx.organizationId, {
    rows: parsed.rows,
    origin: 'csv',
    source: 'csv',
    staffId: ctx.staffId,
    label: parsed.label ?? null,
    dryRun: parsed.dryRun,
  });

  const created = batch.orders.filter((o) => o.status === 'landed' && o.created).length;
  const updated = batch.orders.filter((o) => (o.status === 'landed' && !o.created) || o.status === 'unchanged').length;
  const failed = batch.counts.failed + batch.counts.invalid;

  if (!parsed.dryRun) {
    await recordAudit(pool, ctx, request, {
      source: 'inbound-import-csv',
      action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
      entityType: AUDIT_ENTITY.INBOUND_ORDER,
      entityId: `batch:${batch.batchId}`,
      method: 'system',
      after: { batchId: batch.batchId, ...batch.counts, total: batch.total },
    });
    after(async () => {
      await invalidateReceivingViews(ctx.organizationId).catch((e) => console.warn('[inbound/import-csv] invalidate failed', e));
    });
  }

  return NextResponse.json({
    success: failed === 0,
    batch_id: batch.batchId,
    dry_run: batch.dryRun,
    created,
    updated,
    skipped: batch.counts.skipped,
    failed,
    total: batch.total,
    orders: batch.orders,
    skipped_rows: batch.skipped,
  });
}, { permission: 'receiving.view' });
