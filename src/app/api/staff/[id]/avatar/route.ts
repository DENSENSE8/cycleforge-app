/** POST /api/staff/[id]/avatar — set / replace a staffer's profile photo. */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import { ApiError, errorResponse } from '@/lib/api';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';
import { deletePhoto, uploadPhoto } from '@/lib/photos/service';
import { STAFF_AVATAR_PHOTO_TYPE } from '@/lib/photos/types';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';

export const dynamic = 'force-dynamic';

const MANAGE_STAFF_PERM = 'admin.manage_staff';

/** withAuth doesn't forward Next's params — `.../api/staff/[id]/avatar`. */
function staffIdFromPath(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean);
  return Number(segments[segments.length - 2]);
}

/**
 * Resolve the subject staffer, tenant-scoped, and authorize the caller.
 *
 * Order matters: the row is looked up FIRST so a cross-org id resolves to a
 * 404 rather than leaking existence via a 403.
 */
async function resolveSubject(
  req: NextRequest,
  ctx: AuthContext,
): Promise<{ staffId: number; currentPhotoId: number | null; name: string | null }> {
  const staffId = staffIdFromPath(req.nextUrl.pathname);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    throw ApiError.badRequest('Valid staff id is required');
  }

  const r = await tenantQuery<{ id: number; name: string | null; avatar_photo_id: number | null }>(
    ctx.organizationId,
    `SELECT id, name, avatar_photo_id
       FROM staff
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [staffId, ctx.organizationId],
  );
  const row = r.rows[0];
  if (!row) throw ApiError.notFound('Staff not found');

  const isSelf = staffId === ctx.staffId;
  if (!isSelf && !ctx.permissions.has(MANAGE_STAFF_PERM)) {
    throw new ApiError(
      403,
      `Requires ${MANAGE_STAFF_PERM} to change another staffer's photo`,
    );
  }

  return { staffId, currentPhotoId: row.avatar_photo_id ?? null, name: row.name };
}

/** Point the staff row at the new photo and return the id it replaced. */
async function setAvatarPointer(
  organizationId: string,
  staffId: number,
  photoId: number | null,
): Promise<number | null> {
  return withTenantTransaction(organizationId, async (client) => {
    const prev = await client.query<{ avatar_photo_id: number | null }>(
      `SELECT avatar_photo_id
         FROM staff
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [staffId, organizationId],
    );
    await client.query(
      `UPDATE staff SET avatar_photo_id = $1 WHERE id = $2 AND organization_id = $3`,
      [photoId, staffId, organizationId],
    );
    return prev.rows[0]?.avatar_photo_id ?? null;
  });
}

/** Drop the photo the pointer no longer names. */
async function discardReplacedPhoto(photoId: number | null, organizationId: string): Promise<void> {
  if (!photoId || photoId <= 0) return;
  try {
    await deletePhoto(photoId, organizationId);
  } catch (err) {
    console.warn('[staff.avatar] could not delete replaced photo', { photoId, err });
  }
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const subject = await resolveSubject(req, ctx);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) {
      throw ApiError.badRequest('file is required');
    }

    const uploaded = await uploadPhoto({
      organizationId: ctx.organizationId,
      staffId: ctx.staffId,
      entityType: 'STAFF',
      entityId: subject.staffId,
      photoType: STAFF_AVATAR_PHOTO_TYPE,
      linkRole: 'primary',
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || 'image/jpeg',
      useStorageAdapter: true,
    });

    const previous = await setAvatarPointer(ctx.organizationId, subject.staffId, uploaded.id);
    await discardReplacedPhoto(previous, ctx.organizationId);

    // /api/staff feeds the client staff identity cache (colours + avatars);
    // the per-staff override namespace is org-scoped, so it takes the org form.
    await invalidateCacheTags([CACHE_TAGS.staff]);
    await invalidateCacheTags(ctx.organizationId, [CACHE_TAGS.staffOverrides]);

    await recordAudit(pool, ctx, req, {
      source: 'staff-avatar',
      action: AUDIT_ACTION.STAFF_AVATAR_SET,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: subject.staffId,
      before: { avatar_photo_id: previous },
      after: { avatar_photo_id: uploaded.id },
      method: 'manual',
      extra: { self: subject.staffId === ctx.staffId },
    });

    return NextResponse.json({ ok: true, staffId: subject.staffId, avatarPhotoId: uploaded.id });
  } catch (error) {
    return errorResponse(error, 'POST /api/staff/[id]/avatar');
  }
}, {});

export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  try {
    const subject = await resolveSubject(req, ctx);
    if (!subject.currentPhotoId) {
      // Already cleared — idempotent, not a 404. Clearing twice is the same
      // outcome the caller asked for.
      return NextResponse.json({ ok: true, staffId: subject.staffId, avatarPhotoId: null });
    }

    const previous = await setAvatarPointer(ctx.organizationId, subject.staffId, null);
    await discardReplacedPhoto(previous, ctx.organizationId);
    await invalidateCacheTags([CACHE_TAGS.staff]);
    await invalidateCacheTags(ctx.organizationId, [CACHE_TAGS.staffOverrides]);

    await recordAudit(pool, ctx, req, {
      source: 'staff-avatar',
      action: AUDIT_ACTION.STAFF_AVATAR_CLEAR,
      entityType: AUDIT_ENTITY.STAFF,
      entityId: subject.staffId,
      before: { avatar_photo_id: previous },
      after: { avatar_photo_id: null },
      method: 'manual',
      extra: { self: subject.staffId === ctx.staffId },
    });

    return NextResponse.json({ ok: true, staffId: subject.staffId, avatarPhotoId: null });
  } catch (error) {
    return errorResponse(error, 'DELETE /api/staff/[id]/avatar');
  }
}, {});
