import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveEcwidStoreCreds, resolveRepairCategoryLevelCached } from '@/lib/repair/ecwid-repair-catalog';

export const GET = withAuth(async (req: NextRequest, ctx) => {
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
}, { permission: 'repair.intake' });
