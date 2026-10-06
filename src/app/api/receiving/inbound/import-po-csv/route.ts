/**
 * POST /api/receiving/inbound/import-po-csv — THE inbound order import (every
 * bulk file: purchase-order sheets, Amazon seller-fulfilled / Prime / FBA
 * returns reports, eBay returns, Goodwill orders).
 *
 * Body `{ fileName, headers, rows, preset?, platform?, mapping?, assist?, dryRun, label? }`.
 * The preset (export format) is detected from the header row unless given;
 * columns are identified server-side (`identifyColumns`: preset header words,
 * registry words, then value shape; the AI header mapping only with `assist`
 * while required fields stay unmapped). `dryRun: true` previews every order —
 * new / updated / unchanged by content hash, lines, tier, problems — and
 * writes nothing; `dryRun: false` lands every clean order through the one
 * writer (`runInboundDraftBatch` → `ingestInboundOrder`) and keeps the file
 * row by row for the upload check (`/api/receiving/inbound/imports/[batchId]`).
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { parseBody } from '@/lib/schemas/parse';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { PO_FIELDS, PO_PRESET_IDS } from '@/lib/inbound/po-columns';
import { runPoCsvImport } from '@/lib/inbound/po-csv-import';

export const runtime = 'nodejs';

const Body = z.object({
  fileName: z.string().trim().min(1).max(255),
  headers: z.array(z.string().max(200)).min(1).max(200),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5_000),
  preset: z.enum(PO_PRESET_IDS).optional().nullable(),
  platform: z.string().trim().max(40).optional().nullable(),
  mapping: z.partialRecord(z.enum(PO_FIELDS), z.string().max(200)).optional().nullable(),
  assist: z.boolean().optional().default(false),
  dryRun: z.boolean(),
  label: z.string().trim().max(200).optional().nullable(),
});

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const parsed = parseBody(Body, await request.json().catch(() => ({})));
  if (parsed instanceof NextResponse) return parsed;

  if (parsed.assist && parsed.dryRun) {
    const rate = await checkRateLimitForOrg({
      headers: request.headers,
      routeKey: 'inbound-po-csv-assist',
      limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
      windowMs: 60 * 1000,
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
    });
    if (!rate.ok) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again shortly.' },
        { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined },
      );
    }
  }

  const result = await runPoCsvImport(ctx.organizationId, {
    fileName: parsed.fileName,
    headers: parsed.headers,
    rows: parsed.rows,
    preset: parsed.preset ?? null,
    platform: parsed.platform ?? null,
    mapping: parsed.mapping ?? null,
    assist: parsed.assist,
    dryRun: parsed.dryRun,
    staffId: typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null,
    label: parsed.label ?? null,
  });

  if (!parsed.dryRun && result.batch?.batchId != null) {
    await recordAudit(pool, ctx, request, {
      source: 'inbound-import-po-csv',
      action: AUDIT_ACTION.RECEIVING_INBOUND_IMPORT,
      entityType: AUDIT_ENTITY.INBOUND_ORDER,
      entityId: `batch:${result.batch.batchId}`,
      method: 'system',
      after: { batchId: result.batch.batchId, fileName: parsed.fileName, preset: result.preset, platform: result.platform, ...result.batch.counts, total: result.batch.total },
    });
    after(async () => {
      await invalidateReceivingViews(ctx.organizationId).catch((e) => console.warn('[inbound/import-po-csv] invalidate failed', e));
    });
  }

  return NextResponse.json({ success: true, dry_run: parsed.dryRun, ...result });
}, { permission: 'receiving.view' });
