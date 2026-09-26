'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import type { LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { locationUnits } from './useLocationRecord';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The location hub's read-only summary on {@link DetailSummaryCard}: room,
 * how many SKUs and units it holds, the flat code bottom-left. The whole card
 * opens `/info`.
 */
export function LocationSummaryCard({ record, href }: { record: LocationRecord; href: string }) {
  const units = locationUnits(record.contents);
  const skus = record.contents.length;
  return (
    <DetailSummaryCard
      href={href}
      ariaLabel="Location details"
      title={record.room ?? 'Location'}
      lines={[
        { text: skus ? `${plural(skus, 'SKU')} · ${plural(units, 'unit')}` : 'Nothing paired here yet' },
      ]}
      foot={record.code}
      chip={null}
      chipFallback={skus ? 'Paired' : 'Empty'}
    />
  );
}
