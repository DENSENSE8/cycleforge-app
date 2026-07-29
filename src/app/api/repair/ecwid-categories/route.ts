import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveEcwidStoreCreds, resolveRepairCategoryLevelCached } from '@/lib/repair/ecwid-repair-catalog';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { storeId, token } = resolveEcwidStoreCreds();
    const level = await resolveRepairCategoryLevelCached(
      storeId,
      token,
      req.nextUrl.searchParams.get('parentId'),
      ctx.organizationId,
    );

    return NextResponse.json(
      { success: true, ...level },
      { headers: { 'Cache-Control': `private, max-age=${level.message ? 60 : 120}` } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Ecwid repair categories error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'repair.intake' });
