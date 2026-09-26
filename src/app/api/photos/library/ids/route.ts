import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import { listPhotoLibraryIds, libraryFiltersFromSearchParams } from '@/lib/photos/queries/library';

export const dynamic = 'force-dynamic';

/** GET /api/photos/library/ids — "select all matching filters" support. */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const params = new URL(req.url).searchParams;
      const capRaw = params.get('cap');
      const cap = capRaw && Number.isFinite(Number(capRaw)) ? Number(capRaw) : 500;

      const { ids, total, capped } = await listPhotoLibraryIds(
        { organizationId: ctx.organizationId, ...libraryFiltersFromSearchParams(params) },
        { cap },
      );

      return NextResponse.json({ ids, total, capped });
    } catch (error) {
      return errorResponse(error, 'GET /api/photos/library/ids');
    }
  },
  { permission: 'photos.view' },
);
