'use client';

import type { CartonReadiness } from '@/lib/receiving/carton-readiness';

export function ReceivingReadinessCallout({
  readiness,
}: {
  readiness: CartonReadiness;
}) {
  // Single terse line. The per-stage timestamps (scanned / unboxed / received)
  // live in the pipeline stage rows directly below, so no hint line here.
  return <p className="text-sm font-semibold text-text-default">{readiness.nextStep}</p>;
}
