'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { outboundOrderByIdQuery } from '@/lib/queries/outbound-queries';
import { ShippedDetailsPanel } from '@/components/shipped/ShippedDetailsPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';

/**
 * Staged-order detail slide-over — the shared `ShippedDetailsPanel` (context
 * "staged") wired to `outboundOrderByIdQuery`. Used by the Scan-out staged queue
 * and the Labels-station Recent tab, so both open an identical detail on a row.
 */
export function StagedOrderDetail({
  orderId,
  onClose,
}: {
  orderId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: order, isLoading, isError, refetch } = useQuery(outboundOrderByIdQuery(orderId));

  const handleUpdate = useCallback(() => {
    bustScanOutCaches(queryClient);
    void refetch();
  }, [queryClient, refetch]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card">
        <LoadingSpinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  if (isError || !order) return null;

  return (
    <ShippedDetailsPanel shipped={order} onClose={onClose} onUpdate={handleUpdate} context="staged" />
  );
}
