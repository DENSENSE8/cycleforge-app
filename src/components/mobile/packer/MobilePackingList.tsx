'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { MobilePackingRow } from '@/components/mobile/packer/MobilePackingRow';
import { MobilePackingSheet } from '@/components/mobile/packer/MobilePackingSheet';
import {
  CaptureStack,
  CaptureStackSkeleton,
  useCaptureStackWindow,
  useCaptureStackQuery,
} from '@/design-system/components/capture-stack';
import { GridDegradedBox } from '@/design-system/components/grid';
import type { PackerLogRow } from '@/components/mobile/packer/types';

/**
 * Mobile packer surface — mirror of {@link MobileReceivingList}. Recent packed
 * logs, newest pinned at the bottom; tap opens MobilePackingSheet, the expanded
 * card's camera chip jumps to /m/p/{packerLogId}/photos.
 *
 * Shares all display logic with the other mobile feeds via useCaptureStackQuery /
 * useCaptureStackWindow / CaptureStack. `limit` defaults to 8 (one phone screen).
 */
export function MobilePackingList({ packerId, limit = 8 }: { packerId: string; limit?: number }) {
  useRealtimeToasts('packer');

  const queryKey = useMemo(() => ['packer-logs-mobile', packerId] as const, [packerId]);

  const { data, isLoading, isError, refetch } = useCaptureStackQuery<PackerLogRow>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ packerId: String(packerId), limit: '30', offset: '0' });
      const res = await fetch(`/api/packerlogs?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      return Array.isArray(json) ? (json as PackerLogRow[]) : [];
    },
    realtime: { windowEvents: ['packer-log-updated'], refreshDomains: ['packer.logs'] },
  });

  const { rows, scrollRef, freshIds } = useCaptureStackWindow(data, { limit, anchor: 'bottom' });

  const [sheetRow, setSheetRow] = useState<PackerLogRow | null>(null);
  const openSheet = useCallback((row: PackerLogRow) => setSheetRow(row), []);
  const closeSheet = useCallback(() => setSheetRow(null), []);
  const buildPhotosHref = useCallback((row: PackerLogRow) => {
    if (!row.packer_log_id) return '#';
    // Carry the real order number so packer photos file under it in the library
    // (poRef) instead of the fallback PL-{id}. Guided Review starts on slip.
    const params = new URLSearchParams();
    const oid = (row.order_id || '').trim();
    if (oid) params.set('orderId', oid);
    params.set('step', 'slip');
    return `/m/p/${row.packer_log_id}/photos?${params.toString()}`;
  }, []);

  // Fourth settled state: failed fetch + nothing to show → Retry, never empty history copy.
  if (isError && rows.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-surface-card">
        <GridDegradedBox
          message="Couldn't load pack history."
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-surface-card">
      <CaptureStack<PackerLogRow>
        rows={rows}
        isLoading={isLoading}
        scrollRef={scrollRef}
        freshIds={freshIds}
        // Geometry-true stand-in — see CaptureStackSkeleton. Without it this
        // feed's largest element arrived only after hydrate + fetch (/m/pack:
        // FCP 485ms, LCP 1148ms observed, 8060ms simulated, Perf 65).
        loading={<CaptureStackSkeleton />}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-card px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">No pack history yet</p>
            <p className="max-w-[260px] text-role-caption font-semibold text-text-soft">
              Pack something at a desktop station — recent entries will land here.
            </p>
          </div>
        }
        renderRow={(row, { variant, fresh }) => (
          <MobilePackingRow
            row={row}
            variant={variant}
            fresh={fresh}
            onTap={() => openSheet(row)}
            photosHref={buildPhotosHref(row)}
          />
        )}
      />

      <MobilePackingSheet row={sheetRow} open={sheetRow != null} onClose={closeSheet} />
    </div>
  );
}
