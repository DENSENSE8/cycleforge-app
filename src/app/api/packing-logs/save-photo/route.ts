import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { uploadPhoto, linkPhoto } from '@/lib/photos/service';
import { photoContentUrl } from '@/lib/photos/display-url';
import { publishPackerPhotoChanged } from '@/lib/realtime/publish';
import { countPackerPhotos } from '@/lib/photos/queries/packer-list';
import { UNIT_PACKING_PHOTO_TYPE } from '@/lib/photos/types';
import type { OrgId } from '@/lib/tenancy/constants';

export const POST = withAuth(async (req: NextRequest, ctx) => {
    try {
        const body = await req.json();
        const { photo, orderId, photoIndex, packerLogId, photoType, serialUnitId } = body;
        const packerId = ctx.staffId;

        if (!photo || !orderId || photoIndex === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${orderId}_${photoIndex + 1}.jpg`;

        if (!packerLogId) {
            return NextResponse.json({ error: 'packerLogId is required' }, { status: 400 });
        }

        const resolvedType = photoType ?? UNIT_PACKING_PHOTO_TYPE;
        const unitIdRaw = Number(serialUnitId);
        const unitId =
          Number.isFinite(unitIdRaw) && unitIdRaw > 0 ? unitIdRaw : null;

        // Prefer SERIAL_UNIT as primary entity when the packer scanned a unit
        // QR; always dual-link to PACKER_LOG so both timeline + pack history see it.
        const result = await uploadPhoto({
            organizationId: ctx.organizationId,
            staffId: Number(packerId),
            entityType: unitId != null ? 'SERIAL_UNIT' : 'PACKER_LOG',
            entityId: unitId != null ? unitId : Number(packerLogId),
            photoType: resolvedType,
            fileBuffer: buffer,
            contentType: 'image/jpeg',
            poRef: String(orderId),
        });

        if (unitId != null) {
            try {
                await linkPhoto({
                    organizationId: ctx.organizationId,
                    photoId: result.id,
                    entityType: 'PACKER_LOG',
                    entityId: Number(packerLogId),
                    linkRole: 'primary',
                });
            } catch (err) {
                console.warn('packing save-photo: PACKER_LOG dual-link failed', err);
            }
        } else {
            // Already linked to PACKER_LOG as primary — nothing else to do.
        }

        // Live-refresh the desktop library + mobile packing feed (station channel).
        await publishPackerPhotoChanged({
            organizationId: ctx.organizationId as OrgId,
            action: 'insert',
            packerLogId: Number(packerLogId),
            orderId: String(orderId),
            photoId: result.id,
            totalPhotoCount: await countPackerPhotos(ctx.organizationId, Number(packerLogId)),
            source: 'packing-logs.save-photo',
        });

        return NextResponse.json({
            success: true,
            path: photoContentUrl(result.id),
            filename,
            photoId: result.id,
        });
    } catch (error: unknown) {
        console.error('Error saving photo:', error);
        return NextResponse.json({
            error: 'Failed to save photo',
            details: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}, { permission: 'packing.complete_order' });
