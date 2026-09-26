import { NextRequest, NextResponse } from 'next/server';
import { fetchManualServerByItem, normalizeManualServerItemNumber } from '@/lib/manual-server';
import { withAuth } from '@/lib/auth/withAuth';

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const itemNumber = normalizeManualServerItemNumber(String(searchParams.get('itemNumber') || ''));

  if (!itemNumber) {
    return NextResponse.json({ success: false, error: 'itemNumber is required' }, { status: 400 });
  }

  const payload = await fetchManualServerByItem(itemNumber);
  return NextResponse.json({ success: true, ...payload }, { headers: { 'Cache-Control': 'no-store' } });
}, { permission: 'sku_stock.view' });
