import { Suspense } from 'react';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { FulfilledDesk } from '@/components/outbound/fulfilled/FulfilledSheet';

/**
 * `/fulfilled` — Fulfilled (route tree node `fulfilled`, owner 2026-10-05):
 * every shipped order in a window, on the full-screen board (default) or as
 * the shared sheet (`?layout=sheet`). Its controls, facets and Find are the
 * contextual sidebar's (`NAV_PAGE_DECLS.fulfilled`); the URL contract is
 * `fulfilled-params.ts`. No seed: the body asks one set-based query
 * (`GET /api/nav/fulfilled`). `/shipping/shipped` redirects here.
 */
export default function FulfilledPage() {
  return (
    <>
      <SurfaceParamHygiene />
      {/* The desk frame reads the URL (`useSearchParams`: the board runs full-bleed, the sheet keeps the fixed measure);
          SSR paints the neutral canvas in the frame until it mounts. */}
      <Suspense
        fallback={
          <DeskPageLayout bare className="h-full">
            <div className="min-h-0 w-full flex-1 bg-surface-canvas" aria-busy="true" aria-label="Fulfilled orders" />
          </DeskPageLayout>
        }
      >
        <FulfilledDesk />
      </Suspense>
    </>
  );
}
