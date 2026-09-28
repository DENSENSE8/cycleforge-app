import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { listQcLabels, QC_LABEL_ROW_CAP } from '@/lib/labels/qc-labels-queries';
import { parseQcLabelView } from '@/lib/labels/qc-label-views';
import { QcLabelsLedger } from '@/components/inventory/qc-labels/QcLabelsLedger';

export const dynamic = 'force-dynamic';

/** `/inventory/qc-labels` — Inventory › **QC labels**: every unit with a printed QC / pre-box label. */
export default async function InventoryQcLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const user = await requirePermission('sku_stock.view');
  const { q, view } = await searchParams;
  const { rows, totalCount } = await listQcLabels(user.organizationId, { view: parseQcLabelView(view), query: q ?? null });
  return (
    <Suspense fallback={null}>
      <QcLabelsLedger rows={rows} totalCount={totalCount} capped={rows.length >= QC_LABEL_ROW_CAP && totalCount > rows.length} />
    </Suspense>
  );
}
