'use client';

/**
 * Repair record ticket panels — the Link ticket / Create ticket verb bodies.
 * Both reuse the support waist's own UI ({@link TicketLinkPicker},
 * {@link SupportCreateTicketForm}) anchored on `{ type: 'repair', repairId }`;
 * the record owns Back, so neither renders its own dismiss.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Unlink } from '@/components/Icons';
import { TicketPickRow } from '@/components/ui/TicketPickRow';
import {
  TicketLinkPicker,
  anchorToParams,
  invalidateSupportContextCaches,
} from '@/components/support/context/TicketLinkPopover';
import { SupportCreateTicketForm } from '@/components/support/service-workspace/SupportCreateTicketModal';
import { useCreateSupportTicket } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { Button } from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { repairTicketHandle } from '@/lib/repair/repair-queue-model';
import { repairDeviceName } from '@/lib/repair/repair-device-name';
import type { SupportContextLinkable } from '@/lib/support/context-types';
import type { AnchorLinkedTicket } from '@/lib/support/ticket-link';
import { toast } from '@/lib/toast';
import { qk } from '@/queries/keys';

function repairLinkable(repairId: number): SupportContextLinkable {
  return { canLinkTicket: true, anchorType: 'repair', anchorId: repairId };
}

/** The helpdesk tickets linked to a repair (`ticket_links`, no helpdesk call) — the panel and the record's Ticket facts. */
export function useRepairLinkedTickets(repairId: number) {
  return useQuery({
    // Under `support-ticket` so every link/unlink's invalidateSupportContextCaches refreshes it.
    queryKey: ['support-ticket', 'anchor-links', 'repair', repairId],
    queryFn: async ({ signal }) => {
      const sp = anchorToParams(repairLinkable(repairId));
      sp.set('list', 'linked');
      const res = await fetch(`/api/support/tickets/link?${sp.toString()}`, { signal, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `linked tickets ${res.status}`);
      return data.tickets as AnchorLinkedTicket[];
    },
    enabled: repairId > 0,
  });
}

/** Link an EXISTING helpdesk ticket to this repair; lists what is linked now, each with Unlink. */
export function RepairLinkTicketPanel({ repair, onDone }: { repair: RSRecord; onDone: () => void }) {
  const qc = useQueryClient();
  const linkable = useMemo(() => repairLinkable(repair.id), [repair.id]);
  const linked = useRepairLinkedTickets(repair.id);

  const afterWrite = () => {
    invalidateSupportContextCaches(qc);
    void qc.invalidateQueries({ queryKey: qk.repairs.workbench(repair.id, 'ticket-link') });
    onDone();
  };

  const unlink = useMutation({
    mutationFn: async (ticketId: number) => {
      const sp = anchorToParams(linkable);
      sp.set('ticketId', String(ticketId));
      const res = await fetch(`/api/support/tickets/link?${sp.toString()}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not unlink');
      return ticketId;
    },
    onSuccess: (ticketId) => {
      toast.success(`Ticket #${ticketId} unlinked`);
      afterWrite();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not unlink'),
  });

  const rows = linked.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="repair-link-ticket">
      <section className="flex flex-col gap-1.5">
        <p className={RECORD_LABEL_CLASS}>Linked tickets</p>
        {linked.isError ? (
          <p className="text-role-caption text-text-danger">{linked.error.message}</p>
        ) : linked.isLoading ? (
          <p className="text-role-caption text-text-faint">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-role-caption text-text-faint">No ticket linked to this repair yet.</p>
        ) : (
          <ul className="divide-y divide-border-hairline rounded-lg border border-border-soft">
            {rows.map((row) => (
              <li key={row.supportTicketId} className="px-2.5 py-2">
                <TicketPickRow
                  ticketId={row.ticketId ?? row.supportTicketId}
                  subject={row.subject}
                  meta={row.status ? <span className="text-role-eyebrow text-text-faint">{row.status}</span> : null}
                  trailing={
                    row.ticketId != null ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Unlink />}
                        loading={unlink.isPending && unlink.variables === row.ticketId}
                        disabled={unlink.isPending}
                        onClick={() => unlink.mutate(row.ticketId!)}
                        aria-label={`Unlink ticket #${row.ticketId}`}
                      >
                        Unlink
                      </Button>
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <p className={RECORD_LABEL_CLASS}>Link an existing ticket</p>
        <TicketLinkPicker linkable={linkable} onLinked={afterWrite} />
      </section>
    </div>
  );
}

/** `Repair <ticket> · <customer> · <device>` — no RS code; it is not an operator identifier. */
function repairTicketSubject(repair: RSRecord): string {
  const handle = repairTicketHandle(repair);
  return [
    handle ? `Repair #${handle}` : 'Repair',
    resolveRepairContact(repair).name,
    repairDeviceName(repair.product_title) || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Create a helpdesk ticket anchored to this repair — the support create form, prefilled from the repair. */
export function RepairCreateTicketPanel({ repair, onDone }: { repair: RSRecord; onDone: () => void }) {
  const qc = useQueryClient();
  const anchor = useMemo(() => ({ type: 'repair' as const, repairId: repair.id }), [repair.id]);
  const create = useCreateSupportTicket(anchor, {
    onSuccess: (created) => {
      toast.success(`Ticket #${created.providerTicketId} created`);
      void qc.invalidateQueries({ queryKey: qk.repairs.workbench(repair.id, 'ticket-link') });
      onDone();
    },
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-col" data-testid="repair-create-ticket">
      <SupportCreateTicketForm
        defaultSubject={repairTicketSubject(repair)}
        defaultNote={repair.issue?.trim() || undefined}
        submitting={create.isPending}
        onCreate={({ subject, note, linkages }) => create.mutate({ subject, note, linkages })}
      />
    </div>
  );
}
