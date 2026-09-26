'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import type { FnskuRecord } from './useFnskuRecord';

/**
 * The FNSKU hub's read-only summary on {@link DetailSummaryCard}: the catalog
 * title, ASIN · seller SKU, the condition the label prints, the FNSKU
 * bottom-left. The whole card opens `/info`.
 */
export function FnskuSummaryCard({ record, href }: { record: FnskuRecord; href: string }) {
  const title = record.product_title?.trim();
  const ids = [record.asin && `ASIN ${record.asin}`, record.sku && `SKU ${record.sku}`].filter(Boolean).join(' · ');
  return (
    <DetailSummaryCard
      href={href}
      ariaLabel="FNSKU details"
      title={title || 'No title in the FBA catalog'}
      titleHint={title || undefined}
      lines={[
        { text: ids },
        { text: record.condition?.trim() || 'No condition on file', muted: !record.condition?.trim() },
      ]}
      foot={record.fnsku}
      chip={null}
      chipFallback={record.is_active === false ? 'Inactive' : 'Active'}
    />
  );
}
