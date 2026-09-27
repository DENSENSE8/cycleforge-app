import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { handleBrandCreate, handleBrandList } from '@/lib/brands/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/brands?q=&kind=&limit= — brand typeahead (alias hit, then active SKU count). */
export const GET = withAuth((req: NextRequest, ctx) => handleBrandList(req, ctx), { permission: 'sku_stock.view' });

/** POST /api/brands — create a brand + aliases; an alias owned by another brand is a 409. */
export const POST = withAuth((req: NextRequest, ctx) => handleBrandCreate(req, ctx), { permission: 'sku_stock.manage' });
