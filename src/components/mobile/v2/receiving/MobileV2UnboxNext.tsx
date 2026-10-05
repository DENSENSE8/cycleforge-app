'use client';

/**
 * `/m/unbox` — what to unbox next. Arrived, not-yet-opened packages, urgent
 * first, then oldest door time first (`GET /api/receiving/unbox-next`). Each
 * row: urgency, the location it sits on, tracking, and the first item title
 * (or "Unfound"). A row opens the package record `/m/r/[id]`.
 *
 * Its own screen, not a block over `/m/receiving`: that screen is the photo
 * feed of packages already opened; this is the queue of packages not yet
 * opened. One job per screen (SURFACE_LAW R1).
 */

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { Button } from '@/design-system/primitives';
import { qk } from '@/queries/keys';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { fetchUnboxQueue } from '@/lib/receiving/arrival-client';
import type { UnboxQueueItem } from '@/lib/receiving/arrival-contract';
import { formatLaneAgeCompact } from '@/utils/date';

const UNBOX_PATH = '/m/unbox';

function UnboxCard({ item, onOpen }: { item: UnboxQueueItem; onOpen: () => void }) {
  const waited = formatLaneAgeCompact(item.doorReceivedAt);
  const facts = [item.platformLabel, item.orderNumber ? `Order ${item.orderNumber}` : null, item.vendor].filter(Boolean);
  return (
    <MobileRecordCard
      identity={item.location?.code ?? 'Not placed'}
      timestamp={waited ? `Waiting ${waited}` : null}
      title={item.found ? (item.title ?? `Package ${item.receivingId}`) : 'Unfound'}
      detail={item.tracking ? `Tracking ${item.tracking}` : null}
      facts={facts.length > 0 ? [{ label: 'From', value: facts.join(' · ') }] : undefined}
      count={`${item.lineCount} ${item.lineCount === 1 ? 'line' : 'lines'}`}
      status={item.urgency.urgent ? 'Urgent' : 'Not urgent'}
      tone={item.urgency.urgent ? 'bad' : 'neutral'}
      onOpen={onOpen}
      testId="unbox-next-row"
    />
  );
}

export function MobileV2UnboxNext() {
  const router = useRouter();
  const query = useQuery({
    queryKey: qk.cartons.unboxNext(),
    queryFn: fetchUnboxQueue,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  if (query.isPending) {
    return <p className="px-mode-page py-10 text-center text-role-body font-semibold text-mode-muted">Loading the unbox queue…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-center gap-3 px-mode-page py-10 text-center">
        <p className="text-role-body font-semibold text-text-danger">Could not load the unbox queue</p>
        <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const items = query.data;
  if (items.length === 0) {
    return (
      <div className="px-mode-page" data-mobile-architecture="v2">
        <EmptyState title="Nothing waiting to unbox" description="Every arrived package has been opened." />
      </div>
    );
  }

  return (
    <div className="bg-mode-panel" data-mobile-architecture="v2">
      <MobileRecordCardList label={`${items.length} to unbox · urgent first`}>
        {items.map((item) => (
          <UnboxCard key={item.receivingId} item={item} onOpen={() => router.push(withJobReturn(`/m/r/${item.receivingId}`, UNBOX_PATH))} />
        ))}
      </MobileRecordCardList>
    </div>
  );
}
