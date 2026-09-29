'use client';

/** The carton block every receiving resolver (Claim · Short · Unfound) opens with. */

import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import { formatMonthDayTimePST } from '@/utils/date';

export function CartonFacts({ carton }: { carton: CartonExceptionFacts['carton'] }) {
  return (
    <DetailFacts label="Carton">
      <DetailFact label="PO" value={carton.poNumber} mono copy={carton.poNumber} />
      <DetailFact label="Tracking" value={carton.tracking} mono copy={carton.tracking} />
      <DetailFact label="Carrier" value={carton.carrier} />
      <DetailFact label="Unboxed" value={carton.unboxedAt ? formatMonthDayTimePST(carton.unboxedAt) : null} />
    </DetailFacts>
  );
}
