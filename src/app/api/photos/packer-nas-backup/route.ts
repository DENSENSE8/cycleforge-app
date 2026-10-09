import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { isNasMirrorConfigured } from '@/lib/photos/mirror-nas';
import { PACKER_PHOTO_NAS_ROOT, runPackerNasBackupBatch } from '@/lib/photos/packer-nas-backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/photos/packer-nas-backup — copy one batch of packer photos to
 * <root>/<date packed>/<order id | tracking>/ via the NAS agent.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    if (!isNasMirrorConfigured()) {
      throw ApiError.badRequest(
        'NAS backup agent is not configured (NAS_AGENT_URL / NAS_AGENT_TOKEN on Vercel)',
      );
    }
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const result = await runPackerNasBackupBatch({
      organizationId: ctx.organizationId,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    });
    return NextResponse.json({ success: true, root: PACKER_PHOTO_NAS_ROOT, ...result });
  } catch (error) {
    return errorResponse(error, 'POST /api/photos/packer-nas-backup');
  }
}, { permission: 'photos.view' });
