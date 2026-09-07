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

/**
 * Read-only Unbox scan preview — `GET /api/receiving/preview-scan?value=&mode=`.
 *
 * The Preview stance's answer to *"what would this open?"*. It resolves against
 * the same tables the real scan does and **writes nothing**: no
 * `receiving_scans` row, no `receiving_unbox.opened_at` stamp, no unmatched
 * carton creation. So a preview cannot appear in the Unbox recent rail and
 * cannot count toward unboxing — which is the whole contract of the stance.
 *
 * Tenancy: every resolution read runs through the server deps
 * (preview-scan-deps.ts) inside `tenantQuery` — the GUC `app.current_org`
 * scopes `receiving_unbox` (and carton/ticket/shipment lookups) to the
 * current org under RLS. The route itself holds no pool and issues no SQL.
 *
 * It is a read, so there is no audit row and no idempotency key (both are for
 * mutations). `receiving.view` is the gate: preview discloses exactly what the
 * carton read surface already does.
 */
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
