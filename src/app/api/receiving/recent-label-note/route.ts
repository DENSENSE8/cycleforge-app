/**
 * GET /api/receiving/recent-label-note?excludeLineId=
 *
 * Label-face note (`label_note` → `notes`) from the **newest scanned carton
 * that has a face note** (walk `receiving_scans` newest-first; skip blank
 * cartons; exclude the open carton). Powers Unbox notes-composer Recent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { fetchMostRecentProcessedLabelNote } from '@/lib/receiving/recent-label-note-server';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId;
    const { searchParams } = new URL(request.url);
    const excludeRaw = searchParams.get('excludeLineId');
    const excludeLineId =
      excludeRaw != null && excludeRaw.trim() !== ''
        ? Number(excludeRaw)
        : null;
    if (
      excludeLineId != null &&
      (!Number.isFinite(excludeLineId) || excludeLineId <= 0)
    ) {
      return NextResponse.json(
        { success: false, error: 'excludeLineId must be a positive integer' },
        { status: 400 },
      );
    }

    const row =
      (await fetchMostRecentProcessedLabelNote(orgId, {
        excludeLineId,
        staffId: ctx.staffId,
      })) ??
      // Fallback: org-wide scan walk when this operator has no prior scanned
      // carton with a face note (shared bench / first scan of the shift).
      (await fetchMostRecentProcessedLabelNote(orgId, {
        excludeLineId,
        staffId: null,
      }));

    return NextResponse.json({
      success: true,
      note: row?.note ?? null,
      lineId: row?.lineId ?? null,
      appliedAt: row?.appliedAt ?? null,
      trackingNumber: row?.trackingNumber ?? null,
      receivingId: row?.receivingId ?? null,
    });
  } catch (error: unknown) {
    console.error('GET /api/receiving/recent-label-note failed:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch recent label note',
      },
      { status: 500 },
    );
  }
}, { permission: 'receiving.view' });
