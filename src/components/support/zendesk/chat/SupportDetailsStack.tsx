'use client';

import { useRef, useState } from 'react';
import { AnchoredLayer } from '@/design-system';
import type { ZendeskTicket } from '@/lib/zendesk';
import { useUpdateTicket } from '@/hooks/useZendeskQueries';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { Info } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Panel, ConversationHeaderActionButton } from '@/design-system/primitives';
import { CONVERSATION_HEADER_ACTION_GLYPH } from '@/design-system/primitives/conversation-chrome';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';
import { TagInput } from '../TagInput';
import { priorityBadge, statusBadge } from '../badges';
import {
  TicketAssignmentFields,
  TicketPrioritySelect,
  TicketStatusSelect,
} from './SupportTicketFields';
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
 * assignment, timestamps) and Tags (the ONLY place ticket tags are shown/edited).
 *
 * `density` is retained for call-site clarity (`station` = `/support` pane;
 * `header` = Unbox / chat identity band) — both densities share the circular
 * {@link ConversationHeaderActionButton} face so every ticket display matches.
 *
 * `fields` decides whether status / priority / assignment are **editable here**,
 * and it must be answered per host, because the rule is one editable home per
 * fact per surface ({@link SupportTicketFields}):
 *
 *  - `'read'` (default, and what `/support` passes) — badges only. That surface's
 *    pane header owns status + priority, and its rail's Connections display owns
 *    assignment.
 *  - `'edit'` — this popover IS the field surface. Hosts with no pane header
 *    (the Unbox ticket push, the Links rail's Customer segment) pass it, because
 *    the field band under the subject is gone and they have nowhere else.
 */
export function SupportDetailsStack({
  ticket,
  density = 'header',
  fields = 'read',
}: {
  ticket: ZendeskTicket;
  density?: 'header' | 'station';
  fields?: 'read' | 'edit';
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('details');
  const anchorRef = useRef<HTMLSpanElement>(null);
  const update = useUpdateTicket();

  const requester = requesterFrom(ticket);
  const sb = statusBadge(ticket.status);
  const pb = priorityBadge(ticket.priority ?? null);
  const tagCount = ticket.tags?.length ?? 0;
  // Same last-8 / no-`#` face as {@link SupportTicketIdMark}.
  const ticketFace = supportTicketIdFace(String(ticket.id));

  const trigger = (
    <ConversationHeaderActionButton
      label="Ticket details"
      icon={<Info className={CONVERSATION_HEADER_ACTION_GLYPH} aria-hidden />}
      onClick={() => setOpen((o) => !o)}
      active={open}
      expanded={open}
      data-testid="support-ticket-details"
      data-density={density}
    />
  );

  return (
    <>
      <span ref={anchorRef} className="relative inline-flex shrink-0">
        {trigger}
        {tagCount > 0 ? (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-surface-inverse-raised px-1 text-role-micro text-white">
            {tagCount}
          </span>
        ) : null}
      </span>

      <AnchoredLayer open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} placement="bottom-end" gap={4}>
        <Panel radius="xl" padding="none" elevation="md" className="w-72 overflow-hidden">
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
                {fields === 'edit' ? (
                  <>
                    <div className="flex gap-6">
                      <Field label="Status">
                        <TicketStatusSelect ticket={ticket} />
                      </Field>
                      <Field label="Priority">
                        <TicketPrioritySelect ticket={ticket} />
                      </Field>
                    </div>
                    <Field label="Assigned">
                      <TicketAssignmentFields ticket={ticket} />
                    </Field>
                  </>
                ) : (
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
                )}
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
        </Panel>
      </AnchoredLayer>
    </>
  );
}
