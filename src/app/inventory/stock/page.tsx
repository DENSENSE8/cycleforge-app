import { redirect } from 'next/navigation';
import { SKU_EXCEPTIONS_PATH } from '@/lib/inventory/sku-exception-links';

/**
 * `/inventory/stock` — retired 2026-09-24. The Inventory tab it held is now
 * SKU Exceptions; old bookmarks land there.
 */
export default function InventoryStockRedirect() {
  redirect(SKU_EXCEPTIONS_PATH);
}
