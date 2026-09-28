'use client';

/** Void an in-app ShipStation label from the order record (PIN step-up gated). */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithStepUp } from '@/components/auth/StepUpModal';
import { useStepUp } from '@/components/providers/StepUpProvider';
import { orderLabelSummaryKey } from '@/lib/orders/order-paperwork-client';
import type { OrderLabelEntry } from '@/lib/shipping/order-label-links';
import { orderTrackingHistoryKey } from './tracking-history-client';

export type VoidReason = 'replaced' | 'voided_from_record';

/** A label the record may void: bought here, still live, with a ShipStation label id. */
export function isVoidableLabel(label: OrderLabelEntry): boolean {
  return label.creationType === 'bought_in_app' && label.status === 'purchased' && !!label.labelId;
}

export function useVoidOrderLabel(orderId: number) {
  const queryClient = useQueryClient();
  const requestStepUp = useStepUp();
  return useMutation({
    mutationFn: async ({ label, reason }: { label: OrderLabelEntry; reason: VoidReason }) => {
      const res = await fetchWithStepUp(
        '/api/shipping/order-labels/void',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            labelId: label.labelId,
            reason,
            shipmentId: label.shipmentId ?? undefined,
            documentId: label.labelDocumentId ?? undefined,
          }),
        },
        requestStepUp,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not void the label.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
      void queryClient.invalidateQueries({ queryKey: orderTrackingHistoryKey(orderId) });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
