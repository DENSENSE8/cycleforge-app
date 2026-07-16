'use client';

import { useEffect, useState } from 'react';
import type { ZendeskTicket } from '@/lib/zendesk';
import {
  useAssignTicket,
  useTicketAssignment,
  useUpdateTicket,
  useZendeskAgents,
} from '@/hooks/useZendeskQueries';
import { getActiveStaff, type StaffMember } from '@/lib/staffCache';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { Check, ChevronLeft, ExternalLink, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { ZendeskSelect, type SelectOption } from '../ZendeskSelect';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, statusBadge } from '../badges';
import { SupportDetailsStack } from './SupportDetailsStack';
import { initials, requesterFrom } from './support-chat-utils';

const UNASSIGNED = 'unassigned';

/**
 * Chat header. Two separate concerns, deliberately split:
 *   - the ZENDESK row (status / priority / Zendesk assignee) updates the ticket
 *     in Zendesk;
 *   - the FOLLOW-UP row assigns the ticket to one of OUR staff, dropping a
 *     notification into their inbox bell — it never touches Zendesk.
 */
export function SupportChatHeader({
  ticket,
  onBack,
  hideExternalLink = false,
  compact = false,
}: {
  ticket: ZendeskTicket;
  onBack?: () => void;
  /** When the host already shows the Zendesk link (e.g. SectionTabsSlider rightSlot). */
  hideExternalLink?: boolean;
  /** Station ticket tab — tighter padding + smaller type. */
  compact?: boolean;
}) {
  const update = useUpdateTicket();
  const assign = useAssignTicket();
  const { data: agents = [] } = useZendeskAgents();
  const { data: assignment } = useTicketAssignment(ticket.id);
  const url = hideExternalLink ? null : zendeskTicketUrl(ticket.id);
  const requester = requesterFrom(ticket);
  const reqName = requester.name || requester.email || 'Requester';
  const sb = statusBadge(ticket.status);

  // Inline title (subject) edit — click the title, confirm with the checkmark.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const startEditTitle = () => {
    setTitleDraft(ticket.subject || '');
    setEditingTitle(true);
  };
  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== (ticket.subject || '')) update.mutate({ id: ticket.id, patch: { subject: next } });
    setEditingTitle(false);
  };

  // Our own staff roster for the in-website follow-up assignment.
  const [staff, setStaff] = useState<StaffMember[]>([]);
  useEffect(() => {
    let alive = true;
    getActiveStaff()
      .then((list) => alive && setStaff(list))
      .catch(() => {
        /* staffCache swallows; leave empty */
      });
    return () => {
      alive = false;
    };
  }, []);

  const assigneeOptions: SelectOption[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...agents.map((a) => ({ value: String(a.id), label: a.name, sublabel: a.email ?? undefined })),
  ];

  const staffOptions: SelectOption[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...staff.map((s) => ({ value: String(s.id), label: s.name })),
  ];

  return (
    <div
      className={cn(
        'shrink-0 border-b border-border-hairline bg-surface-card',
        compact ? 'px-3 py-2' : 'px-5 py-3.5',
      )}
    >
      <div className="flex items-center gap-2.5">
        {onBack ? (
          <IconButton
            icon={<ChevronLeft className="h-4 w-4" />}
            onClick={onBack}
            ariaLabel="Back to list"
            className="-ml-1 rounded-md p-1 hover:bg-surface-sunken lg:hidden"
          />
        ) : null}
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-surface-sunken font-black text-text-soft',
            compact ? 'h-7 w-7 text-role-micro' : 'h-9 w-9 text-role-caption',
          )}
        >
          {initials(reqName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {editingTitle ? (
              <>
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveTitle();
                    } else if (e.key === 'Escape') {
                      setEditingTitle(false);
                    }
                  }}
                  className={cn(
                    'min-w-0 flex-1 rounded-md border border-blue-300 bg-surface-card px-2 py-0.5 font-bold tracking-tight text-text-default outline-none focus:ring-2 focus:ring-blue-100',
                    compact ? 'text-role-caption' : 'text-role-body',
                  )}
                />
                <HoverTooltip label="Save title" asChild>
                  <IconButton
                    icon={<Check className="h-3.5 w-3.5 text-white" />}
                    onClick={saveTitle}
                    disabled={update.isPending}
                    ariaLabel="Save title"
                    className="shrink-0 rounded-md bg-blue-600 p-1 hover:bg-blue-700"
                  />
                </HoverTooltip>
                <HoverTooltip label="Cancel" asChild>
                  <IconButton
                    icon={<X className="h-3.5 w-3.5" />}
                    onClick={() => setEditingTitle(false)}
                    ariaLabel="Cancel"
                    className="shrink-0 rounded-md p-1 hover:bg-surface-sunken"
                  />
                </HoverTooltip>
              </>
            ) : (
              <>
                <HoverTooltip label="Click to edit title" asChild>
                  {/* ds-raw-button: text-left inline-editable title (truncating subject), not a standard action Button */}
                  <button
                    type="button"
                    onClick={startEditTitle}
                    aria-label="Click to edit title"
                    className={cn(
                      'min-w-0 truncate text-left font-bold tracking-tight text-text-default transition hover:text-blue-700',
                      compact ? 'text-role-caption' : 'text-role-body',
                    )}
                  >
                    {ticket.subject || '(no subject)'}
                  </button>
                </HoverTooltip>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 uppercase tracking-widest',
                    compact ? 'text-role-micro' : 'text-role-eyebrow',
                    sb.className,
                  )}
                >
                  {sb.label}
                </span>
                {/* Details affordance sits on the title row so it doesn't grow header height. */}
                <SupportDetailsStack ticket={ticket} />
              </>
            )}
          </div>
          <p
            className={cn(
              'mt-0.5 truncate text-text-soft',
              compact ? 'text-role-micro' : 'text-role-caption',
            )}
          >
            <span className="font-semibold text-text-muted">{reqName}</span>
            {requester.email && requester.name ? <span className="text-text-faint"> · {requester.email}</span> : null}
            <span className="text-text-faint"> · #{ticket.id}</span>
          </p>
        </div>
        {url ? (
          <HoverTooltip label="Open in Zendesk" asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Zendesk"
              className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card text-text-muted ring-1 ring-inset ring-border-soft transition hover:text-text-default"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </HoverTooltip>
        ) : null}
      </div>

      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', compact ? 'mt-2' : 'mt-3')}>
        {/* Zendesk ticket fields — these write back to Zendesk. */}
        <div className="flex items-center gap-2">
          <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">Helpdesk</span>
          <ZendeskSelect
            value={String(ticket.status)}
            options={STATUS_OPTIONS}
            disabled={update.isPending}
            onChange={(status) => update.mutate({ id: ticket.id, patch: { status: status as ZendeskTicket['status'] } })}
          />
          <ZendeskSelect
            value={ticket.priority ? String(ticket.priority) : null}
            options={PRIORITY_OPTIONS}
            placeholder="Priority"
            disabled={update.isPending}
            onChange={(priority) =>
              update.mutate({ id: ticket.id, patch: { priority: priority as ZendeskTicket['priority'] } })
            }
          />
          <ZendeskSelect
            value={ticket.assignee_id ? String(ticket.assignee_id) : UNASSIGNED}
            options={assigneeOptions}
            placeholder="Agent"
            disabled={update.isPending}
            onChange={(v) => update.mutate({ id: ticket.id, patch: { assignee_id: v === UNASSIGNED ? null : Number(v) } })}
          />
        </div>

        {/* In-website follow-up — assigning notifies that staffer's inbox bell. */}
        <div className="flex items-center gap-2 border-l border-border-soft pl-3">
          <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">Follow-up</span>
          <ZendeskSelect
            value={assignment ? String(assignment.assignedStaffId) : UNASSIGNED}
            options={staffOptions}
            placeholder="Assign staff"
            align="right"
            disabled={assign.isPending}
            onChange={(v) => {
              const staffId = v === UNASSIGNED ? null : Number(v);
              const staffName = staffId == null ? undefined : staff.find((s) => s.id === staffId)?.name;
              assign.mutate({ id: ticket.id, staffId, staffName });
            }}
          />
        </div>
      </div>
    </div>
  );
}
