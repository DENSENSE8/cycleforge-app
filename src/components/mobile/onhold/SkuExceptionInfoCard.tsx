'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { mobileSkuExceptionScreenHref } from '@/lib/inventory/sku-exception-links';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

const ON_HOLD_CHIP = `${STATE_TONE_CLASSES.warning.pill} ${STATE_TONE_CLASSES.warning.border}`;

/**
 * The SKU exception hub's summary card: the product as the operator named it,
 * what it looks like (description), where it is and how many, and the scanned
 * barcode bottom-left beside the On hold chip ("No barcode" for a placeholder
 * created without one — its `/info` edit attaches it). The whole card opens
 * `/info`, which owns every fact and the only edit. Layout is {@link DetailSummaryCard}.
 */
export function SkuExceptionInfoCard({ item }: { item: ProvisionalSku }) {
  const locations = item.locations.length;
  return (
    <DetailSummaryCard
      href={mobileSkuExceptionScreenHref(item.sku, 'info')}
      ariaLabel="SKU exception details"
      title={item.productTitle}
      titleHint={item.productTitle}
      lines={[
        { text: item.description?.trim() || 'No description', muted: !item.description?.trim() },
        {
          text: `${item.stock} on hand · ${locations === 0 ? 'no location' : `${locations} location${locations === 1 ? '' : 's'}`}`,
          muted: true,
        },
      ]}
      foot={item.barcode ? `UPC ${item.barcode}` : 'No barcode'}
      chip={{ label: 'On hold', className: ON_HOLD_CHIP }}
    />
  );
}
