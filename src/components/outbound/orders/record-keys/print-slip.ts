'use client';

/**
 * Print packing slip — one click (or the record key) instead of Paperwork →
 * slip tab → Print. The slip on file prints through the browser; with none on
 * file the open record shows Paperwork on the slip tab (upload / fetch live
 * there).
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OutboundDocumentsResponse } from '@/lib/documents/types';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import { orderDocumentsKey, pickOrderDocument, printDocument } from '@/lib/orders/order-paperwork-client';
import { dispatchOpenOrderPaperwork } from '@/utils/events';
import { toast } from '@/lib/toast';

/** The print-slip record key and verb letter — P is the strip's Print (product labels). */
export const PRINT_SLIP_HOTKEY = 'm';

export function usePrintPackingSlip(orderId: number): { print: () => void; pending: boolean } {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const print = () => {
    if (pending || !Number.isFinite(orderId) || orderId <= 0) return;
    setPending(true);
    // Same cache as `useOrderDocuments` — fresh on demand, reused when warm.
    void queryClient
      .fetchQuery({
        queryKey: orderDocumentsKey(orderId),
        queryFn: async () => {
          const res = await fetch(`/api/orders/${orderId}/documents`, { credentials: 'same-origin' });
          const body = (await res.json().catch(() => ({}))) as OutboundDocumentsResponse & { error?: string };
          if (!res.ok) throw new Error(body.error || 'Could not load documents.');
          return body;
        },
        staleTime: 30_000,
      })
      .then((data) => {
        const src = outboundDocumentContentSrc(pickOrderDocument(data.documents ?? [], 'packing_slip', null));
        if (src) {
          printDocument(src);
          return;
        }
        dispatchOpenOrderPaperwork(orderId, 'packing_slip');
        toast.info('No packing slip on file');
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not load documents.'))
      .finally(() => setPending(false));
  };

  return { print, pending };
}
