import { NextRequest, NextResponse } from 'next/server';
import {
  FAVORITE_WORKSPACE_KEYS,
  createFavoriteSku,
  listFavoriteSkus,
  type FavoriteWorkspaceKey,
} from '@/lib/favorites/sku-favorites';
import { withAuth } from '@/lib/auth/withAuth';

function parseWorkspaceKey(value: string | null): FavoriteWorkspaceKey | null {
  if (!value) return null;
  return FAVORITE_WORKSPACE_KEYS.includes(value as FavoriteWorkspaceKey)
    ? (value as FavoriteWorkspaceKey)
    : null;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const workspaceKey = parseWorkspaceKey(searchParams.get('workspace'));

  if (!workspaceKey) {
    return NextResponse.json({ error: 'workspace is required' }, { status: 400 });
  }

  const favorites = await listFavoriteSkus(workspaceKey, false, ctx.organizationId);
  return NextResponse.json({ favorites, count: favorites.length, workspaceKey });
}, { permission: 'sku_stock.view' });

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const workspaceKey = parseWorkspaceKey(body?.workspaceKey ?? null);

  if (!workspaceKey) {
    return NextResponse.json({ error: 'workspaceKey is required' }, { status: 400 });
  }

  const favorite = await createFavoriteSku({
    workspaceKey,
    ecwidProductId: body?.ecwidProductId,
    sku: body?.sku,
    label: body?.label,
    productTitle: body?.productTitle,
    issueTemplate: body?.issueTemplate,
    defaultPrice: body?.defaultPrice,
    notes: body?.notes,
    sortOrder: body?.sortOrder,
    isActive: body?.isActive,
    staffId: ctx.staffId,
  }, ctx.organizationId);

  return NextResponse.json({ success: true, favorite });
}, { permission: 'sku_stock.manage' });
