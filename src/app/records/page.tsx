import { Suspense } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { RecordsSheet } from '@/components/records/RecordsSheet';

/**
 * `/records` — the Records sheet (route tree node `records`, owner
 * 2026-10-06): every line of an inbound or outbound order as one sheet. Its
 * Sort, controls, facets and Find are the contextual sidebar's
 * (`NAV_PAGE_DECLS.records`); the URL contract is `src/lib/nav/records/params.ts`.
 */
export default function RecordsPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout bare className="h-full">
        <Suspense fallback={null}>
          <RecordsSheet />
        </Suspense>
      </DeskPageLayout>
    </>
  );
}
