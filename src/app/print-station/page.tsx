import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { requirePermission } from '@/lib/auth/page-guard';
import { listPrintStationFnskus } from '@/lib/print-station/fnsku-queries';
import { parsePrintStationFnskuView, PRINT_STATION_FNSKU_ROW_CAP } from '@/lib/print-station/fnsku';
import { FnskuPrintDesk } from '@/features/print-station/FnskuPrintDesk';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Print station' };

/**
 * `/print-station` — **Print station › FNSKU labels** (owner 2026-09-29): find
 * an FNSKU from the sidebar's Find (`?q=`), open it (`?fnsku=`), pick the
 * station at the packer's table and how many, and it prints there silently.
 */
export default async function PrintStationPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  const user = await requirePermission('print.label');
  const { q, view: rawView } = await searchParams;
  const view = parsePrintStationFnskuView(rawView);
  const { rows, total } = await listPrintStationFnskus(user.organizationId, { query: q ?? null, view });
  return (
    <>
      <SurfaceParamHygiene />
      {/* The desk frame: its stage places the open FNSKU (DeskRecordPlane); title and keys come from the sidebar's NavContext. */}
      <DeskPageLayout bare className="h-full">
        <Suspense fallback={null}>
          <FnskuPrintDesk rows={rows} total={total} capped={total > PRINT_STATION_FNSKU_ROW_CAP} view={view} />
        </Suspense>
      </DeskPageLayout>
    </>
  );
}
