import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { ImportCheckBack, ImportCheckPage } from '@/components/receiving/purchases/import/ImportCheckPage';

export const metadata: Metadata = { title: 'Upload check' };

/**
 * `/purchasing/import/[batchId]` — the upload check (route tree node
 * `purchase-import-check`): every cell of one uploaded order file beside the
 * value that landed in the database.
 */
export default async function PurchaseImportCheckRoute({ params }: { params: Promise<{ batchId: string }> }) {
  await requirePermission('receiving.view');
  const { batchId: raw } = await params;
  const batchId = Number(raw);
  if (!Number.isSafeInteger(batchId) || batchId <= 0) notFound();
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout title="Upload check" measure="full" titleLead={<ImportCheckBack />} className="h-full">
        <ImportCheckPage batchId={batchId} />
      </DeskPageLayout>
    </>
  );
}
