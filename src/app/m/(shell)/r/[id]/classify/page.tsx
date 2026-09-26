'use client';

import { Suspense, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobileArrivalClassifyFlow } from '@/components/mobile/receiving/MobileArrivalClassifyFlow';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { mobileJobReturn, withJobReturn } from '@/lib/mobile/nav-trail';
import {
  parseArrivalClassifyStep,
  parseArrivalTypeHint,
  type ArrivalClassifyStep,
} from '@/lib/receiving/arrival-mobile-flow';

/** `/m/r/[id]/classify` — the carton hub's Classify door: */
function CartonClassifyInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = Number(params?.id);
  const step = parseArrivalClassifyStep(searchParams?.get('step'));
  const typeHint = parseArrivalTypeHint(searchParams?.get('type'));
  const back = mobileJobReturn(searchParams?.get('back'));
  const hub = back ? withJobReturn(`/m/r/${id}`, back) : `/m/r/${id}`;

  const stepHref = useCallback(
    (next: ArrivalClassifyStep) => {
      const query = new URLSearchParams({ step: next });
      if (typeHint) query.set('type', typeHint);
      if (back) query.set('back', back);
      return `/m/r/${id}/classify?${query.toString()}`;
    },
    [id, typeHint, back],
  );

  if (!Number.isInteger(id) || id <= 0) {
    return <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Not a carton id.</p>;
  }
  return (
    <ModeRegion mode="triage" className="contents">
      <MobileArrivalClassifyFlow
        receivingId={id}
        step={step}
        typeHint={typeHint}
        stepHref={stepHref}
        exit={{ href: hub, label: 'Back to carton' }}
      />
    </ModeRegion>
  );
}

export default function CartonClassifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <CartonClassifyInner />
    </Suspense>
  );
}
