'use client';

/**
 * Home Daily inspector leaf bodies — Overview, Connections, Ticket, Work order,
 * Who ran it. Ticket view composes Unbox {@link SupportTicketDetail}.
 */

import { useState } from 'react';
import { ExternalLink, Loader2, Plus, X } from '@/components/Icons';
import { TicketChip, TrackingChip } from '@/components/ui/CopyChip';
import { Button, Panel } from '@/design-system/primitives';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { DAILY_CHECK_LINK_ENTITY_TYPES } from '@/lib/daily-checks/types';
import type {
  DailyCheckItem,
  DailyCheckItemLink,
  DailyCheckReport,
} from '@/lib/daily-checks/types';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { cn } from '@/utils/_cn';

export const TICKET_TYPE = DAILY_CHECK_LINK_ENTITY_TYPES[0];
export const WORK_ORDER_TYPE = DAILY_CHECK_LINK_ENTITY_TYPES[1];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      {children}
    </div>
  );
}

function ScrollLeaf({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-testid={testId}>
      {children}
    </div>
  );
}

function parsePositiveId(raw: string): number | null {
  const n = Number(raw.replace(/^#/, '').trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

function LinkIdForm({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder,
  submitLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
  submitLabel: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        placeholder={placeholder}
        inputMode="numeric"
        className={cn(
          'min-w-0 flex-1 rounded-lg border border-border-soft bg-surface-card px-2.5 py-1.5',
          'text-role-caption text-text-default placeholder:text-text-faint',
          focusRing('field'),
        )}
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={!value.trim() || pending}
        onClick={onSubmit}
        icon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function ConnectionRow({
  link,
  onDetach,
  busy,
}: {
  link: DailyCheckItemLink;
  onDetach: () => void;
  busy: boolean;
}) {
  const isTicket = link.entityType === TICKET_TYPE;
  const isTracking = link.entityType === 'TRACKING';
  // Tracking links have no parent page — the number IS the fact, and the
  // house TrackingChip (last-8) is its face.
  const href = isTracking
    ? null
    : isTicket
      ? zendeskTicketUrl(link.entityId ?? 0)
      : `/repair?wo=${link.entityId ?? 0}`;
  const kind = isTicket ? 'Ticket' : isTracking ? 'Tracking' : 'Work order';
  const handle = isTracking ? (link.label ?? '') : String(link.entityId ?? '—');
  return (
    <div className="flex items-center gap-2 py-1.5">
      {isTicket ? (
        <TicketChip value={String(link.entityId)} display={`#${link.entityId}`} dense />
      ) : isTracking ? (
        <TrackingChip value={link.label ?? ''} dense />
      ) : (
        <span className="font-mono text-role-caption tabular-nums text-text-default">
          WO-{link.entityId}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">
        {link.label ?? kind}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn('shrink-0 text-text-muted hover:text-text-default', focusRing('control'))}
          aria-label={`Open ${kind} ${handle}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onDetach}
        icon={<X className="h-3.5 w-3.5" />}
        aria-label={`Remove ${kind} ${handle}`}
      />
    </div>
  );
}

export function OverviewLeaf({
  item,
  report,
}: {
  item: DailyCheckItem;
  report: DailyCheckReport;
}) {
  const mineDone = report.mine.doneItemIds.includes(item.id);
  const completedBy = report.staff.filter((row) => row.doneItemIds.includes(item.id));
  return (
    <ScrollLeaf testId="daily-check-leaf-overview">
      <Panel padding="sm" radius="xl" elevation="none" className="space-y-3">
        {item.description ? (
          <Field label="Description">
            <p className="whitespace-pre-wrap break-words text-role-caption text-text-default">
              {item.description}
            </p>
          </Field>
        ) : null}
        <Field label="Your mark">
          <LedgerValue value={mineDone ? 'Done' : 'Open'} />
        </Field>
        <Field label="Roster today">
          <LedgerValue value={`${completedBy.length} of ${report.staff.length} done`} />
        </Field>
      </Panel>
    </ScrollLeaf>
  );
}

export function ConnectionsLeaf({
  links,
  loading,
  busy,
  onDetach,
}: {
  links: DailyCheckItemLink[] | undefined;
  loading: boolean;
  busy: boolean;
  onDetach: (linkId: number) => void;
}) {
  return (
    <ScrollLeaf testId="daily-check-leaf-connections">
      {loading ? (
        <p className="flex items-center gap-2 text-role-caption text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : links && links.length > 0 ? (
        <div className="divide-y divide-border-hairline">
          {links.map((link) => (
            <ConnectionRow
              key={link.id}
              link={link}
              busy={busy}
              onDetach={() => onDetach(link.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-role-caption text-text-muted">
          No ticket or work order on this check yet. Open Ticket or Work order to
          attach one.
        </p>
      )}
    </ScrollLeaf>
  );
}

export function TicketLeaf({
  ticketLink,
  pending,
  onAttach,
}: {
  ticketLink: DailyCheckItemLink | undefined;
  pending: boolean;
  busy: boolean;
  onAttach: (entityId: number) => void;
  onDetach: (linkId: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const n = parsePositiveId(draft);
    if (n == null) return;
    onAttach(n);
    setDraft('');
  };

  if (ticketLink && ticketLink.entityId != null) {
    // Byte-twin of Unbox TicketDisplayHost linked branch — flush chat, no
    // extra title / unlink strip. Unlink lives on Connections.
    return (
      <div
        className="flex h-full min-h-0 flex-col gap-0"
        data-testid="unbox-ticket-display"
      >
        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <SupportTicketDetail
              ticketId={ticketLink.entityId}
              embedded
              hideRequesterBand={false}
              mergeFloorTimeline={false}
              showReplyPresets={false}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollLeaf testId="daily-check-ticket-empty">
      <p className="text-role-caption text-text-muted">
        Link an existing Zendesk ticket to view the thread in this panel.
      </p>
      <LinkIdForm
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        pending={pending}
        placeholder="Ticket #…"
        submitLabel="Link"
      />
    </ScrollLeaf>
  );
}

export function WorkOrderLeaf({
  workOrderLink,
  pending,
  busy,
  onAttach,
  onDetach,
}: {
  workOrderLink: DailyCheckItemLink | undefined;
  pending: boolean;
  busy: boolean;
  onAttach: (entityId: number) => void;
  onDetach: (linkId: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const n = parsePositiveId(draft);
    if (n == null) return;
    onAttach(n);
    setDraft('');
  };

  return (
    <ScrollLeaf testId="daily-check-leaf-work-order">
      {workOrderLink ? (
        <ConnectionRow
          link={workOrderLink}
          busy={busy}
          onDetach={() => onDetach(workOrderLink.id)}
        />
      ) : (
        <p className="text-role-caption text-text-muted">
          Attach a work order so this check points at the repair job.
        </p>
      )}
      {workOrderLink ? null : (
        <LinkIdForm
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          pending={pending}
          placeholder="Work order #…"
          submitLabel="Link"
        />
      )}
    </ScrollLeaf>
  );
}

export function WhoRanLeaf({
  item,
  report,
}: {
  item: DailyCheckItem;
  report: DailyCheckReport;
}) {
  const completedBy = report.staff.filter((row) => row.doneItemIds.includes(item.id));
  const pendingCount = report.staff.length - completedBy.length;
  return (
    <ScrollLeaf testId="daily-check-leaf-who-ran">
      {pendingCount === report.staff.length ? (
        <p className="text-role-caption text-text-muted">Nobody has ticked this yet.</p>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {completedBy.map((row) => (
            <li
              key={row.staffId}
              className="flex items-center justify-between py-1.5 text-role-caption"
            >
              <span className="truncate font-semibold text-text-default">
                {row.name}
                {row.staffId === report.mine.staffId ? (
                  <span className="ml-1.5 font-normal text-text-soft">(you)</span>
                ) : null}
              </span>
              <span className="text-text-muted">Done</span>
            </li>
          ))}
        </ul>
      )}
      {pendingCount > 0 ? (
        <p className="mt-1 text-role-caption tabular-nums text-text-muted">
          {pendingCount} still open
        </p>
      ) : null}
    </ScrollLeaf>
  );
}
