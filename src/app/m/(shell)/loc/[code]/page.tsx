'use client';

import { Suspense } from 'react';
import { useLocationRecord } from '@/components/mobile/location/useLocationRecord';
import { MobileV2LocationRecord } from '@/components/mobile/v2/stock/MobileV2LocationRecord';

/**
 * `/m/loc/[code]` — the stable scanned-location identity route, rendered by
 * the V2 compact stock/LPN surface.
 */
function LocationHubInner() {
  const loc = useLocationRecord();
  const hubHref = loc.link(loc.base);
  if (loc.loading) return <div className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm text-text-soft">Loading location…</div>;
  if (loc.error || !loc.record) return <div role="alert" className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm font-semibold text-text-danger">{loc.error || 'Location not found'}</div>;
  return <MobileV2LocationRecord record={loc.record} returnTo={hubHref} verificationToken={loc.verificationToken} backHref={loc.back ?? '/m/stock'} />;
}

export default function LocationHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <LocationHubInner />
    </Suspense>
  );
}
