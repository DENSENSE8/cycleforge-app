'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, MessageSquare } from '@/components/Icons';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { useSerialUnitDetail } from './types';
import { UnitDetailHeader } from './UnitDetailHeader';
import { UnitQualityPanel } from './UnitQualityPanel';
import { SerialUnitTimelineSection } from './SerialUnitTimelineSection';
import { UNIT_SCAN_PHOTOS } from '@/lib/station/flags';
import {
  IdentityCard,
  LocationCard,
  OrderCard,
  TimelineCard,
  AllocationsCard,
  ConditionsCard,
  TsnLinksCard,
  DetailEmptyState,
  DetailLoadingState,
  DetailErrorState,
} from './cards';

/**
 * Unit detail workspace — main pane for `?view=labels` Recent and History
 * sub-views (fed by `?historyId=`). Printing lives on the Products sub-view;
 * this pane is a pure read view of one unit: a 40px linkage header
 * (inventory / compatibility / similar popovers), an identity summary
 * (serial, SKU, condition, status), a working location card, and the full
 * lifecycle timeline + condition / allocation / tech-scan history.
 */
export function UnitDetailWorkspace() {
  const searchParams = useSearchParams();
  const historyId = searchParams.get('historyId') || '';
  const fromRecent = searchParams.get('labelsView') === 'recent';

  const { data, isLoading, isError, error, refetch } = useSerialUnitDetail(historyId);

  if (!historyId) return <DetailEmptyState fromRecent={fromRecent} />;
  if (isLoading) return <DetailLoadingState />;
  if (isError) {
    return <DetailErrorState message={error instanceof Error ? error.message : 'Failed to load unit'} />;
  }
  if (!data) return <DetailEmptyState fromRecent={fromRecent} />;

  const unit = data.serial_unit;
  const allocations = data.allocations ?? [];
  const activeAllocation = allocations.find((a) => a.state !== 'RELEASED') ?? null;

  return (
    <div className="flex h-full flex-col bg-surface-canvas">
      <UnitDetailHeader
        unit={unit}
        stock={data.stock}
        locationDetail={data.location_detail}
        activeAllocation={activeAllocation}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-6">
          <IdentityCard unit={unit} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LocationCard location={unit.current_location} detail={data.location_detail} />
            <OrderCard allocation={activeAllocation} />
          </div>

          <UnitQualityPanel serialUnitId={unit.id} />

          <TimelineCard
            events={data.events_full ?? data.events ?? []}
            photos={data.photos ?? []}
            onPhotoChanged={() => void refetch()}
          />
          <ConversationCard serialUnitId={unit.id} />
          {UNIT_SCAN_PHOTOS && <SerialUnitTimelineSection serialUnitId={unit.id} />}
          {allocations.length > 0 && <AllocationsCard rows={allocations} />}
          {(data.conditions?.length ?? 0) > 0 && <ConditionsCard rows={data.conditions ?? []} />}
          {(data.tsn_links?.length ?? 0) > 0 && <TsnLinksCard rows={data.tsn_links ?? []} />}
        </div>
      </div>
    </div>
  );
}

/** Collapsible entity-conversation card — the SERIAL_UNIT anchor's ThreadPanel. */
function ConversationCard({ serialUnitId }: { serialUnitId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl bg-surface-card shadow-sm ring-1 ring-border-soft/60">
      {/* ds-raw-button: full-width card-header disclosure toggle, not a Button action */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-role-eyebrow uppercase tracking-[0.14em] text-text-soft">
          <MessageSquare className="h-3.5 w-3.5" /> Conversation
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-faint" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-faint" />
        )}
      </button>
      {open ? (
        <div className="border-t border-border-hairline">
          <ThreadPanel entityType="SERIAL_UNIT" entityId={serialUnitId} dense className="max-h-[26rem]" />
        </div>
      ) : null}
    </section>
  );
}
