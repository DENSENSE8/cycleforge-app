/**
 * GET /api/receiving/recent-label-note?excludeLineId=
 *
 * Sticker-center note from the **newest scanned carton that has a face note**
 * (walk `receiving_scans` newest-first; skip blank cartons; exclude the open
 * carton), taken from the line on that carton touched last and reading `notes`
 * before the older `label_note`. Powers Unbox notes-composer Recent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseExcludeLineIdParam } from '@/lib/receiving/exclude-line-id-param';
import { fetchMostRecentProcessedLabelNote } from '@/lib/receiving/recent-label-note-server';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  try {
    const parsed = parseExcludeLineIdParam(new URL(request.url).searchParams);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 },
      );
    }
    const { excludeLineId } = parsed;
    const orgId = ctx.organizationId;
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
