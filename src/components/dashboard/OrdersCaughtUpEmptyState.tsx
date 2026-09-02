'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { invalidateDashboardOrderQueries } from '@/lib/dashboard-query-invalidation';
import {
  ORDERS_CAUGHT_UP_TITLE,
  ordersCaughtUpDescription,
} from '@/lib/orders/orders-caught-up-copy';
import { shippedTodayHref } from '@/lib/shipping/shipped-desk';
import { toast } from '@/lib/toast';
import { getCurrentPSTDateKey } from '@/utils/date';

/**
 * Inbox-zero for To-ship when a sales channel is already linked and the queue
 * is empty because the work is done. Distinct from
 * {@link OrdersFirstRunEmptyState} (connect a channel).
 */
export function OrdersCaughtUpEmptyState({ shippedToday = 0 }: { shippedToday?: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const reviewShipped = () => {
    router.push(shippedTodayHref(getCurrentPSTDateKey()));
  };

  const syncOrders = async () => {
    if (syncing) return;
    setSyncing(true);
    const toastId = 'to-ship-caught-up-sync';
    toast.loading('Syncing orders…', { id: toastId });
    try {
      const res = await fetch('/api/integrations/google_sheets/sync', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        imported?: number;
        updated?: number;
      };
      if (!res.ok || data.ok === false) {
        toast.error(data.error || 'Could not sync orders', { id: toastId });
        return;
      }
      await invalidateDashboardOrderQueries(queryClient);
      const n = Number(data.imported ?? 0) + Number(data.updated ?? 0);
      toast.success(n > 0 ? `${n} orders` : 'Orders are up to date', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sync orders', { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <EmptyState
      icon={<Check className="h-6 w-6 text-text-faint" />}
      title={ORDERS_CAUGHT_UP_TITLE}
      description={ordersCaughtUpDescription(shippedToday)}
      action={
        <div
          data-testid="to-ship-caught-up-empty"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <Button type="button" variant="primary" size="sm" onClick={reviewShipped}>
            Review shipped
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={syncing}
            onClick={() => void syncOrders()}
          >
            Sync orders
          </Button>
        </div>
      }
    />
  );
}
