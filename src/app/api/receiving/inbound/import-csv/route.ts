/**
 * POST /api/receiving/inbound/import-csv
 *
 * Batch desk import — client parses CSV rows and posts them here. Each row
 * goes through importDeskInboundRow (same UPSERT as Add). Amazon native
 * returns rows without a matching sku_catalog.sku (= ASIN) are skipped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { InboundImportCsvBody } from '@/lib/schemas/inbound-desk';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import {
  deskRowFromCsvRecord,
  importDeskInboundRow,
  isDeskImportSkip,
} from '@/lib/inbound/desk-import';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = parseBody(InboundImportCsvBody, raw);
  if (parsed instanceof NextResponse) return parsed;

  const results: Array<{
    row: number;
    ok: boolean;
    created?: boolean;
    receiving_line_id?: number;
    skipped?: boolean;
    skip_reason?: string;
    asin?: string | null;
    error?: string;
  }> = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const deskRow = deskRowFromCsvRecord(parsed.rows[i]);
    try {
      const r = await importDeskInboundRow(ctx.organizationId, deskRow);
      if (isDeskImportSkip(r)) {
        skipped += 1;
        results.push({
          row: i,
          ok: true,
          skipped: true,
          skip_reason: r.reason,
          asin: r.asin ?? null,
        });
        continue;
      }
      results.push({
        row: i,
        ok: true,
        created: r.created,
        receiving_line_id: r.receivingLineId,
      });
      if (r.created) created += 1;
      else updated += 1;
    } catch (err) {
      failed += 1;
      results.push({
        row: i,
        ok: false,
        error: err instanceof Error ? err.message : 'import failed',
      });
    }
  }

  await recordAudit(pool, ctx, request, {
    source: 'inbound-import-csv',
    action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
    entityType: AUDIT_ENTITY.RECEIVING_LINE,
    entityId: 'batch',
    method: 'system',
    after: { created, updated, skipped, failed, total: parsed.rows.length },
  });

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
    } catch (e) {
      console.warn('[inbound/import-csv] cache invalidation failed', e);
    }
  });

  return NextResponse.json({
    success: failed === 0,
    created,
    updated,
    skipped,
    failed,
    total: parsed.rows.length,
    results,
  });
}, { permission: 'receiving.view' });
