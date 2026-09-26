'use client';

import { Suspense } from 'react';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useFnskuRecord } from '@/components/mobile/fnsku/useFnskuRecord';
import type { FnskuRecord } from '@/components/mobile/fnsku/useFnskuRecord';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * `/m/fnsku/[fnsku]/info` — every fact the FBA catalog holds for this FNSKU,
 * read-only. The catalog is edited on the desk (FBA → FNSKUs), so this screen
 * carries no pencil.
 */
function FnskuInfoInner() {
  const rec = useFnskuRecord();
  return (
    <DetailRecordFrame<FnskuRecord>
      record={rec.record}
      state={rec.state}
      bar={{ title: rec.fnsku, mono: true, subtitle: 'FBA label details', backHref: rec.link(rec.base) }}
    >
      {(r) => (
        <div className="flex-1 divide-y divide-mode-rule">
          <DetailFacts>
            <DetailFact label="Title" value={r.product_title?.trim() || null} />
            <DetailFact label="FNSKU" value={r.fnsku} mono copy={r.fnsku} />
            <DetailFact label="Condition" value={r.condition?.trim() || null} />
            <DetailFact label="ASIN" value={r.asin || null} mono copy={r.asin} />
            <DetailFact label="Seller SKU" value={r.sku || null} mono copy={r.sku} />
            <DetailFact label="Catalog" value={r.is_active === false ? 'Inactive' : 'Active'} />
          </DetailFacts>
          <DetailSectionHeading>Dates</DetailSectionHeading>
          <DetailFacts label="Dates">
            <DetailFact label="Added" value={r.created_at ? formatMonthDayTimePST(r.created_at) : null} />
            <DetailFact label="Updated" value={r.updated_at ? formatMonthDayTimePST(r.updated_at) : null} />
            <DetailFact label="Last seen" value={r.last_seen_at ? formatMonthDayTimePST(r.last_seen_at) : null} />
          </DetailFacts>
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function FnskuInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <FnskuInfoInner />
    </Suspense>
  );
}
