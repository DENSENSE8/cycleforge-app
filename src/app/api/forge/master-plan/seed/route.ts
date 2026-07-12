import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readMasterPlanSeed } from '@/lib/master-plan/seed-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/forge/master-plan/seed — canonical starter MDX for empty-doc CRDT
 * bootstrap (ALP-1.4). Read-only; the CRDT itself lives in Yjs over Ably, and
 * Neon never stores the live blob. All seeders must use this same string so
 * the fixed-clientID seed race stays idempotent (src/lib/master-plan/README.md).
 */
export const GET = withAuth(async (_req: NextRequest, _ctx) => {
  try {
    const seed = await readMasterPlanSeed();
    return NextResponse.json({ success: true, mdx: seed.mdx, source: seed.source });
  } catch (error: unknown) {
    console.error('Error in GET /api/forge/master-plan/seed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read seed' },
      { status: 500 },
    );
  }
}, { permission: 'operations.plans.view' });
