'use client';

/**
 * `/m/unbox` — what to unbox next. Arrived, not-yet-opened cartons, most
 * urgent shelf first: tier (Priority → Low), then shelf in rack order, then
 * oldest first within a shelf (a shelf is FIFO — the box that has waited
 * longest is at the front). A card opens the carton record `/m/r/[id]`.
 *
 * Its own screen, not a block over `/m/receiving`: that screen is the photo
 * feed of cartons already opened; this is the queue of cartons not yet opened.
 * One job per screen (SURFACE_LAW R1).
 *
 * With no urgency shelves configured the screen says so above the list and
 * still orders the arrivals by their own urgency.
 */

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MobileRecordCard, MobileRecordCardList, type MobileRecordCardTone } from '@/design-system/components/MobileRecordCard';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { Button } from '@/design-system/primitives';
import { qk } from '@/queries/keys';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { fetchUnboxNext, type UnboxNextAnswer } from '@/lib/receiving/arrival-placement-client';
import { arrivalTierLabel } from '@/lib/receiving/arrival-tier';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { formatLaneAgeCompact } from '@/utils/date';

const UNBOX_PATH = '/m/unbox';

type UnboxItem = UnboxNextAnswer['items'][number];

const NO_SHELVES_HINT =
  'Mark rack shelves Priority · High · Medium · Low on the desk (Inventory › Locations › Manage). Until then cartons are listed by their own urgency.';

/** Tier 0..3 (Priority → Low) as the card's state tone — urgency heats the rail. */
const TIER_TONE: Record<number, MobileRecordCardTone> = { 0: 'bad', 1: 'warn', 2: 'neutral', 3: 'neutral' };

function UnboxCard({ item, onOpen }: { item: UnboxItem; onOpen: () => void }) {
  const vendor = item.vendor ?? (item.sourcePlatform ? sourcePlatformLabel(item.sourcePlatform) : null);
  const waited = formatLaneAgeCompact(item.doorReceivedAt);
  const shelf = item.shelfCode ?? item.shelfFace;
  return (
    <MobileRecordCard
      identity={shelf ?? 'Not shelved'}
      timestamp={waited ? `Waiting ${waited}` : null}
      title={[vendor, item.poNumber ? `PO ${item.poNumber}` : null].filter(Boolean).join(' · ') || `Carton ${item.receivingId}`}
      detail={item.tracking ? `Tracking ${item.tracking}` : null}
      facts={item.shelfFace && item.shelfFace !== shelf ? [{ label: 'Shelf', value: item.shelfFace }] : undefined}
      count={`${item.lineCount} ${item.lineCount === 1 ? 'line' : 'lines'}`}
      status={arrivalTierLabel(item.tier)}
      tone={TIER_TONE[item.tier] ?? 'neutral'}
      onOpen={onOpen}
      testId="unbox-next-row"
    />
  );
}

export function MobileV2UnboxNext() {
  const router = useRouter();
  const query = useQuery({
    queryKey: qk.cartons.unboxNext(),
    queryFn: fetchUnboxNext,
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

  const { shelvesConfigured, items } = query.data;
  if (items.length === 0) {
    return (
      <div className="px-mode-page" data-mobile-architecture="v2">
        <EmptyState
          title={shelvesConfigured ? 'Nothing waiting to unbox' : 'No urgency shelves configured'}
          description={shelvesConfigured ? 'Every arrived carton has been opened.' : NO_SHELVES_HINT}
        />
      </div>
    );
  }

  return (
    <div className="bg-mode-panel" data-mobile-architecture="v2">
      {!shelvesConfigured ? (
        <section className="border-b border-mode-rule px-mode-page py-3" role="status">
          <p className="text-role-body font-semibold text-mode-ink">No urgency shelves configured</p>
          <p className="mt-0.5 text-role-caption text-mode-muted">{NO_SHELVES_HINT}</p>
        </section>
      ) : null}
      <MobileRecordCardList label={`${items.length} to unbox · most urgent first`}>
        {items.map((item) => (
          <UnboxCard key={item.receivingId} item={item} onOpen={() => router.push(withJobReturn(`/m/r/${item.receivingId}`, UNBOX_PATH))} />
        ))}
      </MobileRecordCardList>
    </div>
  );
}
