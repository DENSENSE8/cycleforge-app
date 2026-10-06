'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLocationRecord } from '@/components/mobile/location/useLocationRecord';
import { locationRecordQueryKey, scanLocation } from '@/components/mobile/scan/location-bind-api';
import { MobileV2LocationRecord } from '@/components/mobile/v2/stock/MobileV2LocationRecord';
import { routeScan, unwrapScannedLocation } from '@/lib/barcode-routing';
import { locationHubPath, withLocationScanProof } from '@/lib/mobile/location-hub-href';
import {
  locationScanLanding,
  readLocationScanLanding,
  withLocationScanLanding,
  withoutLocationScanOpen,
} from '@/lib/mobile/location-scan-landing';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { appendLocationScan } from '@/lib/mobile/scan-tape-session';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { toast } from '@/lib/toast';

/**
 * `/m/loc/[code]` — the stable scanned-location identity route, rendered by
 * the V2 compact stock/tote surface.
 */
function LocationHubInner() {
  const loc = useLocationRecord();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Where the scan landed. The one-shot `sku` / `stage` leave the address once
  // the record paints (the stock sheet reads them on mount), so a refresh or
  // Back does not reopen the sheet; `pick` stays with this visit.
  const landing = readLocationScanLanding(searchParams);
  const loaded = loc.record != null;
  useEffect(() => {
    if (!loaded || !landing.sku) return;
    router.replace(withoutLocationScanOpen(`${pathname}?${searchParams.toString()}`), { scroll: false });
  }, [loaded, landing.sku, pathname, router, searchParams]);

  // A hardware scan of a location label here: the same shelf renews the scan
  // proof under the open sheet; another shelf lands exactly as a camera scan
  // would — no trip back to the scan page between locations.
  const queryClient = useQueryClient();
  const { playScanFeedback } = useScanFeedback();
  useEffect(() => {
    const scanShelf = (raw: string) => {
      const code = unwrapScannedLocation(raw);
      void scanLocation(code)
        .then(({ record, proof }) => {
          queryClient.setQueryData(locationRecordQueryKey(code), record);
          if (code.toUpperCase() === loc.code.toUpperCase()) {
            router.replace(withLocationScanProof(`${pathname}?${searchParams.toString()}`, proof), { scroll: false });
            playScanFeedback('success');
            return;
          }
          const hub = loc.back ? withJobReturn(locationHubPath(code), loc.back) : locationHubPath(code);
          const next = locationScanLanding(record);
          router.replace(withLocationScanProof(withLocationScanLanding(hub, next), proof), { scroll: false });
          appendLocationScan(code, hub);
          playScanFeedback(next.kind === 'adjust' ? 'success' : 'warn');
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Could not verify location');
          playScanFeedback('reject');
        });
    };
    const onWedge = (event: Event) => {
      const detail = (event as CustomEvent<{ value?: string; location?: boolean }>).detail;
      const raw = detail?.value?.trim();
      if (!raw || event.defaultPrevented) return;
      const route = routeScan(raw);
      if (route?.type !== 'bin' && route?.type !== 'bin-paired-order') return;
      // An item whose SKU reads like a bin code belongs to the stock sheet.
      if (loc.record?.contents.some((row) => row.sku.toUpperCase() === raw.toUpperCase())) return;
      // A printed location label (it routes somewhere), or a code the sheet
      // already tried as an item and handed back.
      if (detail?.location === true || route.type === 'bin-paired-order' || route.redirect) {
        event.preventDefault();
        scanShelf(raw);
        return;
      }
      // A bare letter-led code may be an item barcode the open sheet claims
      // synchronously; decide once every listener has seen the event. The
      // global scanner has nowhere to send a redirect-less code meanwhile.
      queueMicrotask(() => {
        if (!event.defaultPrevented) scanShelf(raw);
      });
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [loc.back, loc.code, loc.record, pathname, playScanFeedback, queryClient, router, searchParams]);

  const hubHref = loc.link(loc.base);
  if (loc.loading) return <div className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm text-text-soft">Loading location…</div>;
  if (loc.error || !loc.record) return <div role="alert" className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm font-semibold text-text-danger">{loc.error || 'Location not found'}</div>;
  return (
    <MobileV2LocationRecord
      // A new shelf is a new visit: its landing and sheet start fresh.
      key={loc.record.code}
      record={loc.record}
      returnTo={hubHref}
      verificationToken={loc.verificationToken}
      backHref={loc.back ?? WAREHOUSE_PATHS.stock}
      adjustSku={landing.adjust ? landing.sku : null}
      pick={landing.pick}
    />
  );
}

export default function LocationHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <LocationHubInner />
    </Suspense>
  );
}
