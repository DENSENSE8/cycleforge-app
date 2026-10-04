'use client';

/** The task sheet's LEAVES — every document rendered inline (live, with its comments), then linked records (customer emails included). No field labels (P1, owner 2026-10-03): each leaf leads with its glyph and value. */

import Link from 'next/link';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import {
  Check,
  ChevronDown,
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
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
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
  taskDeskTitle,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import type { TaskEntityType } from '@/lib/tasks/task-vocabulary';
import type { TaskDocumentMeta } from '@/lib/tasks/task-documents-shared';
import {
  TASK_LINK_NOUN,
  taskLinkRepairHref,
  type TaskLinkKind,
  type TaskLink,
} from '@/lib/tasks/task-links-shared';
import { TASK_DOC_COMMENT_BODY_MAX } from '@/lib/tasks/task-document-comments-shared';
import { useTaskDocComments, useTaskDocument } from '@/lib/tasks/use-task-workspace';
import { getTrackingUrl } from '@/lib/tracking-format';
import { cn } from '@/utils/_cn';

const QUIET = 'text-role-caption text-text-muted';
const ROW = cn(
  'flex min-h-14 w-full items-center gap-3 border border-border-hairline bg-surface-card px-3 py-2 text-left',
  MOBILE_ROW_CORNER,
);

function documentCaption(doc: TaskDocumentMeta): string | null {
  if (doc.source === 'repo') return doc.repoPath ?? null;
  return doc.createdBy?.name ?? null;
}

/**
 * One document, rendered INLINE in the task's scroll with its comments (owner
 * 2026-10-03: "displayed in line so you are able to easily view all of the
 * information" — never a door to another screen or a rail).
 */
export function TaskDocumentInline({ taskId, doc }: { taskId: number; doc: TaskDocumentMeta }) {
  const { data: full, isLoading, error } = useTaskDocument(taskId, doc.id);
  const caption = documentCaption(doc);
  return (
    <article aria-label={doc.title} className="flex flex-col" data-testid="mobile-task-doc">
      <div className="flex items-start gap-2 pb-1">
        <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        {/* Record text wraps on a phone (record display law): a long title or repo path breaks, never ellipsizes.
            Caption stacks UNDER the title — side by side, a long repo path squeezed to one glyph per line at 390px. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="break-words text-role-data font-semibold text-text-default">{doc.title}</span>
          {caption ? <span className="break-all text-role-caption text-text-muted">{caption}</span> : null}
        </div>
      </div>
      {isLoading ? <p className={QUIET}>Loading the document…</p> : null}
      {error ? (
        <p role="alert" className={QUIET}>
          {error instanceof Error ? error.message : 'Could not load the document.'}
        </p>
      ) : null}
      {full && full.content == null ? <p className={QUIET}>This plan file no longer exists in the codebase.</p> : null}
      {full?.content ? <MarkdownRenderer content={full.content} live="phone" /> : null}
      {full ? <TaskDocumentComments taskId={taskId} docId={doc.id} /> : null}
    </article>
  );
}

/**
 * A document's comments on the phone — readable in place, posted from a
 * bottom sheet. Text selected in the document before tapping Comment becomes
 * the comment's quote (the same anchor the desk rail writes).
 */
function TaskDocumentComments({ taskId, docId }: { taskId: number; docId: number }) {
  const { comments, loading, post, resolve } = useTaskDocComments(taskId, docId);
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState('');
  const [body, setBody] = useState('');
  const live = comments.filter((c) => !c.resolvedAt);
  const resolvedCount = comments.length - live.length;

  const start = () => {
    setQuote((window.getSelection()?.toString() ?? '').replace(/\s+/g, ' ').trim().slice(0, 500));
    setOpen(true);
  };
  const submit = async () => {
    if (!body.trim()) return;
    await post.mutateAsync({ body: body.trim(), quote: quote || null, clientEventId: `task-doc-comment:${docId}:${Date.now()}` });
    setBody('');
    setQuote('');
    setOpen(false);
  };

  return (
    <section aria-label="Comments" className="mt-3 flex flex-col gap-2" data-testid="mobile-task-doc-comments">
      <div className="flex items-center gap-2">
        <span className={cn(QUIET, 'flex-1 tabular-nums')}>
          {live.length > 0 ? `${live.length} open` : null}
          {live.length > 0 && resolvedCount > 0 ? ' · ' : null}
          {resolvedCount > 0 ? `${resolvedCount} resolved` : null}
        </span>
        <Button variant="secondary" size="sm" className="min-h-11" onClick={start} data-testid="mobile-task-doc-comment">
          Comment
        </Button>
      </div>
      {loading ? <p className={QUIET}>Loading comments…</p> : null}
      <ul className="flex flex-col gap-2">
        {live.map((comment) => (
          <li key={comment.id} className={cn('border border-border-hairline bg-surface-card p-3', MOBILE_ROW_CORNER)}>
            <div className="flex items-center gap-2">
              {comment.author ? <StaffAvatar staffId={comment.author.id} name={comment.author.name} size="xs" /> : null}
              <StaffBadge staffId={comment.author?.id} name={comment.author?.name ?? 'System'} className="text-role-caption font-semibold" />
              <span className="ml-auto text-role-micro text-text-muted">
                {new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            {comment.quote ? (
              <blockquote className="mt-1 border-l-2 border-border-default pl-2 text-role-caption italic text-text-muted">{comment.quote}</blockquote>
            ) : null}
            <p className="mt-1 whitespace-pre-wrap text-role-data text-text-default">{comment.body}</p>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              icon={<Check aria-hidden className="h-4 w-4" />}
              onClick={() => resolve.mutate({ commentId: comment.id, resolved: true })}
            >
              Resolve
            </Button>
          </li>
        ))}
      </ul>

      <Sheet open={open} onOpenChange={(next) => { if (!next) setOpen(false); }}>
        <SheetContent side="bottom" size="content" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>Comment</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {quote ? (
              <blockquote className="mb-2 border-l-2 border-border-default pl-2 text-role-caption italic text-text-muted">{quote}</blockquote>
            ) : (
              <p className={cn(QUIET, 'pb-2')}>Tip: select text in the document first to quote it.</p>
            )}
            <TextField
              multiline
              rows={4}
              label="Comment"
              value={body}
              maxLength={TASK_DOC_COMMENT_BODY_MAX}
              onChange={setBody}
              data-testid="mobile-task-doc-comment-input"
            />
          </SheetBody>
          <SheetFooter className="px-mode-page pb-4">
            <Button
              size="lg"
              className="w-full"
              disabled={!body.trim()}
              loading={post.isPending}
              onClick={() => void submit()}
              data-testid="mobile-task-doc-comment-post"
            >
              Post comment
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
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
  /** The kind in words — spoken (aria-label), never painted: the glyph says it (P1). */
  noun: string;
  label: string;
  context: string | null;
  href: string | null;
  external?: boolean;
  glyph: ComponentType<{ className?: string }>;
  /** A ticket door's helpdesk status — the colour pill beside its number. */
  ticketStatus?: string | null;
}) {
  const body: ReactNode = (
    <>
      <span aria-hidden className="shrink-0 text-text-muted">
        <Glyph className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-role-data font-semibold tabular-nums text-text-default">{label}</span>
          <TicketStatusPill status={ticketStatus} size="md" />
        </span>
        {context ? <span className="block truncate text-role-caption text-text-muted">{context}</span> : null}
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
  if (!href) return <div role="group" aria-label={`${noun} ${label}`} className={ROW}>{body}</div>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${noun} ${label}`} className={ROW}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={`${noun} ${label}`} className={ROW}>
      {body}
    </Link>
  );
}

/** The record a task is ABOUT wears its own kind's glyph, like every link door. */
const ANCHOR_GLYPH: Readonly<Record<TaskEntityType, ComponentType<{ className?: string }>>> = {
  order: Package,
  receiving: Package,
  support_ticket: Ticket,
};

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

/**
 * The anchor record, then every linked order / tracking / ticket / repair. The ticket whose thread
 * the record paints in line (`inlineTicket`) is not repeated as a door (one fact, one place).
 */
export function TaskLinkDoors({
  row,
  links,
  loading,
  canOpenTickets,
  inlineTicket,
}: {
  row: TaskDeskRow;
  links: readonly TaskLink[];
  loading: boolean;
  /** `integrations.zendesk` — without it a ticket stays a mark, never a door. */
  canOpenTickets: boolean;
  /** The ticket number shown as a thread above, or null. */
  inlineTicket: number | null;
}) {
  const anchorIsTicket = row.entityType === 'support_ticket';
  const anchorTicket = taskDeskTicketNumber(row);
  const showAnchor = row.entityType != null && !(anchorIsTicket && anchorTicket != null && anchorTicket === inlineTicket);
  const anchorHref = anchorIsTicket && !canOpenTickets ? null : taskDeskRecordHref(row, 'phone');
  // The ticket's subject is often the task's own title — painted once, in the header (one fact, one place).
  const subject = anchorIsTicket ? (row.ticket?.subject?.trim() ?? null) : null;
  const anchorContext = subject && subject !== taskDeskTitle(row) ? subject : null;
  // A ticket is named by the number the operator quotes, never the registry id.
  const anchorLabel = anchorIsTicket ? `#${anchorTicket ?? row.entityId}` : String(row.entityId);
  const doors = links.filter((link) => !(link.kind === 'ticket' && Number(link.label) === inlineTicket));
  const title = taskDeskTitle(row);
  // A linked repair's description is usually the task's own title — painted once (one fact, one place).
  const contextOf = (link: TaskLink) => {
    const context = linkContext(link)?.trim();
    return context && !title.startsWith(context) ? context : null;
  };
  if (!showAnchor && doors.length === 0 && !loading) return null;
  return (
    <ul className="flex flex-col gap-2">
      {showAnchor && row.entityType != null ? (
        <li>
          <RecordDoor
            noun={`About · ${TASK_DESK_RECORD_NOUN[row.entityType] ?? 'Record'}`}
            glyph={ANCHOR_GLYPH[row.entityType] ?? FileText}
            label={anchorLabel}
            context={anchorContext}
            href={anchorHref}
            ticketStatus={anchorIsTicket ? row.ticket?.status : null}
          />
        </li>
      ) : null}
      {doors.map((link) => {
        const door = linkDoor(link, canOpenTickets);
        return (
          <li key={link.id}>
            <RecordDoor
              noun={TASK_LINK_NOUN[link.kind]}
              label={link.kind === 'ticket' ? `#${link.label}` : link.label}
              context={contextOf(link)}
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
 * Links twin. The mailbox (menu) and the order / ref number are edited on the
 * row; linking a new one is the ⋯ menu's "Link Customer Email…" (`TaskEmailLinkForm`).
 */
export function TaskEmailLinks({ taskId }: { taskId: number }) {
  const { refs, mailboxes, loading, update, remove } = useTaskEmailRefs(taskId);
  const [error, setError] = useState<string | null>(null);
  const failed = (err: unknown, fallback: string) => setError(err instanceof Error ? err.message : fallback);
  if (!loading && refs.length === 0 && !error) return null;

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
      {error ? (
        <p role="alert" className="text-role-micro text-text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Link Customer Email…" — paste the customer's address or the email's From / To
 * lines. A pasted header block is multi-line; an input would flatten it, so an
 * address in the clipboard links at once.
 */
export function TaskEmailLinkForm({ taskId, onDone }: { taskId: number; onDone: () => void }) {
  const { link: linkPaste } = useTaskEmailRefs(taskId);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const link = (raw: string) => {
    setError(null);
    linkPaste.mutate(raw, {
      onSuccess: () => {
        setValue('');
        onDone();
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Could not link that email.'),
    });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="mobile-task-email-link-form">
      <TextField
        label="Customer email or From / To lines"
        value={value}
        onChange={setValue}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim()) link(value);
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text');
          if (!text.includes('@')) return;
          event.preventDefault();
          link(text);
        }}
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        data-testid="mobile-task-email-link-input"
      />
      {error ? (
        <p role="alert" className="text-role-micro text-text-danger">
          {error}
        </p>
      ) : null}
      <Button variant="primary" size="lg" className="min-h-12" disabled={!value.trim() || linkPaste.isPending} onClick={() => link(value)}>
        Link
      </Button>
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
        {/* P1 — no "Email" label: the mail glyph and the address say it. */}
        <a href={`mailto:${emailRef.customerEmail}`} className="block break-all text-role-data font-semibold text-text-default">
          <span className="sr-only">Email </span>
          {emailRef.customerEmail}
        </a>
        <span className="flex min-w-0 items-center gap-1.5 pt-1 text-role-micro text-text-muted">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Came in on ${emailRef.mailbox} — change the mailbox`}
                className={cn('inline-flex min-h-11 shrink-0 items-center gap-1 bg-surface-sunken px-2 font-mono font-semibold text-text-default', MOBILE_ROW_CORNER)}
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
            className={cn('min-h-11 min-w-0 flex-1 border border-transparent bg-transparent px-2 text-role-field text-text-default outline-none placeholder:text-text-muted focus:border-border-soft', MOBILE_ROW_CORNER)}
          />
        </span>
      </span>
      <IconButton
        size="touch"
        radius="pill"
        ariaLabel={`Unlink ${emailRef.customerEmail}`}
        onClick={onRemove}
        icon={<X className="h-4 w-4" />}
        className="shrink-0"
      />
    </li>
  );
}
