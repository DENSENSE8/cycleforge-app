import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { Warehouse } from '@/lib/warehouses';

// NOTE(plan-ceilings):

export const GET = withAuth(async (_request, ctx) => {
  // `warehouses` has no organization_id column (tenant-owned-NEEDS-COL), so there is no explicit org filter to add — run the read…
  const result = await tenantQuery<Warehouse>(
    ctx.organizationId,
    `SELECT id, code, name, timezone, is_active, is_default
       FROM warehouses
       WHERE is_active = true
       ORDER BY is_default DESC, code ASC`,
  );
  return NextResponse.json({ success: true, warehouses: result.rows });
}, { permission: 'sku_stock.view' });
