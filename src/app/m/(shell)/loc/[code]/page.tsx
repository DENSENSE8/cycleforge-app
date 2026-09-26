'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, PackageSearch, Plus, ScanBarcode } from '@/components/Icons';
import { LocationStockList } from '@/components/mobile/location/LocationStockList';
import { LocationSummaryCard } from '@/components/mobile/location/LocationSummaryCard';
import { useLocationRecord } from '@/components/mobile/location/useLocationRecord';
import type { LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import type { DetailDoor } from '@/lib/mobile/detail-door';
import { locationKeypadHref } from '@/lib/mobile/location-hub-href';

type LocationVerb = 'take' | 'put' | 'scan';

/**
 * `/m/loc/[code]` — a scanned location as a full-screen record on
 * {@link DetailHubScreen} (operator 2026-09-25: "when I scan the location it
 */
function LocationHubInner() {
  const router = useRouter();
  const loc = useLocationRecord();
  const hubHref = loc.link(loc.base);

  const pairDoor = (r: LocationRecord): DetailDoor => ({
    id: 'pair',
    title: 'Pair a product',
    icon: <Plus />,
    meta: r.contents.length ? 'Add another SKU to this location' : 'Nothing here yet — find it in the catalog',
    href: `/m/pair/${encodeURIComponent(r.code)}`,
  });

  /** The product is real but not a SKU yet: straight into the SKU-exception sheet. */
  const exceptionDoor = (r: LocationRecord): DetailDoor => ({
    id: 'exception',
    title: 'Not in the catalog',
    icon: <PackageSearch />,
    meta: 'Type it in as a SKU exception and count it here',
    href: `/m/pair/${encodeURIComponent(r.code)}?exception=1`,
  });

  return (
    <DetailHubScreen<LocationRecord>
      record={loc.record}
      state={{ loading: loc.loading, error: loc.error, onRetry: loc.reload }}
      bar={{
        title: loc.face,
        mono: true,
        subtitle: 'Location',
        backHref: loc.back ?? undefined,
        close: loc.back != null,
      }}
      card={(r) => <LocationSummaryCard record={r} href={loc.link(`${loc.base}/info`)} />}
      content={(r) => <LocationStockList record={r} returnTo={hubHref} />}
      rowsLabel="Location screens"
      rows={(r) => [pairDoor(r), exceptionDoor(r)]}
      dock={(r) => {
        const sole = r.contents.length === 1 ? r.contents[0] : null;
        return (
          <DetailDock<LocationVerb>
            label="Location actions"
            verbs={[
              { id: 'take', label: 'Take', icon: <Minus />, disabled: !sole },
              { id: 'put', label: 'Put', icon: <Plus />, disabled: r.contents.length > 1 },
              { id: 'scan', label: 'Scan next', icon: <ScanBarcode />, primary: true },
            ]}
            onVerb={(verb) => {
              if (verb === 'scan') router.push('/m/scan');
              else if (sole) router.push(locationKeypadHref(r.code, sole.sku, { returnTo: hubHref, mode: verb }));
              else if (verb === 'put') router.push(`/m/pair/${encodeURIComponent(r.code)}`);
            }}
          />
        );
      }}
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
