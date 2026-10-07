import { Suspense } from 'react';
import { permanentRedirect } from 'next/navigation';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { FulfilledDesk } from '@/components/outbound/fulfilled/FulfilledSheet';
import { fulfilledLegacySearch } from '@/lib/outbound/fulfilled-url';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';

/**
 * `/fulfilled` — Fulfilled (route tree node `fulfilled`, owner 2026-10-05):
 * every shipped order in a window, on the full-screen board (default) or as
 * the Records sheet (`?layout=sheet`, or one bucket: `?col=`). Its controls,
 * facets and Find are the contextual sidebar's (`NAV_PAGE_DECLS.fulfilled`);
 * the URL contract is `fulfilled-params.ts`. A link with the words Fulfilled
 * used before it took the Records params redirects once, for good. No seed:
 * the body asks one read (`GET /api/nav/fulfilled`). `/shipping/shipped`
 * redirects here.
 */
export default async function FulfilledPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, one);
  }
  const rewritten = fulfilledLegacySearch(query);
  if (rewritten !== null) permanentRedirect(`${SHIPPING_SHIPPED_PATH}${rewritten ? `?${rewritten}` : ''}`);
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
