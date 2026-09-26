import { NextResponse } from 'next/server';
import { fetchManualServerUnassigned } from '@/lib/manual-server';
import { withAuth } from '@/lib/auth/withAuth';

export const GET = withAuth(async () => {
  const payload = await fetchManualServerUnassigned();
  return NextResponse.json({ success: true, ...payload }, { headers: { 'Cache-Control': 'no-store' } });
}, { permission: 'sku_stock.view' });
