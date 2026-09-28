'use client';

/** The order-note waist: */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshDomain } from '@/lib/refresh/bus';

interface OrderNoteDto {
  id: string;
  noteText: string;
  authorStaffId: number | null;
  authorName: string | null;
  /** Validated staff ids the note @mentions (token format: `@/lib/orders/note-mentions`). */
  mentionedStaffIds?: number[];
  createdAt: string;
}

function orderNotesQueryKey(orderId: number) {
  return ['order-notes', orderId] as const;
}

export function useOrderNotes(orderId: number) {
  return useQuery({
    queryKey: orderNotesQueryKey(orderId),
    queryFn: async (): Promise<OrderNoteDto[]> => {
      const res = await fetch(`/api/orders/${orderId}/notes`);
      if (!res.ok) throw new Error(`order notes ${res.status}`);
      const data = (await res.json()) as { notes?: OrderNoteDto[] };
      return data.notes ?? [];
    },
    staleTime: 30_000,
  });
}

export function useAppendOrderNote(orderId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteText: string) => {
      if (!Number.isFinite(orderId) || orderId <= 0) {
        throw new Error('order id required');
      }
      const res = await fetch(`/api/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText }),
      });
      if (!res.ok) throw new Error(`add note ${res.status}`);
      const data = (await res.json()) as { note: OrderNoteDto };
      return data.note;
    },
    onSuccess: (note) => {
      // Prepend rather than refetch: the list is newest-first and the server
      // already returned the resolved author, so the optimistic row matches
      // exactly what a refetch would produce.
      queryClient.setQueryData<OrderNoteDto[]>(orderNotesQueryKey(orderId), (prev) =>
        prev ? [note, ...prev] : [note],
      );
      // The row's annotation indicator reads `note_count` off the queue query.
      refreshDomain('orders.outbound');
    },
  });
}
