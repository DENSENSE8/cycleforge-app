'use client';

/** The task sheet's LEAVES — documents, linked records (customer emails included) and one open document — each a presentational face of what… */

import Link from 'next/link';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Mail,
  Package,
  Ticket,
  Truck,
  Wrench,
  X,
} from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { IconButton } from '@/design-system/primitives/IconButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/primitives/DropdownMenu';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { emailRefNumberFace, emailRefNumberPatch } from '@/lib/tasks/task-email-refs';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { mailboxFace, type TaskEmailRef, type TaskEmailRefPatchBody } from '@/lib/tasks/task-email-refs-shared';
import { useTaskEmailRefs } from '@/lib/tasks/use-task-email-refs';
import {
  TASK_DESK_RECORD_NOUN,
  taskDeskRecordHref,
  taskDeskTicketNumber,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import type { TaskDocumentMeta } from '@/lib/tasks/task-documents-shared';
import {
  TASK_LINK_NOUN,
  taskLinkRepairHref,
  type TaskLinkKind,
  type TaskLink,
} from '@/lib/tasks/task-links-shared';
import { useTaskDocument } from '@/lib/tasks/use-task-workspace';
import { getTrackingUrl } from '@/lib/tracking-format';
import { cn } from '@/utils/_cn';

export const TASK_SECTION_LABEL =
  'pb-2 pt-5 text-role-micro font-semibold text-text-muted';
const QUIET = 'text-role-caption text-text-muted';
const ROW = cn(
  'flex min-h-14 w-full items-center gap-3 border border-border-hairline bg-surface-card px-3 py-2 text-left',
  MOBILE_ROW_CORNER,
);

function documentCaption(doc: TaskDocumentMeta): string {
  if (doc.source === 'repo') return doc.repoPath ?? 'Plan file';
  return doc.createdBy ? `Written by ${doc.createdBy.name}` : 'Written in the app';
}

/** The task's markdown documents; a tap opens one inside the sheet. */
export function TaskDocumentList({
  documents,
  onOpen,
}: {
  documents: readonly TaskDocumentMeta[];
  onOpen: (docId: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => (
        <li key={doc.id}>
          {/* ds-raw-button: full-width list row door, not a text/action button */}
          <button type="button" onClick={() => onOpen(doc.id)} className={ROW}>
            <FileText aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-role-data text-text-default">{doc.title}</span>
              <span className="block truncate text-role-micro text-text-muted">{documentCaption(doc)}</span>
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One document, rendered, with a back door to the task. */
export function TaskDocumentView({
  taskId,
  docId,
  onBack,
}: {
  taskId: number;
  docId: number;
  onBack: () => void;
}) {
  const { data: doc, isLoading, error } = useTaskDocument(taskId, docId);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 pb-2">
        <IconButton
          onClick={onBack}
          ariaLabel="Back to the task"
          size="touch"
          icon={<ChevronLeft aria-hidden className="h-5 w-5" />}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-role-data font-semibold text-text-default">
            {doc?.title ?? 'Document'}
          </span>
          {doc ? (
            <span className="block truncate text-role-micro text-text-muted">{documentCaption(doc)}</span>
          ) : null}
        </span>
      </div>
      {isLoading ? <p className={QUIET}>Loading the document…</p> : null}
      {error ? (
        <p role="alert" className={QUIET}>
          {error instanceof Error ? error.message : 'Could not load the document.'}
        </p>
      ) : null}
      {doc && doc.content == null ? (
        <p className={QUIET}>This plan file no longer exists in the codebase.</p>
      ) : null}
      {doc?.content ? <MarkdownRenderer content={doc.content} /> : null}
    </div>
  );
}

/** Each linked kind wears its own glyph, so a repair reads as a repair before its number does. */
const LINK_GLYPH: Readonly<Record<TaskLinkKind, ComponentType<{ className?: string }>>> = {
  order: Package,
  tracking: Truck,
  ticket: Ticket,
  repair: Wrench,
};

function RecordDoor({
  noun,
  label,
  context,
  href,
  external = false,
  glyph: Glyph,
  ticketStatus = null,
}: {
  noun: string;
  label: string;
  context: string | null;
  href: string | null;
  external?: boolean;
  glyph?: ComponentType<{ className?: string }>;
  /** A ticket door's helpdesk status — the colour pill beside its number. */
  ticketStatus?: string | null;
}) {
  const body: ReactNode = (
    <>
      {Glyph ? (
        <span aria-hidden className="shrink-0 text-text-muted">
          <Glyph className="h-5 w-5" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-role-micro text-text-faint">{noun}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-role-data font-semibold tabular-nums text-text-default">{label}</span>
          <TicketStatusPill status={ticketStatus} size="md" />
        </span>
        {context ? <span className="block truncate text-role-micro text-text-muted">{context}</span> : null}
      </span>
      {href ? (
        external ? (
          <ExternalLink aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-muted" />
        )
      ) : null}
    </>
  );
  if (!href) return <div className={ROW}>{body}</div>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={ROW}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={ROW}>
      {body}
    </Link>
  );
}

/** A raw status (`open`, `IN_TRANSIT`) as sentence case (`Open`, `In transit`). */
function statusFace(status: string | null | undefined): string | null {
  const s = status?.trim().replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
}

function linkContext(link: TaskLink): string | null {
  if (link.kind === 'repair') {
    if (!link.repair) return 'Repair no longer on file';
    const ticket = link.repair.ticketNumber ? `Ticket ${link.repair.ticketNumber}` : null;
    return [link.repair.title, statusFace(link.repair.status), ticket].filter(Boolean).join(' · ') || null;
  }
  if (link.kind === 'ticket') {
    return link.ticket?.subject ?? null;
  }
  if (link.kind === 'tracking') {
    const carrier = [link.tracking?.carrier, statusFace(link.tracking?.status)].filter(Boolean).join(' · ');
    const order = link.order ? `→ Order ${link.order.orderNumber ?? link.order.id}` : 'No order matched';
    return [carrier, order].filter(Boolean).join(' · ');
  }
  if (!link.order) return null;
  const lines = link.order.lineCount > 1 ? `${link.order.lineCount} lines · ` : '';
  return `${lines}${link.order.title ?? link.order.sku ?? ''}` || null;
}

function linkDoor(link: TaskLink, canOpenTickets: boolean): { href: string | null; external: boolean } {
  if (link.kind === 'tracking') return { href: getTrackingUrl(link.label), external: true };
  if (link.kind === 'repair') {
    return { href: link.entityId != null ? taskLinkRepairHref(link.entityId, 'phone') : null, external: false };
  }
  if (link.kind === 'ticket') {
    const number = link.ticket?.providerTicketId ?? null;
    return { href: canOpenTickets && number != null ? `/m/t/${number}` : null, external: false };
  }
  const orderId = link.order?.id ?? link.entityId;
  return {
    href: orderId != null ? taskDeskRecordHref({ entityType: 'order', entityId: orderId }, 'phone') : null,
    external: false,
  };
}

/** The anchor record, then every linked order / tracking / ticket / repair. */
export function TaskLinkDoors({
  row,
  links,
  loading,
  canOpenTickets,
}: {
  row: TaskDeskRow;
  links: readonly TaskLink[];
  loading: boolean;
  /** `integrations.zendesk` — without it a ticket stays a mark, never a door. */
  canOpenTickets: boolean;
}) {
  const anchorIsTicket = row.entityType === 'support_ticket';
  const anchorHref = anchorIsTicket && !canOpenTickets ? null : taskDeskRecordHref(row, 'phone');
  const anchorContext = anchorIsTicket ? (row.ticket?.subject ?? null) : null;
  // A ticket is named by the number the operator quotes, never the registry id.
  const anchorLabel = anchorIsTicket ? `#${taskDeskTicketNumber(row) ?? row.entityId}` : String(row.entityId);
  return (
    <ul className="flex flex-col gap-2">
      {row.entityType != null ? (
        <li>
          <RecordDoor
            noun={`About · ${TASK_DESK_RECORD_NOUN[row.entityType] ?? 'Record'}`}
            label={anchorLabel}
            context={anchorContext}
            href={anchorHref}
            ticketStatus={anchorIsTicket ? row.ticket?.status : null}
          />
        </li>
      ) : null}
      {links.map((link) => {
        const door = linkDoor(link, canOpenTickets);
        return (
          <li key={link.id}>
            <RecordDoor
              noun={TASK_LINK_NOUN[link.kind]}
              label={link.kind === 'ticket' ? `#${link.label}` : link.label}
              context={linkContext(link)}
              href={door.href}
              external={door.external}
              glyph={LINK_GLYPH[link.kind]}
              ticketStatus={link.kind === 'ticket' ? link.ticket?.status : null}
            />
          </li>
        );
      })}
      {loading ? <li className={QUIET}>Loading linked records…</li> : null}
    </ul>
  );
}

/**
 * The customer emails the task is linked to, as rows of Linked records (owner
 * 2026-09-30: "just having an email linkage under links") — the desk rail's
 * Links twin. Paste the customer's address or the email's From / To lines to
 * link one; the mailbox (menu) and the order / ref number are edited on the row.
 */
export function TaskEmailLinks({ taskId }: { taskId: number }) {
  const { refs, mailboxes, loading, link: linkPaste, update, remove } = useTaskEmailRefs(taskId);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const failed = (err: unknown, fallback: string) => setError(err instanceof Error ? err.message : fallback);

  const link = (raw: string) => {
    setError(null);
    linkPaste.mutate(raw, { onSuccess: () => setValue(''), onError: (err) => failed(err, 'Could not link that email.') });
  };

  return (
    <div className="flex flex-col gap-2 pt-2" data-testid="mobile-task-email-links">
      {refs.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {refs.map((ref) => (
            <EmailLinkDoor
              key={ref.id}
              emailRef={ref}
              mailboxes={mailboxes}
              onPatch={(patch) => update.mutateAsync({ id: ref.id, ...patch }).catch((err: unknown) => failed(err, 'Could not save that email.'))}
              onRemove={() => remove.mutate(ref.id, { onError: (err) => failed(err, 'Could not unlink that email.') })}
            />
          ))}
        </ul>
      ) : null}
      {loading ? <p className={QUIET}>Loading emails…</p> : null}
      <div className="flex items-center gap-2">
        <TextField
          label="Link a customer email"
          value={value}
          onChange={setValue}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) link(value);
          }}
          // A pasted header block is multi-line; an input would flatten it, so an address in the clipboard links at once.
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (!text.includes('@')) return;
            event.preventDefault();
            link(text);
          }}
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
          data-testid="mobile-task-email-link-input"
        />
        <Button variant="secondary" size="lg" className="min-h-12" disabled={!value.trim() || linkPaste.isPending} onClick={() => link(value)}>
          Link
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-role-micro text-text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EmailLinkDoor({
  emailRef,
  mailboxes,
  onPatch,
  onRemove,
}: {
  emailRef: TaskEmailRef;
  mailboxes: readonly string[];
  onPatch: (patch: TaskEmailRefPatchBody) => Promise<unknown>;
  onRemove: () => void;
}) {
  const face = emailRefNumberFace(emailRef);
  const [number, setNumber] = useState(face);
  useEffect(() => setNumber(face), [face]);
  const commitNumber = () => {
    if (number.trim() !== face) void onPatch(emailRefNumberPatch(number));
  };
  // The org's vocabulary, plus this row's own mailbox when it is an outlier.
  const choices = mailboxes.includes(emailRef.mailbox) ? mailboxes : [emailRef.mailbox, ...mailboxes];
  return (
    <li className={ROW} data-testid="mobile-task-email-link">
      <span aria-hidden className="shrink-0 text-text-muted">
        <Mail className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-role-micro text-text-faint">Email</span>
        <a href={`mailto:${emailRef.customerEmail}`} className="block truncate text-role-data font-semibold text-text-default">
          {emailRef.customerEmail}
        </a>
        <span className="flex min-w-0 items-center gap-1.5 pt-1 text-role-micro text-text-muted">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Came in on ${emailRef.mailbox} — change the mailbox`}
                className={cn('inline-flex min-h-9 shrink-0 items-center gap-1 bg-surface-sunken px-2 font-mono font-semibold text-text-default', MOBILE_ROW_CORNER)}
              >
                {mailboxFace(emailRef.mailbox)}
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              {choices.map((mailbox) => (
                <DropdownMenuItem
                  key={mailbox}
                  onSelect={() => {
                    if (mailbox !== emailRef.mailbox) void onPatch({ mailbox });
                  }}
                  className="min-h-11 gap-2"
                >
                  <span className="font-mono font-semibold">{mailboxFace(mailbox)}</span>
                  <span className="min-w-0 flex-1 truncate text-text-muted">{mailbox}</span>
                  {mailbox === emailRef.mailbox ? <Check className="h-4 w-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            onBlur={commitNumber}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            placeholder="Add order # or Ref …"
            aria-label={`Order or reference number for ${emailRef.customerEmail}`}
            className={cn('min-h-9 min-w-0 flex-1 border border-transparent bg-transparent px-2 text-role-field text-text-default outline-none placeholder:text-text-muted focus:border-border-soft', MOBILE_ROW_CORNER)}
          />
        </span>
      </span>
      <IconButton
        size="md"
        radius="pill"
        ariaLabel={`Unlink ${emailRef.customerEmail}`}
        onClick={onRemove}
        icon={<X className="h-4 w-4" />}
        className="shrink-0"
      />
    </li>
  );
}
