'use client';

import { useQuery } from '@tanstack/react-query';
// From the light refs module — importing via lib/support/tickets drags the
// server-only tenancy/db (Neon driver) into this client bundle.
import { normalizeReceivingTicketEntityRefs } from '@/lib/support/ticket-refs';

export interface EntitySupportTicket {
  id: number;
  label: string;
  provider: string;
  externalTicketId: string | null;
  /** Provider-native id for Zendesk thread/unlink APIs (not the display id). */
  providerTicketId: number | null;
  openUrl: string | null;
  subject: string | null;
  status: string | null;
}

export function entitySupportTicketQueryKey(
  lineId: number | null,
  receivingId: number | null,
  serialUnitId?: number | null,
) {
  return ['support-ticket', 'by-entity', lineId, receivingId, serialUnitId] as const;
}

export function useEntitySupportTicket(args: {
  lineId?: number | null;
  receivingId?: number | null;
  serialUnitId?: number | null;
  enabled?: boolean;
}) {
  const { lineId, receivingId } = normalizeReceivingTicketEntityRefs({
    lineId: args.lineId ?? null,
    receivingId: args.receivingId ?? null,
  });
  const serialUnitId = args.serialUnitId ?? null;
  const enabled =
    (args.enabled ?? true) && (lineId != null || receivingId != null || serialUnitId != null);

  return useQuery<EntitySupportTicket | null, Error>({
    queryKey: entitySupportTicketQueryKey(lineId, receivingId, serialUnitId),
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (lineId != null) sp.set('lineId', String(lineId));
      if (receivingId != null) sp.set('receivingId', String(receivingId));
      if (serialUnitId != null) sp.set('serialUnitId', String(serialUnitId));
      const res = await fetch(`/api/support/tickets/by-entity?${sp.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      return (data.ticket as EntitySupportTicket | null) ?? null;
    },
    enabled,
    staleTime: 15_000,
  });
}
