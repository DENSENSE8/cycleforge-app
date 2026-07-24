'use client';

/**
 * Shared claim host for the Support station — the create/link orchestration
 * modeled on `useUnboxLineController.openClaimModal` + `LineEditModals`.
 *
 * LINK is already served everywhere by `SupportContextHub → LinkageStrip →
 * TicketLinkPopover` (order / receiving / tracking anchors), so this host owns the
 * missing half: CREATE. It opens the create modal for an optional anchor and runs
 * the `POST /api/support/tickets` mutation (helpdesk-facade create + optional link
 * through the shared waist). On success it returns the PROVIDER ticket id so the
 * caller can open the new ticket (`?ticket=<providerTicketId>`) with no URL-key
 * change, then invalidates the Support context caches.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { invalidateSupportContextCaches } from '@/hooks';
import type { TicketLinkAnchorInput } from '@/lib/support/ticket-link';
import type { SupportTicketLinkages } from '@/lib/support/create-ticket-linkages';

type SupportTicketCreateAnchor = TicketLinkAnchorInput;

interface CreateSupportTicketArgs {
  subject: string;
  note?: string | null;
  linkages?: SupportTicketLinkages | null;
}

interface CreatedSupportTicket {
  supportTicketId: number;
  providerTicketId: number;
}

export function useSupportTicketClaimHost() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [anchor, setAnchor] = useState<SupportTicketCreateAnchor | null>(null);
  /** Prefill order # when opening from an order-anchored surface. */
  const [defaultOrderNumber, setDefaultOrderNumber] = useState<string | null>(null);

  const openCreate = useCallback(
    (a?: SupportTicketCreateAnchor | null, opts?: { orderNumber?: string | null }) => {
      setAnchor(a ?? null);
      setDefaultOrderNumber(opts?.orderNumber?.trim() || null);
      setCreateOpen(true);
    },
    [],
  );
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  const createTicket = useMutation<CreatedSupportTicket, Error, CreateSupportTicketArgs>({
    mutationFn: async ({ subject, note, linkages }) => {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Per-submit key so a double-fire / retry never mints two tickets.
          'Idempotency-Key': safeRandomUUID(),
        },
        body: JSON.stringify({
          subject,
          note: note?.trim() ? note.trim() : undefined,
          anchor: anchor ?? undefined,
          linkages: linkages ?? undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Could not create ticket (${res.status})`);
      }
      return {
        supportTicketId: Number(data.supportTicketId),
        providerTicketId: Number(data.providerTicketId),
      };
    },
    onSuccess: () => {
      invalidateSupportContextCaches(qc);
      void qc.invalidateQueries({ queryKey: ['zendesk'] });
      setCreateOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not create ticket');
    },
  });

  return {
    createOpen,
    anchor,
    defaultOrderNumber,
    openCreate,
    closeCreate,
    createTicket,
  };
}
