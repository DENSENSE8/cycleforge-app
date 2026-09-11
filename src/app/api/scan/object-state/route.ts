import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveScanObjectState } from '@/lib/scan/object-state';
import { createScanObjectStateDeps } from '@/lib/scan/object-state-deps';

/**
 * Read-only scan object state — `GET /api/scan/object-state?value=`.
 *
 * The state producer the dispatch table has been waiting for: it answers
 * "what is outstanding on the object this scan names" (is this LPN staged for
 * pack? is its QC open?) and **writes nothing** — the tote→pack Card can
 * therefore never mint the state it is dispatching on, the same contract
 * `/api/receiving/preview-scan` holds for door scans.
 *
 * Tenancy: the handling-unit lookup runs inside the GUC-wrapped tenant path
 * (see `object-state-deps.ts`); the route itself holds no pool and issues no
 * SQL. `receiving.view` is the gate — this discloses exactly what the box read
 * surface already does.
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

    const result = await resolveScanObjectState(
      value,
      createScanObjectStateDeps(ctx.organizationId),
    );
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'unrecognized scan' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, ...result });
  },
  { permission: 'receiving.view' },
);
