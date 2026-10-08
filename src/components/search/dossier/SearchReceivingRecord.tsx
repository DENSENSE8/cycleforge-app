'use client';

/**
 * `/search?sel=receiving:<id>` opens the same inbound carton record the
 * receiving desks open. Search resolves a real receiving line first because
 * the inbound record adapter is intentionally keyed by that desk row.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { Panel } from '@/design-system/primitives/Panel';
import { DeskStageRecordHeader } from '@/design-system/components/DeskStageOverlay';
import { DESK_STAGE_FIXED_CLASS } from '@/design-system/tokens/desk-stage';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { clearGlobalSearchPending, setGlobalSearchPending } from '@/lib/global-search-pending';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { CartonHubData } from '@/lib/receiving/carton-hub';
import { useInboundCartonRecord } from '@/components/receiving/record/useInboundRecord';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { cartonRecordTitle } from '@/components/receiving/history/use-carton-record';
import { cn } from '@/utils/_cn';

const SEARCH_RECEIVING_RECORD_STALE_MS = 20_000;

function receivingRecordLinesQuery(receivingId: number) {
  return {
    queryKey: ['search-receiving-record-lines', receivingId] as const,
    queryFn: async (): Promise<{ receiving_lines: ReceivingLineRow[] }> => {
      const response = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Failed to load receiving lines (${response.status})`);
      const data = (await response.json()) as { receiving_lines?: ReceivingLineRow[] };
      return { receiving_lines: Array.isArray(data.receiving_lines) ? data.receiving_lines : [] };
    },
    staleTime: SEARCH_RECEIVING_RECORD_STALE_MS,
  };
}

function cartonHubQuery(receivingId: number, enabled: boolean) {
  return {
    queryKey: ['search-receiving-carton', receivingId] as const,
    enabled,
    queryFn: async (): Promise<CartonHubData | null> => {
      const response = await fetch(`/api/receiving/${receivingId}`, { cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Failed to load carton (${response.status})`);
      const body = (await response.json()) as CartonHubData & { success?: boolean };
      if (!body?.receiving) return null;
      return body;
    },
    staleTime: SEARCH_RECEIVING_RECORD_STALE_MS,
  };
}

function LineLessCarton({ carton, onBack }: { carton: CartonHubData; onBack?: () => void }) {
  const router = useRouter();
  const tracking = carton.receiving.tracking;
  return (
    <section aria-label="Carton record" className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-mode-canvas">
      <div className={cn(DESK_STAGE_FIXED_CLASS, 'shrink-0')}>
        <DeskStageRecordHeader title={`Carton ${carton.receiving.id}`} actions={null} onClose={onBack} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <Panel radius="2xl" padding="sm" elevation="none" className="border border-border-soft bg-surface-card">
          <p className="text-sm font-semibold text-text-default">No lines yet</p>
          <p className="mt-1 text-sm text-text-muted">
            {tracking ? `Tracking ${tracking}` : 'This carton has no tracking on file.'}
          </p>
          <Button
            variant="secondary"
            size="lg"
            radius="surface"
            className="mt-3 min-h-11"
            onClick={() => router.push(`/m/r/${carton.receiving.id}`)}
          >
            Open carton
          </Button>
        </Panel>
      </div>
    </section>
  );
}
export function SearchReceivingRecord({
  receivingId,
  onBack,
}: {
  receivingId: number;
  onBack?: () => void;
}) {
  const linesQuery = useQuery(receivingRecordLinesQuery(receivingId));
  const row = linesQuery.data?.receiving_lines[0] ?? null;
  const linesReady = linesQuery.isSuccess;
  const cartonQuery = useQuery(cartonHubQuery(receivingId, linesReady && !row));
  const resolving = ((linesQuery.isPending || linesQuery.isLoading) && !linesQuery.data)
    || (linesReady && !row && cartonQuery.isPending);
  const inbound = useInboundCartonRecord(row, onBack ?? (() => undefined));
  const slot = useRecordSlot(
    inbound?.model ?? null,
    inbound?.verbs ?? [],
    row ? `${cartonRecordTitle(row)} actions` : 'Inbound record actions',
    'inbound-record',
  );

  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (!resolving) primaryPaint?.onPrimaryPainted();
  }, [resolving, primaryPaint]);
  useEffect(() => {
    setGlobalSearchPending(resolving);
    return () => clearGlobalSearchPending();
  }, [resolving]);

  if (resolving) return <div className="min-h-0 flex-1" aria-busy />;

  if (!row && cartonQuery.data?.receiving) {
    return <LineLessCarton carton={cartonQuery.data} onBack={onBack} />;
  }

  if (linesQuery.isError || cartonQuery.isError || !row || !slot) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-mode-canvas">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Inbound record not found"
          description="No receiving carton matched this selection. Try another search hit."
        />
      </div>
    );
  }

  return (
    <section
      aria-label="Inbound record"
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-mode-canvas"
      data-testid="search-inbound-record"
    >
      <div className={cn(DESK_STAGE_FIXED_CLASS, 'shrink-0')}>
        <DeskStageRecordHeader title={slot.title} onClose={onBack} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className={cn(DESK_STAGE_FIXED_CLASS, '@container flex flex-1 flex-col')}>
          {slot.view}
        </div>
      </div>
    </section>
  );
}
