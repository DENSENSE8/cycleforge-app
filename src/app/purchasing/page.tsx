import { Suspense } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { IncomingFirstPaint } from '@/components/receiving/incoming/IncomingFirstPaint';
import { PurchasesSheet } from '@/components/receiving/purchases/PurchasesSheet';

/**
 * `/purchasing` — Purchasing, a Receiving mode (route tree node `purchasing`,
 * owner 2026-10-05): every purchase-order line in a window as the shared
 * sheet. Its controls, facets and Find are the contextual sidebar's
 * (`NAV_PAGE_DECLS.purchasing`); the URL contract is `purchases-params.ts`.
 * No `SurfaceGate`: there is no Studio composition of this surface to swap in.
 */
export default function PurchasingPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <DeskPageLayout bare className="h-full">
        {/* The sheet reads the URL (`useSearchParams`); SSR paints the neutral canvas /incoming paints. */}
        <Suspense fallback={<IncomingFirstPaint className="min-h-0 flex-1" />}>
          <PurchasesSheet />
        </Suspense>
      </DeskPageLayout>
    </>
  );
}
