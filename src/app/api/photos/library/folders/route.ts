import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { errorResponse } from '@/lib/api';
import {
  libraryFiltersFromSearchParams,
  listPhotoLibraryFolders,
} from '@/lib/photos/queries/library';
import {
  isPhotoLibraryFolderLevel,
  type PhotoLibraryFolderLevel,
} from '@/lib/photos/folder-level';
import { photoContentUrl } from '@/lib/photos/display-url';

export const dynamic = 'force-dynamic';

/**
 * GET /api/photos/library/folders — cheap folder tiles for Media Library browse.
 * Aggregates counts by year/month/week/day/entity using the same WHERE waist as
 * `/api/photos/library` (no photo-row materialization).
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const params = new URL(req.url).searchParams;
      const levelRaw = params.get('level');
      if (!isPhotoLibraryFolderLevel(levelRaw)) {
        return NextResponse.json(
          { error: 'level must be year|month|week|day|entity' },
          { status: 400 },
        );
      }
      const level: PhotoLibraryFolderLevel = levelRaw;

      // Outbound documents are a different table — pack_photos reuse photo folders.
      if (params.get('sourceScope') === 'outbound' && params.get('outboundMedia') !== 'pack_photos') {
        return NextResponse.json({ tiles: [], level });
      }

      const base = libraryFiltersFromSearchParams(params);
      if (params.get('outboundMedia') === 'pack_photos') {
        base.entityType = 'PACKER_LOG';
      }

      const sourceScope = params.get('sourceScope');
      const { tiles, level: resolved } = await listPhotoLibraryFolders({
        organizationId: ctx.organizationId,
        ...base,
        level,
        sourceScope,
      });

      const withThumbs = tiles.map((t) => ({
        ...t,
        previewThumbUrl: t.previewPhotoId != null ? photoContentUrl(t.previewPhotoId, 'thumb') : null,
      }));

      return NextResponse.json({ tiles: withThumbs, level: resolved });
    } catch (error) {
      return errorResponse(error, 'GET /api/photos/library/folders');
    }
  },
  { permission: 'photos.view' },
);
