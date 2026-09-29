import { requirePermission } from '@/lib/auth/page-guard';
import { MobileProductProfile } from '@/components/mobile/products/MobileProductProfile';

export const dynamic = 'force-dynamic';

export default async function MobileProductProfilePage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  await requirePermission('sku_stock.view');
  const { sku } = await params;
  return <MobileProductProfile sku={decodeURIComponent(sku || '').trim()} />;
}
