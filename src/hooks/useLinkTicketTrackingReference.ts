'use client';

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { supportContextQueryKey } from './useSupportContext';

type LinkedTicketTrackingReference = {
  shipmentId: number;
  isPrimary: boolean;
  added: boolean;
};

export function invalidateSupportContextCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['support-context'] });
  void qc.invalidateQueries({ queryKey: ['order-linkage'] });
  void qc.invalidateQueries({ queryKey: ['support-ticket'] });
  void qc.invalidateQueries({ queryKey: ['zendesk', 'ticket'] });
  void qc.invalidateQueries({ queryKey: supportContextQueryKey({}) });
}

export function useLinkTicketTrackingReference({
  ticketId,
  onSuccess,
}: {
  ticketId: number | null | undefined;
  onSuccess?: (reference: LinkedTicketTrackingReference) => void;
}) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (trackingNumber: string) => {
      if (ticketId == null) {
        throw new Error('No ticket to attach tracking to');
      }

      const res = await fetch('/api/support/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          reference: { trackingNumber },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.details || 'Could not link tracking');
      }
      return data as LinkedTicketTrackingReference;
    },
    onSuccess: (reference) => {
      invalidateSupportContextCaches(qc);
      toast.success(reference.added ? 'Tracking linked' : 'Tracking already linked');
      onSuccess?.(reference);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not link tracking');
    },
  });
}
