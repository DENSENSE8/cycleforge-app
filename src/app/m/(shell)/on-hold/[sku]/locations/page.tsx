'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DetailNav, type DetailNavItem } from '@/components/mobile/detail/DetailParts';
import { SkuExceptionScreen } from '@/components/mobile/onhold/SkuExceptionScreen';
import { MapPin } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import { parseLocationCodeFlat, unwrapScannedLocation } from '@/lib/barcode-routing';
import {
  mobileSkuExceptionHref,
  skuExceptionLocationFace,
} from '@/lib/inventory/sku-exception-links';

/** The count keypad for one (location, SKU) — the same stock write every bin count is. */
function countHref(barcode: string, sku: string): string {
  return `/m/pair/${encodeURIComponent(barcode)}/${encodeURIComponent(sku)}?from=on-hold`;
}

/**
 * `/m/on-hold/[sku]/locations` — where the SKU exception is stocked and how
 * many. Each location opens the count keypad (`/m/pair/[code]/[sku]`); the job
 * bar puts it into another location by scan or typed code. Back and Confirm on
 * the keypad return here.
 */
function SkuExceptionLocationsInner() {
  const params = useParams<{ sku: string }>();
  const sku = decodeURIComponent(params?.sku ?? '');
  const router = useRouter();
  const [locationInput, setLocationInput] = useState('');

  const submitLocation = () => {
    // A wedge scan or a typed face (`A-01-01-1-01`) → the flat barcode.
    const unwrapped = unwrapScannedLocation(locationInput);
    const compact = unwrapped.replace(/-/g, '').toUpperCase();
    const code = parseLocationCodeFlat(compact) ? compact : unwrapped.trim();
    if (code) router.push(countHref(code, sku));
  };

  return (
    <SkuExceptionScreen
      sku={sku}
      subtitle="Locations"
      backHref={mobileSkuExceptionHref(sku)}
      meta={(item) => `${item.stock} on hand`}
    >
      {(item) => {
        const rows: DetailNavItem[] = item.locations.map((loc) => ({
          id: String(loc.locationId),
          title: skuExceptionLocationFace(loc.barcode),
          icon: <MapPin />,
          meta: `${loc.qty} on hand${loc.room ? ` · ${loc.room}` : ''} — tap to count`,
          href: countHref(loc.barcode, item.sku),
        }));
        return (
          <>
            <div className="flex-1 space-y-4 px-mode-page py-mode-page">
              {rows.length > 0 ? (
                <DetailNav label="Locations holding this SKU" rows={rows} />
              ) : (
                <p className="py-10 text-center text-role-caption text-mode-muted">
                  Not in a location yet. Scan or type the location it sits in, then count it.
                </p>
              )}
            </div>
            <form
              aria-label="Put in another location"
              className="sticky bottom-0 z-sticky flex items-end gap-2 border-t border-mode-rule bg-mode-bar px-mode-page pt-2"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
              onSubmit={(event) => {
                event.preventDefault();
                submitLocation();
              }}
            >
              <TextField
                label="Put in another location"
                value={locationInput}
                onChange={setLocationInput}
                mono
                autoComplete="off"
                autoCapitalize="characters"
                enterKeyHint="go"
                className="flex-1"
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="min-h-mode-hit-cta rounded-mode px-4"
                disabled={!locationInput.trim()}
              >
                Count
              </Button>
            </form>
          </>
        );
      }}
    </SkuExceptionScreen>
  );
}

export default function SkuExceptionLocationsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <SkuExceptionLocationsInner />
    </Suspense>
  );
}
