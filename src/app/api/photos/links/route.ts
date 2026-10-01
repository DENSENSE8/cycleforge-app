import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { linkPhoto } from '@/lib/photos/service';
import { reorderEntityPhotos } from '@/lib/photos/entity-photo-order';
import { uploadPermissionFor } from '@/lib/photos/entity-permissions';
import type { PhotoEntityType, PhotoLinkRole } from '@/lib/photos/types';
import { PHOTO_ENTITY_TYPES, PHOTO_LINK_ROLES } from '@/lib/photos/types';
import { assertTaskInOrg } from '@/lib/tasks/task-links-db';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json().catch(() => null);
    if (!body) throw ApiError.badRequest('Invalid JSON body');

    const photoId = Number(body.photoId);
    const entityType = String(body.entityType || '').trim().toUpperCase() as PhotoEntityType;
    const entityId = Number(body.entityId);
    const linkRole = String(body.linkRole || 'primary').trim() as PhotoLinkRole;

    if (!Number.isFinite(photoId) || photoId <= 0) {
      throw ApiError.badRequest('Valid photoId is required');
    }
    if (!PHOTO_ENTITY_TYPES.includes(entityType)) {
      throw ApiError.badRequest(`Invalid entityType: ${entityType}`);
    }
    if (!Number.isFinite(entityId) || entityId <= 0) {
      throw ApiError.badRequest('Valid entityId is required');
    }
    if (!PHOTO_LINK_ROLES.includes(linkRole)) {
      throw ApiError.badRequest(`Invalid linkRole: ${linkRole}`);
    }

    const requiredPerm = uploadPermissionFor(entityType);
    if (!ctx.permissions.has(requiredPerm)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', permission: requiredPerm },
        { status: 403 },
      );
    }
    // Same existence gate as the upload routes: a task photo link must name a
    // FOLLOW_UP task in THIS org.
    if (entityType === 'WORK_ASSIGNMENT') await assertTaskInOrg(ctx.organizationId, entityId);

    await linkPhoto({
      organizationId: ctx.organizationId,
      photoId,
      entityType,
      entityId,
      linkRole,
    });

    return NextResponse.json({ success: true, photoId, entityType, entityId, linkRole });
  } catch (error) {
    return errorResponse(error, 'POST /api/photos/links');
  }
}, {});

/**
 * PATCH /api/photos/links — persist an entity's photo order.
 * Body `{ entityType, entityId, orderedPhotoIds }`; index 0 becomes the main
 * (cover) photo. Unknown ids are ignored; unlisted links keep order after.
 */
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  try {
    const body = await req.json().catch(() => null);
    if (!body) throw ApiError.badRequest('Invalid JSON body');

    const entityType = String(body.entityType || '').trim().toUpperCase() as PhotoEntityType;
    const entityId = Number(body.entityId);
    const rawIds: unknown = body.orderedPhotoIds;

    if (!PHOTO_ENTITY_TYPES.includes(entityType)) {
      throw ApiError.badRequest(`Invalid entityType: ${entityType}`);
    }
    if (!Number.isFinite(entityId) || entityId <= 0) {
      throw ApiError.badRequest('Valid entityId is required');
    }
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      throw ApiError.badRequest('orderedPhotoIds must be a non-empty array');
    }
    const orderedPhotoIds = rawIds.map((v) => Number(v));
    if (orderedPhotoIds.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
      throw ApiError.badRequest('orderedPhotoIds must be positive integers');
    }

    const requiredPerm = uploadPermissionFor(entityType);
    if (!ctx.permissions.has(requiredPerm)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', permission: requiredPerm },
        { status: 403 },
      );
    }
    if (entityType === 'WORK_ASSIGNMENT') await assertTaskInOrg(ctx.organizationId, entityId);

    const updated = await reorderEntityPhotos({
      organizationId: ctx.organizationId,
      entityType,
      entityId,
      orderedPhotoIds,
    });

    return NextResponse.json({ success: true, entityType, entityId, updated });
  } catch (error) {
    return errorResponse(error, 'PATCH /api/photos/links');
  }
}, {});
