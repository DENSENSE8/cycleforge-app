import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readMasterPlanSeed } from '@/lib/master-plan/seed-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/forge/master-plan/seed — canonical starter MDX for empty-doc CRDT bootstrap (ALP-1.4). */
export const GET = withAuth(async (_req: NextRequest, _ctx) => {
  const seed = await readMasterPlanSeed();
  return NextResponse.json({ success: true, mdx: seed.mdx, source: seed.source });
}, { permission: 'operations.plans.view' });
