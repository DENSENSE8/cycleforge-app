'use client';

/**
 * Link-existing-ticket CTA — top-left, above the station composer, only while
 * nothing is linked. Light amber (`warningSoft`, operator 2026-10-07) and rounder than the composer shell (`rounded-3xl`
 * over `COMPOSER_SHELL_CORNER`). Opens the full-screen read-before-link surface.
 * Tracking / order identity is prefetched so a hit opens already selected.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TicketLinkPopover } from '@/components/support/context/TicketLinkPopover';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { invalidateSupportContextCaches } from '@/hooks';
import { invalidateReceivingFeeds, patchReceivingRailTicketByCarton } from '@/lib/queries/receiving-queries';
import type { SupportContextLinkable } from '@/lib/support/context-types';
import type { TicketIdentityMatch } from '@/lib/support/ticket-link-query';

export function ComposerLinkTicket({
  receivingId,
  lineId,
  trackingNumber,
  orderNumber,
  onLinked,
}: {
  receivingId: number;
  lineId?: number | null;
  trackingNumber?: string | null;
  orderNumber?: string | null;
  /** After the row is patched — switch the station onto the linked ticket thread. */
  onLinked?: (ticketNumber: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const tracking = trackingNumber?.trim() ?? '';
  const order = orderNumber?.trim() ?? '';
  const linkable: SupportContextLinkable = {
    canLinkTicket: true,
    anchorType: 'receiving',
    anchorId: receivingId,
    receivingId,
    lineId: lineId ?? null,
  };

  const identity = useQuery({
    queryKey: ['ticket-identity-match', receivingId, tracking, order],
    enabled: tracking.length > 0 || order.length > 0,
    staleTime: 15_000,
    queryFn: async (): Promise<TicketIdentityMatch | null> => {
      const sp = new URLSearchParams({ list: 'identity' });
      if (tracking) sp.set('tracking', tracking);
      if (order) sp.set('order', order);
      const res = await fetch(`/api/support/tickets/link?${sp.toString()}`);
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        match?: TicketIdentityMatch | null;
      } | null;
      if (!res.ok || !data?.success) return null;
      return data.match ?? null;
    },
  });

  return (
    <>
      <div className="flex justify-start px-3 pb-1.5">
        <Button
          type="button"
          variant="warningSoft"
          className="rounded-3xl"
          size="sm"
          icon={<Link2 className="h-3.5 w-3.5" aria-hidden />}
          aria-expanded={open}
          data-testid="composer-link-ticket"
          onClick={() => setOpen(true)}
        >
          Link existing ticket?
        </Button>
      </div>
      <TicketLinkPopover
        linkable={linkable}
        open={open}
        onClose={() => setOpen(false)}
        match={identity.data ?? null}
        matchLoading={identity.isLoading}
        onLinked={(ticketNumber) => {
          invalidateSupportContextCaches(qc);
          patchReceivingRailTicketByCarton(qc, receivingId, ticketNumber);
          if (lineId != null && lineId > 0) {
            dispatchLineUpdated({ id: lineId, zendesk_ticket: ticketNumber });
          }
          invalidateReceivingFeeds(qc);
          onLinked?.(ticketNumber);
        }}
      />
    </>
  );
}
