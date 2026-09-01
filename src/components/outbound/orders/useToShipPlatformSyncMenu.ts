'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { invalidateDashboardOrderQueries } from '@/lib/dashboard-query-invalidation';
import { toast } from '@/lib/toast';
import { qk } from '@/queries/keys';

export type ToShipPlatformSyncRow = {
  label: string;
  kind: 'provider' | 'more';
  disabled?: boolean;
  separatorBefore?: boolean;
  onClick: () => void;
};

type OrderSyncSource = {
  provider: string;
  label: string;
  canSync: boolean;
};

async function fetchOrderSources(): Promise<OrderSyncSource[]> {
  const res = await fetch('/api/integrations/order-sources');
  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) throw new Error('Failed to fetch order sources');
  const data = (await res.json().catch(() => ({}))) as { sources?: OrderSyncSource[] };
  return data.sources ?? [];
}

/**
 * Connected sales-channel sync rows for the To-ship Sync dropdown.
 *
 * Face click stays Google Sheet. The chevron lists each connected order
 * source by name (`Sync eBay · {connection}`, `Sync Ecwid · {store}`), then
 * Sync more → Settings › Integrations.
 */
export function useToShipPlatformSyncMenu(): ToShipPlatformSyncRow[] {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const sourcesQuery = useQuery({
    queryKey: qk.orderSyncSources,
    queryFn: fetchOrderSources,
    staleTime: 60_000,
    retry: false,
  });

  const syncProvider = useCallback(
    async (provider: string, label: string) => {
      if (busy) return;
      setBusy(provider);
      const toastId = `to-ship-sync-${provider}`;
      toast.loading(`Syncing ${label}…`, { id: toastId });
      try {
        const res = await fetch(`/api/integrations/${provider}/sync`, { method: 'POST' });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          imported?: number;
          updated?: number;
        };
        if (!res.ok || data.ok === false) {
          toast.error(data.error || `Could not sync ${label}`, { id: toastId });
          return;
        }
        await invalidateDashboardOrderQueries(queryClient);
        const n = Number(data.imported ?? 0) + Number(data.updated ?? 0);
        toast.success(n > 0 ? `${label}: ${n} orders` : `${label} is up to date`, {
          id: toastId,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not sync ${label}`, {
          id: toastId,
        });
      } finally {
        setBusy(null);
      }
    },
    [busy, queryClient],
  );

  return useMemo(() => {
    const items: ToShipPlatformSyncRow[] = [];

    for (const row of sourcesQuery.data ?? []) {
      items.push({
        label: row.label,
        kind: 'provider',
        disabled: busy != null || !row.canSync,
        onClick: () => void syncProvider(row.provider, row.label),
      });
    }

    items.push({
      label: 'Sync more',
      kind: 'more',
      separatorBefore: items.length > 0,
      onClick: () => router.push('/settings/integrations'),
    });

    return items;
  }, [busy, router, sourcesQuery.data, syncProvider]);
}
