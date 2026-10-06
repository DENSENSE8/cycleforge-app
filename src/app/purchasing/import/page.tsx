import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { PurchaseImportPage } from '@/components/receiving/purchases/import/PurchaseImportPage';

export const metadata: Metadata = { title: 'Import orders' };

/**
 * `/purchasing/import` — Import orders (route tree node `purchase-import`):
 * upload a platform's order export, check how its columns land, import, then
 * read the upload check.
 */
export default async function PurchaseImportRoute() {
  await requirePermission('receiving.view');
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout title="Import orders" className="h-full">
        <PurchaseImportPage />
      </DeskPageLayout>
    </>
  );
}
