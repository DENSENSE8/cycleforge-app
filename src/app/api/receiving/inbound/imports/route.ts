/**
 * GET /api/receiving/inbound/imports — recent inbound file uploads, newest
 * first (when, file, preset, counts, by whom). Each opens its upload check
 * (`/api/receiving/inbound/imports/[batchId]`).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { listInboundImportBatches } from '@/lib/inbound/import-check-read';

export const GET = withAuth(async (_request, ctx) => {
  const batches = await listInboundImportBatches(ctx.organizationId);
  return NextResponse.json({ success: true, batches });
}, { permission: 'receiving.view' });
