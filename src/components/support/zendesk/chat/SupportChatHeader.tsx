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
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { Check, ChevronLeft, ExternalLink, Link2, Package, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { ZendeskSelect, type SelectOption } from '../ZendeskSelect';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../badges';
import { SupportDetailsStack } from './SupportDetailsStack';
import { initials, requesterFrom } from './support-chat-utils';

const UNASSIGNED = 'unassigned';

/**
 * Chat header. Zendesk row (status / priority / Zendesk assignee) updates the ticket
 * in the external helpdesk; the staff assign control on the right notifies our staff inbox.
 */
export function SupportChatHeader({
  ticket,
  onBack,
  hideExternalLink = false,
  compact = false,
  hideTitle = false,
  hideRequesterBand = false,
  onOpenContext,
  contextOpen = false,
  contextBadge = null,
  ordersHref = null,
}: {
  ticket: ZendeskTicket;
  onBack?: () => void;
  /** When the host already shows the Zendesk link (e.g. SectionTabsSlider rightSlot). */
  hideExternalLink?: boolean;
  /** Station ticket tab — tighter padding + smaller type. */
  compact?: boolean;
  /**
   * Hide the editable subject title. Station embeds keep the title visible
   * (click-to-edit) even when {@link hideRequesterBand} drops the avatar row.
   */
  hideTitle?: boolean;
  /**
   * Station Ticket tab: drop the avatar/requester identity band (status +
   * assignment row stay). Subject title still renders above that row unless
   * {@link hideTitle}.
   */
  hideRequesterBand?: boolean;
  /** Opens the Support Context slide-over (console host only). */
  onOpenContext?: () => void;
  /** Whether the context slide-over is open (pressed chrome). */
  contextOpen?: boolean;
  /** Short linked-state hint under the Links control (e.g. order last-4 / Unlinked). */
  contextBadge?: string | null;
  /** When the ticket is linked to an order — open Support · Orders for that pk. */
  ordersHref?: string | null;
}) {
  const update = useUpdateTicket();
  const assign = useAssignTicket();
  const { data: agents = [] } = useZendeskAgents();
  const { data: assignment } = useTicketAssignment(ticket.id);
  const url = hideExternalLink ? null : zendeskTicketUrl(ticket.id);
  // Runtime provider name so the deep-link reads the org's own helpdesk.
  const { label: helpdeskLabel } = useCapabilityProviderLabel('helpdesk');
  const openLabel = `Open in ${helpdeskLabel}`;
  const requester = requesterFrom(ticket);
  const reqName = requester.name || requester.email || 'Requester';
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

  const assigneeOptions: SelectOption[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...agents.map((a) => ({ value: String(a.id), label: a.name, sublabel: a.email ?? undefined })),
  ];

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

  const staffOptions: SelectOption[] = [
    // Distinct from Zendesk agent "Unassigned" so the header doesn't show two identical faces.
    { value: UNASSIGNED, label: 'Staff' },
    ...staff.map((s) => ({ value: String(s.id), label: s.name })),
  ];

  const titleEditor = hideTitle ? null : (
    <TicketSubjectEditor
      subject={ticket.subject}
      ticketId={ticket.id}
      compact={compact}
      editing={editingTitle}
      draft={titleDraft}
      saving={update.isPending}
      showIdSuffix={!hideRequesterBand}
      onDraftChange={setTitleDraft}
      onStartEdit={startEditTitle}
      onSave={saveTitle}
      onCancel={() => setEditingTitle(false)}
    />
  );

  return (
    <div
      className={cn(
        'shrink-0 border-b border-border-hairline bg-surface-card',
        compact ? 'px-2.5 py-1.5' : 'px-5 py-3.5',
      )}
    >
      {hideRequesterBand ? (
        titleEditor ? <div className="mb-1.5">{titleEditor}</div> : null
      ) : (
        <div className="flex items-center gap-2">
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
              'flex shrink-0 items-center justify-center rounded-full bg-surface-sunken font-semibold text-text-soft',
              compact ? 'h-6 w-6 text-role-micro' : 'h-9 w-9 text-role-caption',
            )}
          >
            {initials(reqName)}
          </span>
          <div className="min-w-0 flex-1">
            {titleEditor}
            <p
              className={cn(
                'truncate text-text-soft',
                hideTitle ? null : 'mt-0.5',
                compact ? 'text-role-micro' : 'text-role-caption',
              )}
            >
              <span className="font-semibold text-text-muted">{reqName}</span>
              {requester.email && requester.name ? (
                <span className="text-text-faint"> · {requester.email}</span>
              ) : null}
              {hideTitle ? null : <span className="text-text-faint"> · #{ticket.id}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenContext ? (
              <HoverTooltip
                label={contextBadge ? `Support context · ${contextBadge}` : 'Support context'}
                asChild
              >
                <IconButton
                  icon={<Link2 className="h-4 w-4" />}
                  onClick={onOpenContext}
                  ariaLabel="Support context"
                  aria-pressed={contextOpen}
                  size="md"
                  className={cn(
                    'rounded-lg ring-1 ring-inset',
                    contextOpen
                      ? 'bg-blue-50 text-blue-700 ring-blue-200'
                      : 'bg-surface-card ring-border-soft hover:text-text-default',
                  )}
                />
              </HoverTooltip>
            ) : null}
            {ordersHref ? (
              <HoverTooltip label="Open linked order" asChild>
                <a
                  href={ordersHref}
                  aria-label="Open linked order"
                  className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card text-text-muted ring-1 ring-inset ring-border-soft transition hover:text-text-default"
                >
                  <Package className="h-4 w-4" />
                </a>
              </HoverTooltip>
            ) : null}
            <SupportDetailsStack ticket={ticket} />
            {url ? (
              <HoverTooltip label={openLabel} asChild>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={openLabel}
                  className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card text-text-muted ring-1 ring-inset ring-border-soft transition hover:text-text-default"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </HoverTooltip>
            ) : null}
          </div>
        </div>
      )}

      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5',
          hideRequesterBand && hideTitle ? null : compact ? 'mt-1.5' : 'mt-3',
        )}
      >
        {/* Zendesk ticket fields — external/helpdesk controls on the left. */}
        <div className={cn('flex shrink-0 flex-wrap items-center', compact ? 'gap-1' : 'gap-1.5')}>
          <ZendeskSelect
            value={String(ticket.status)}
            options={STATUS_OPTIONS}
            size={compact ? 'rail' : 'dense'}
            disabled={update.isPending}
            onChange={(status) => update.mutate({ id: ticket.id, patch: { status: status as ZendeskTicket['status'] } })}
          />
          <ZendeskSelect
            value={ticket.priority ? String(ticket.priority) : null}
            options={PRIORITY_OPTIONS}
            placeholder="Priority"
            size={compact ? 'rail' : 'dense'}
            disabled={update.isPending}
            onChange={(priority) =>
              update.mutate({ id: ticket.id, patch: { priority: priority as ZendeskTicket['priority'] } })
            }
          />
          <ZendeskSelect
            value={ticket.assignee_id ? String(ticket.assignee_id) : UNASSIGNED}
            options={assigneeOptions}
            placeholder="Agent"
            size={compact ? 'rail' : 'dense'}
            disabled={update.isPending}
            onChange={(v) => update.mutate({ id: ticket.id, patch: { assignee_id: v === UNASSIGNED ? null : Number(v) } })}
          />
        </div>

        <div className={cn('ml-auto flex shrink-0 items-center', compact ? 'gap-1' : 'gap-1.5')}>
          <ZendeskSelect
            value={assignment ? String(assignment.assignedStaffId) : UNASSIGNED}
            options={staffOptions}
            placeholder="Assign staff"
            size={compact ? 'rail' : 'dense'}
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

/** Click-to-edit subject control shared by full and station-dense header layouts. */
function TicketSubjectEditor({
  subject,
  ticketId,
  compact,
  editing,
  draft,
  saving,
  showIdSuffix,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
}: {
  subject: string | null | undefined;
  ticketId: number;
  compact: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  /** When true, `#id` lives on the requester line instead. */
  showIdSuffix: boolean;
  onDraftChange: (next: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSave();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
          className={cn(
            'min-w-0 flex-1 rounded-md border border-blue-300 bg-surface-card px-2 py-0.5 font-semibold tracking-tight text-text-default outline-none focus:ring-2 focus:ring-blue-100',
            compact ? 'text-role-caption' : 'text-role-body',
          )}
        />
        <HoverTooltip label="Save title" asChild>
          <IconButton
            icon={<Check className="h-3.5 w-3.5 text-white" />}
            onClick={onSave}
            disabled={saving}
            ariaLabel="Save title"
            className="shrink-0 rounded-md bg-blue-600 p-1 hover:bg-blue-700"
          />
        </HoverTooltip>
        <HoverTooltip label="Cancel" asChild>
          <IconButton
            icon={<X className="h-3.5 w-3.5" />}
            onClick={onCancel}
            ariaLabel="Cancel"
            className="shrink-0 rounded-md p-1 hover:bg-surface-sunken"
          />
        </HoverTooltip>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <HoverTooltip label="Click to edit title" asChild>
        {/* ds-raw-button: text-left inline-editable title (truncating subject), not a standard action Button */}
        <button
          type="button"
          onClick={onStartEdit}
          aria-label="Click to edit title"
          className={cn(
            'min-w-0 flex-1 truncate text-left font-semibold tracking-tight text-text-default transition hover:text-blue-700',
            compact ? 'text-role-caption' : 'text-role-body',
          )}
        >
          {subject || '(no subject)'}
        </button>
      </HoverTooltip>
      {showIdSuffix ? null : (
        <span className="shrink-0 text-role-micro text-text-faint">#{ticketId}</span>
      )}
    </div>
  );
}
