import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { requirePermission } from '@/lib/auth/page-guard';
import { PrintStationsDesk } from '@/features/print-station/PrintStationsDesk';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stations · Print station' };

/**
 * `/print-station/stations` — **Print station › Stations** (owner 2026-10-04):
 * the managing mode, `G S` on the Print station. Every org print station on
 * one line; the open one (`?station=`) renames it, sets the org default per
 * stock and test-prints. The roster is live (the registry poll + the staff
 * roster), so the page renders it on the client.
 */
export default async function PrintStationsPage() {
  await requirePermission('print.label');
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout bare className="h-full">
        <Suspense fallback={null}>
          <PrintStationsDesk />
        </Suspense>
      </DeskPageLayout>
    </>
  );
}
