'use client';

/**
 * Mobile Arrival Station (`/m/triage`) — recent arrivals + bottom scan dock.
 *
 * The authoritative recent list is `MobileReceivingList(surface="triage")`,
 * the same data waist as the desktop recent rail. A successful scan enters the
 * guided photos → classify flow; classify resumes from `?rid=&step=`.
 */

import { Suspense, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@/lib/toast';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { ScanInput } from '@/components/mobile/redesign/ScanInput';
import { MobileArrivalClassifyFlow } from '@/components/mobile/receiving/MobileArrivalClassifyFlow';
import { MobileReceivingList } from '@/components/mobile/receiving/MobileReceivingList';
import {
  mobileArrivalPhotosThenClassifyHref,
  parseArrivalClassifyStep,
  parseArrivalReceivingId,
} from '@/lib/receiving/arrival-mobile-flow';

function MobileArrivalStationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classifyRid = parseArrivalReceivingId(searchParams.get('rid'));
  const classifyStep = parseArrivalClassifyStep(searchParams.get('step'));
  const inFlight = useRef(false);

  const lookup = useCallback(
    async (value: string) => {
      const tracking = value.trim();
      if (!tracking || inFlight.current) return;
      inFlight.current = true;

      try {
        const res = await fetch('/api/receiving/lookup-po', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            trackingNumber: tracking,
            intakeSurface: 'triage',
            localOnly: true,
          }),
        });
        const data = await res.json().catch(() => null);
        const receivingId =
          typeof data?.receiving_id === 'number' ? data.receiving_id : null;

        if (!res.ok || receivingId == null) {
          toast.error(data?.error || 'Could not open this arrival');
          return;
        }

        router.push(
          mobileArrivalPhotosThenClassifyHref(receivingId, { title: tracking }),
        );
      } catch {
        toast.error('Could not open this arrival');
      } finally {
        inFlight.current = false;
      }
    },
    [router],
  );

  if (classifyRid != null) {
    return (
      <MobileArrivalClassifyFlow
        receivingId={classifyRid}
        step={classifyStep}
      />
    );
  }

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${TOKENS.colors.background}`}>
      <div className="min-h-0 flex-1 pb-10">
        <MobileReceivingList limit={25} surface="triage" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-surface-canvas via-surface-canvas/90 to-transparent pt-8">
        {/* Edge-to-edge bottom display — station scan bar is the band chrome. */}
        <div className="pointer-events-auto border-t border-border-soft bg-surface-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* No autoFocus: a focused empty field on a phone pops the OS paste
              callout under the operator's thumb. Tap the field to type. */}
          <ScanInput
            onDecode={(value) => void lookup(value)}
            placeholder="Scan or type tracking"
            prominentCamera
          />
        </div>
      </div>
    </div>
  );
}

export default function MobileArrivalStation() {
  return (
    <Suspense fallback={<div className={`h-full ${TOKENS.colors.background}`} />}>
      <MobileArrivalStationInner />
    </Suspense>
  );
}
