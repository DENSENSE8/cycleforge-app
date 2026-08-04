import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveReturnsTestBin } from '@/lib/inventory/returns-test-bin';
import { getReceivingReturnsTestBin } from '@/lib/settings/accessors';
import { getOrganization } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/receiving/returns-test-bin
 *
 * Resolve the returns testing bin (Settings Registry `receiving.returnsTestBin`
 * → env → RETURNS-TEST) for auto-staging return cartons.
 */
export const GET = withAuth(async (_req, ctx) => {
  try {
    const org = await getOrganization(ctx.organizationId as OrgId);
    const barcode = org
      ? getReceivingReturnsTestBin(org.settings, process.env.RETURNS_TEST_BIN_BARCODE)
      : undefined;
    const bin = await resolveReturnsTestBin({ barcode });
    if (!bin) {
      return NextResponse.json(
        { success: false, error: 'Returns testing bin not seeded' },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      location: {
        id: bin.id,
        name: bin.name,
        barcode: bin.barcode,
        room: bin.room,
      },
    });
  } catch (error) {
    return errorResponse(error, 'GET /api/receiving/returns-test-bin');
  }
}, { permission: 'receiving.view' });
