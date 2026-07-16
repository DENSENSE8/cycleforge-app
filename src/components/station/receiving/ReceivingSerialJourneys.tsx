'use client';

/**
 * Per-serial journey list for every serialized unit on a receiving carton.
 * Used from the receiving details Items tab ("Unit journeys" disclosure).
 */

import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { SerialJourneySection } from '@/components/serial/SerialJourneySection';
import { useCartonSerials } from '@/hooks/useCartonSerials';

export function ReceivingSerialJourneys({ receivingId }: { receivingId: number | string }) {
  const query = useCartonSerials(receivingId);
  const serials = query.serials;

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-role-caption font-medium text-text-faint">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading serials…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-semibold text-rose-600">
        Could not load this carton&rsquo;s serials.
        <Button
          variant="ghost"
          onClick={() => query.refetch()}
          className="ml-2 inline h-auto p-0 align-baseline text-rose-600 underline decoration-dotted hover:bg-transparent hover:text-rose-700"
        >
          Retry
        </Button>
      </div>
    );
  }
  if (serials.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center text-role-caption font-medium text-text-soft">
        No serialized units on this receiving yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {serials.map((sn) => (
        <SerialJourneySection
          key={sn}
          serialNumber={sn}
          title={serials.length > 1 ? `Serial journey · ${sn}` : 'Serial journey'}
          density="compact"
          className="border-t border-border-hairline pt-3 pb-2 first:border-t-0 first:pt-0"
        />
      ))}
    </div>
  );
}
