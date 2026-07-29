'use client';

import { useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system';
import type { ZendeskTicket } from '@/lib/zendesk';
import { useUpdateTicket } from '@/hooks/useZendeskQueries';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { Layers } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';
import { TagInput } from '../TagInput';
import { priorityBadge, statusBadge } from '../badges';
import { requesterFrom } from './support-chat-utils';

type Tab = 'details' | 'tags';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">{label}</p>
      <div className="text-role-caption text-text-muted">{children}</div>
    </div>
  );
}

/**
 * The support "details stack" — a small tabbed popover anchored to a header
 * button. Holds secondary ticket detail: Details (requester, id, status/priority,
 * timestamps) and Tags (the ONLY place ticket tags are shown/edited).
 *
 * `density="station"` matches {@link StationMoreDetails} peers (`IconButton` sm).
 * `density="header"` keeps the denser chat-header ring control.
 */
export function SupportDetailsStack({
  ticket,
  density = 'header',
}: {
  ticket: ZendeskTicket;
  density?: 'header' | 'station';
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('details');
  const anchorRef = useRef<HTMLSpanElement>(null);
  const update = useUpdateTicket();

  const requester = requesterFrom(ticket);
  const sb = statusBadge(ticket.status);
  const pb = priorityBadge(ticket.priority ?? null);
  const tagCount = ticket.tags?.length ?? 0;
  // Same last-4 / no-`#` face as {@link SupportTicketIdMark}.
  const ticketFace = supportTicketIdFace(String(ticket.id));

  const trigger =
    density === 'station' ? (
      <HoverTooltip label="Ticket details">
        <IconButton
          size="sm"
          icon={<Layers className="h-3.5 w-3.5" />}
          ariaLabel="Ticket details"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(open ? 'bg-blue-50 text-blue-700' : undefined)}
        />
      </HoverTooltip>
    ) : (
      <HoverTooltip label="Ticket details" asChild>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Ticket details"
          aria-expanded={open}
          className={cn(
            'ds-raw-button relative inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition',
            open
              ? 'bg-blue-50 text-blue-700 ring-blue-200'
              : 'bg-surface-card text-text-muted ring-border-soft hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <Layers className="h-4 w-4" />
          {tagCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-surface-inverse-raised px-1 text-role-micro text-white">
              {tagCount}
            </span>
          ) : null}
        </button>
      </HoverTooltip>
    );

  return (
    <>
      <span ref={anchorRef} className="relative inline-flex shrink-0">
        {trigger}
        {density === 'station' && tagCount > 0 ? (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-surface-inverse-raised px-0.5 text-role-micro text-white">
            {tagCount}
          </span>
        ) : null}
      </span>

      <AnchoredLayer open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-end" gap={4}>
        <div className="w-72 overflow-hidden rounded-xl border border-border-soft bg-surface-card shadow-xl">
          <div className="flex border-b border-border-hairline">
            {(['details', 'tags'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'ds-raw-button flex-1 px-3 py-2 text-role-micro uppercase tracking-widest transition',
                  tab === t
                    ? 'border-b-2 border-blue-500 text-blue-700'
                    : 'text-text-faint hover:text-text-muted',
                )}
              >
                {t === 'details' ? 'Details' : `Tags${tagCount ? ` · ${tagCount}` : ''}`}
              </button>
            ))}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-3">
            {tab === 'details' ? (
              <div className="space-y-3">
                <Field label="Requester">
                  <span className="font-semibold text-text-default">{requester.name || 'Requester'}</span>
                  {requester.email ? <span className="block text-text-soft">{requester.email}</span> : null}
                </Field>
                <Field label="Ticket">
                  <HoverTooltip label={ticketFace.value} placement="below">
                    <span className="font-mono font-semibold tabular-nums text-text-default">
                      {ticketFace.display}
                    </span>
                  </HoverTooltip>
                </Field>
                <div className="flex gap-6">
                  <Field label="Status">
                    <span className={cn('inline-block rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest', sb.className)}>
                      {sb.label}
                    </span>
                  </Field>
                  <Field label="Priority">
                    {pb ? (
                      <span className={cn('inline-block rounded px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest', pb.className)}>
                        {pb.label}
                      </span>
                    ) : (
                      <span className="text-text-faint">—</span>
                    )}
                  </Field>
                </div>
                <Field label="Created">{formatDateTimePST(ticket.created_at)}</Field>
                <Field label="Updated">{formatDateTimePST(ticket.updated_at)}</Field>
              </div>
            ) : (
              <div className="space-y-2">
                <TagInput
                  tags={ticket.tags ?? []}
                  disabled={update.isPending}
                  placeholder="Add a tag…"
                  onChange={(tags) => update.mutate({ id: ticket.id, patch: { tags } })}
                />
                <p className="text-role-micro text-text-faint">Tags sync to the helpdesk.</p>
              </div>
            )}
          </div>
        </div>
      </AnchoredLayer>
    </>
  );
}
