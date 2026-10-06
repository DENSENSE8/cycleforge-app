/**
 * GET /api/receiving/inbound/imports/[batchId] — the upload check: one upload,
 * every file row with each mapped cell beside the value that landed in the
 * database (`readInboundImportCheck`). 404 when the batch is not this org's
 * or kept no file.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { readInboundImportCheck } from '@/lib/inbound/import-check-read';

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const gate = await requireRoutePerm(req, 'receiving.view');
    if (gate.denied) return gate.denied;

    const { batchId: raw } = await params;
    const batchId = Number(raw);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid batch id' }, { status: 400 });
    }

    const check = await readInboundImportCheck(gate.ctx.organizationId, batchId);
    if (!check) return NextResponse.json({ success: false, error: 'Upload not found' }, { status: 404 });
    return NextResponse.json({ success: true, check });
  } catch (error) {
    console.error('Error in GET /api/receiving/inbound/imports/[batchId]:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
