'use client';

/**
 * Where one SKU exception is stocked, and the door to count it anywhere.
 *
 * Every row — and the "another location" field — opens the pairing keypad
 * (`/m/pair/[code]/[sku]?from=on-hold`), so a per-location count is the same
 * stock write every other bin count is, and Back/Confirm return to the record.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, MapPin } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives';
import { locationCode, parseLocationCodeFlat, unwrapScannedLocation } from '@/lib/barcode-routing';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { SkuExceptionSection } from './SkuExceptionSection';

function locationFace(barcode: string): string {
  const segs = parseLocationCodeFlat(barcode);
  return segs ? locationCode(segs) : barcode;
}

export function SkuExceptionLocations({ item }: { item: ProvisionalSku }) {
  const router = useRouter();
  const [locationInput, setLocationInput] = useState('');

  const countAt = (barcode: string) =>
    router.push(`/m/pair/${encodeURIComponent(barcode)}/${encodeURIComponent(item.sku)}?from=on-hold`);

  return (
    <SkuExceptionSection id="sku-exception-locations" heading="Locations">
      {item.locations.length > 0 ? (
        <ul className="divide-y divide-border-hairline border-y border-border-hairline bg-surface-card">
          {item.locations.map((location) => {
            const face = locationFace(location.barcode);
            return (
              <li key={location.locationId}>
                {/* ds-raw-button: a full-bleed list row, as TriageRow's inspect half. */}
                <button
                  type="button"
                  aria-label={`Count ${item.productTitle} at ${face}`}
                  onClick={() => countAt(location.barcode)}
                  className="ds-raw-button flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-hover"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-text-soft" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-role-body font-semibold text-text-default">
                      {face}
                    </span>
                    {location.room ? (
                      <span className="block truncate text-role-caption text-text-soft">{location.room}</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-role-body font-semibold tabular-nums text-text-default">
                    {location.qty}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3 py-3 text-role-caption text-text-soft">Not counted into any location yet.</p>
      )}
      <form
        className="flex items-stretch gap-2 px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          // A wedge scan or a typed face (`A-01-01-1-01`) → the flat barcode.
          const unwrapped = unwrapScannedLocation(locationInput);
          const compact = unwrapped.replace(/-/g, '').toUpperCase();
          const code = parseLocationCodeFlat(compact) ? compact : unwrapped;
          if (code) countAt(code);
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
        <Button type="submit" variant="secondary" size="lg" radius="flush" disabled={!locationInput.trim()}>
          Count
        </Button>
      </form>
    </SkuExceptionSection>
  );
}
