'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { LABEL_INGESTIONS_QUERY_KEY } from '@/lib/label-ingestions/http-client';
import { ORDER_PACKETS_KEY_ROOT } from '@/lib/label-prints/order-packets-client';

/**
 * After any slot write: re-read every Orders page (slots, status, counts) and
 * the label ledger (suggestions, unpaired labels). Every pane mutation settles
 * through this one refresh.
 */
export function usePacketRefresh(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ORDER_PACKETS_KEY_ROOT }),
      queryClient.invalidateQueries({ queryKey: LABEL_INGESTIONS_QUERY_KEY }),
    ]);
  }, [queryClient]);
}
