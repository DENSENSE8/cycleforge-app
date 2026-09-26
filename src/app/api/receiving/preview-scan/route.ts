import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  previewUnboxScan,
  type UnboxPreviewMode,
  type UnboxPreviewResult,
} from '@/lib/receiving/preview-scan';
import { defaultPreviewScanDeps } from '@/lib/receiving/preview-scan-deps';

const MODES: readonly UnboxPreviewMode[] = ['ticket', 'tracking', 'order', 'auto'];

function parseMode(raw: string | null): UnboxPreviewMode {
  return MODES.includes(raw as UnboxPreviewMode) ? (raw as UnboxPreviewMode) : 'auto';
}

/** Read-only Unbox scan preview — `GET /api/receiving/preview-scan?value=&mode=`. */
export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const value = (url.searchParams.get('value') ?? '').trim();
    if (!value) {
      return NextResponse.json(
        { success: false, error: 'value is required' },
        { status: 400 },
      );
    }

    const result: UnboxPreviewResult = await previewUnboxScan(
      ctx.organizationId,
      value,
      parseMode(url.searchParams.get('mode')),
      defaultPreviewScanDeps,
    );

    return NextResponse.json({ success: true, ...result });
  },
  { permission: 'receiving.view' },
);
