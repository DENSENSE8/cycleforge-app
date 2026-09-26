'use client';

import { Suspense } from 'react';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { locationUnits, useLocationRecord } from '@/components/mobile/location/useLocationRecord';
import type { LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';

/**
 * `/m/loc/[code]/info` — every fact about the location, read-only. Stock
 * moves on the hub (± strip, keypad); location properties are a desk edit, so
 * this screen carries no pencil.
 */
function LocationInfoInner() {
  const loc = useLocationRecord();
  return (
    <DetailRecordFrame<LocationRecord>
      record={loc.record}
      state={{ loading: loc.loading, error: loc.error, onRetry: loc.reload }}
      bar={{
        title: loc.face,
        mono: true,
        subtitle: 'Location details',
        backHref: loc.link(loc.base),
      }}
    >
      {(r) => (
        <div className="flex-1 divide-y divide-mode-rule">
          <DetailFacts>
            <DetailFact label="Location" value={r.face} mono copy={r.face} />
            <DetailFact label="Code" value={r.code} mono copy={r.code} />
            <DetailFact label="Room" value={r.room ?? null} />
            <DetailFact label="SKUs" value={String(r.contents.length)} />
            <DetailFact label="Units" value={String(locationUnits(r.contents))} />
          </DetailFacts>
          {r.contents.length > 0 && (
            <>
              <DetailSectionHeading>Contents</DetailSectionHeading>
              <DetailFacts label="Contents">
                {r.contents.map((row) => (
                  <DetailFact
                    key={row.sku}
                    label={row.sku}
                    value={String(row.qty)}
                    hint={row.productTitle?.trim() || undefined}
                    copy={row.sku}
                  />
                ))}
              </DetailFacts>
            </>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function LocationInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <LocationInfoInner />
    </Suspense>
  );
}
