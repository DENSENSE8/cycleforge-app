import { requirePermission } from '@/lib/auth/page-guard';
import { MobileProducts } from '@/components/mobile/products/MobileProducts';

export const dynamic = 'force-dynamic';

export default async function MobileProductsPage() {
  await requirePermission('sku_stock.view');
  return <MobileProducts />;
}
