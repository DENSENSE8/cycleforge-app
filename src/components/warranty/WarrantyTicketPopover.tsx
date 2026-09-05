'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link2, Loader2, MessageSquare, Send, Unlink, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TicketPickRow } from '@/components/ui/TicketPickRow';
import { TicketComposer } from '@/components/composer/TicketComposer';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import { Button, IconButton, Popover, SearchField } from '@/design-system/primitives';
import { requestConfirm } from '@/design-system/components/confirm';
import { cornerClass } from '@/design-system/tokens/radius';
import { useWarrantyClaim } from '@/hooks/useWarrantyClaims';
import { useWarrantyMutations } from '@/hooks/useWarrantyMutations';
import {
  useWarrantyTicket,
  useWarrantyTicketCandidates,
  useWarrantyTicketComments,
  useWarrantyZendeskMutations,
  WarrantyZendeskDraftError,
} from '@/hooks/useWarrantyZendesk';
import {
  mergeWarrantyTimeline,
  warrantyEventLabel,
  type WarrantyTimelineEntry,
} from '@/lib/warranty/zendesk-format';
import { formatDateTimePST } from '@/utils/date';
import { renderInlineMarkdown } from '@/lib/support/markdown';

/**
 * Layers TicketComposer opens from inside this popover — the `+` drill menu
 * (a sibling Popover), the media-library picker (a modal RightPaneOverlay),
 * the confirm AlertDialog behind Unlink, Radix poppers. They portal to <body>,
 * so AnchoredLayer's outside-click test would read a click inside them as
 * "outside" and close the thread mid-action — unmounting the composer and the
 * picker it opened. Our own panel is excluded by `contains()` before this
 * selector is consulted. `aria-modal="true"` keeps the non-modal desk rail this
 * button sits in (RightRailHost stamps it only when modal) out of the match.
 */
const THREAD_POPOVER_IGNORE_CLICK_SELECTOR = [
  '[data-testid="composer-drill-menu"]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"]',
  '[data-radix-popper-content-wrapper]',
].join(', ');

/**
 * Single icon-button entry point for a claim's support thread. Click → house
 * Popover with the merged history (internal claim events + Zendesk comments,
 * chronological), TicketComposer for the reply, create / link-existing when no
 * ticket is linked yet, and a resolve action. Comments are fetched live from
 * Zendesk when the popover opens (read-time sync; Zendesk owns the thread).
 *
 * Until 2026-09-04 this file carried its own reply mouth — a raw textarea with
 * a ⌘Enter send and a "Customer-visible" checkbox — inside a hand-assembled
 * Panel with a dialog role on AnchoredLayer. TicketComposer is the ONE helpdesk
 * mouth (Internal|Public on the action bar, Cc on Public, `+` photo attach, a
 * labelled commit). Its send goes through the helpdesk chokepoint, which echoes
 * the reply onto the claim timeline (`ZENDESK_REPLY`) exactly as the
 * claim-scoped route did, so nothing the claim recorded before is lost.
 */
export function WarrantyTicketButton({
  claimId,
  linked,
  className,
}: {
  claimId: number;
  /** Whether the claim already has a linked Zendesk ticket (drives the tint). */
  linked: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <HoverTooltip label={linked ? 'Support ticket thread' : 'Create support ticket'} asChild>
        <IconButton
          ref={buttonRef}
          type="button"
          ariaLabel={linked ? 'Open support ticket thread' : 'Create support ticket'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          icon={<MessageSquare className="h-4 w-4" />}
          className={cn(
            'p-1.5 transition',
            cornerClass('row'),
            linked
              ? 'text-text-accent hover:bg-surface-accent'
              : 'text-text-faint hover:bg-surface-sunken hover:text-text-soft',
            className,
          )}
        />
      </HoverTooltip>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        placement="bottom-end"
        level="panelPopover"
        gap={6}
        ignoreClickSelector={THREAD_POPOVER_IGNORE_CLICK_SELECTOR}
        role="dialog"
        aria-label="Support ticket thread"
        className="flex max-h-[480px] w-[380px] max-w-[calc(100vw-24px)] flex-col"
      >
        <WarrantyTicketPanel claimId={claimId} />
      </Popover>
    </>
  );
}

function TimelineRow({ entry }: { entry: WarrantyTimelineEntry }) {
  if (entry.kind === 'event') {
    return (
      <li className="flex items-start gap-2 px-1 text-role-caption text-text-faint">
        <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 bg-surface-strong', cornerClass('pill'))} />
        <span>
          <span className="font-medium text-text-soft">{warrantyEventLabel(entry.event)}</span>
          <span className="ml-2">{formatDateTimePST(entry.createdAt)}</span>
        </span>
      </li>
    );
  }
  const { comment } = entry;
  return (
    <li
      className={cn(
        'border px-3 py-2',
        cornerClass('control'),
        comment.public
          ? 'border-border-accent bg-surface-accent/60'
          : 'border-border-warning bg-surface-warning/60',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-role-micro uppercase tracking-wide">
        <span className={comment.public ? 'font-semibold text-text-accent' : 'font-semibold text-text-warning'}>
          {comment.public ? 'Public reply' : 'Internal note'}
        </span>
        <span className="text-text-faint normal-case">{formatDateTimePST(comment.createdAt)}</span>
      </div>
      <div className="break-words text-role-data leading-snug text-text-default">
        {renderInlineMarkdown(comment.body)}
      </div>
    </li>
  );
}

function WarrantyTicketPanel({ claimId }: { claimId: number }) {
  const { data: claim, isLoading: claimLoading } = useWarrantyClaim(claimId);
  const ticketId = claim?.zendeskTicketId ?? null;
  const linked = ticketId != null;

  const ticketQuery = useWarrantyTicket(claimId, linked);
  const commentsQuery = useWarrantyTicketComments(claimId, linked);
  const { createTicket, linkExisting, unlink, invalidate } = useWarrantyZendeskMutations(claimId);
  const { lifecycle } = useWarrantyMutations();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Link-an-existing-ticket picker (only relevant while unlinked). The one
  // search box doubles as the manual ticket-number entry — the server resolves
  // a bare id to a direct lookup, so typing one behaves exactly like picking it
  // from the recent list. SearchField owns the debounce, so `linkQuery` is
  // already the settled query.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const candidatesQuery = useWarrantyTicketCandidates(claimId, linkQuery, linkOpen && !linked);

  const timeline = useMemo(
    () => mergeWarrantyTimeline(claim?.events ?? [], commentsQuery.data ?? []),
    [claim?.events, commentsQuery.data],
  );

  // Keep the newest entry in view as the thread loads/grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length]);

  const canResolve =
    linked && claim != null && ['APPROVED', 'DENIED', 'REPAIRED', 'EXPIRED'].includes(claim.status);

  const createDraft =
    createTicket.error instanceof WarrantyZendeskDraftError ? createTicket.error : null;

  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-border-hairline px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-text-accent" />
          <div className="min-w-0">
            <div className="truncate text-role-data font-semibold text-text-default">
              {linked ? `Ticket #${ticketId}` : 'Support thread'}
            </div>
            <div className="truncate font-mono text-role-micro text-text-faint">{claim?.claimNumber}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {ticketQuery.data?.ticket && (
            <span
              className={cn(
                'bg-surface-sunken px-2 py-0.5 text-role-micro font-medium uppercase tracking-wide text-text-soft',
                cornerClass('pill'),
              )}
            >
              {ticketQuery.data.ticket.status}
            </span>
          )}
          {ticketQuery.data?.ticketUrl && (
            <HoverTooltip label="Open in helpdesk" asChild>
              {/* ds-raw-anchor — a link to the helpdesk record (middle-click / copy link), not a button. */}
              <a
                href={ticketQuery.data.ticketUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in helpdesk"
                className={cn(
                  'ds-raw-anchor p-1 text-text-faint transition hover:bg-surface-sunken hover:text-text-muted',
                  cornerClass('row'),
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </HoverTooltip>
          )}
          {linked && (
            <HoverTooltip label="Unlink ticket (it stays in the helpdesk)" asChild>
              <IconButton
                type="button"
                disabled={unlink.isPending}
                ariaLabel="Unlink ticket"
                onClick={async () => {
                  if (ticketId == null) return;
                  const ok = await requestConfirm({
                    description: `Unlink ticket #${ticketId} from this claim? The ticket stays in the helpdesk — only the claim link is removed.`,
                    tone: 'danger',
                    confirmLabel: 'Unlink',
                  });
                  if (!ok) return;
                  unlink.mutate(ticketId, {
                    onSuccess: () => toast.success(`Unlinked ticket #${ticketId}`),
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : 'Unlink failed'),
                  });
                }}
                icon={
                  unlink.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )
                }
                className={cn(
                  'p-1 text-text-faint transition hover:bg-surface-danger hover:text-text-danger disabled:opacity-50',
                  cornerClass('row'),
                )}
              />
            </HoverTooltip>
          )}
          {canResolve && (
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate({ id: claimId, action: 'close' })}
            >
              {lifecycle.isPending ? 'Resolving…' : 'Resolve'}
            </Button>
          )}
        </div>
      </header>

      {claimLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-text-faint" />
        </div>
      ) : !claim ? (
        <p className="px-3 py-6 text-center text-sm text-text-faint">Claim not found.</p>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {commentsQuery.isFetching && timeline.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
              </div>
            ) : timeline.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-faint">No history yet.</p>
            ) : (
              <ul className="space-y-2">
                {timeline.map((entry) => (
                  <TimelineRow key={entry.key} entry={entry} />
                ))}
              </ul>
            )}
            {commentsQuery.isError && (
              <p className={cn('bg-surface-danger px-2 py-1.5 text-role-caption text-text-danger', cornerClass('row'))}>
                Ticket history unavailable:{' '}
                {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'request failed'}
              </p>
            )}
          </div>

          <footer className="border-t border-border-hairline bg-surface-canvas/60 px-3 py-2.5">
            {ticketId == null ? (
              <div className="space-y-2">
                <p className="text-role-caption text-text-soft">
                  No support ticket yet — create one from this claim to start the support thread.
                </p>
                {createDraft && (
                  <div className={cn('border border-border-warning bg-surface-warning p-2', cornerClass('row'))}>
                    <p className="mb-1 text-role-caption font-medium text-text-warning">
                      {createDraft.message} — copy the draft and file it manually:
                    </p>
                    <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap text-role-caption text-text-muted">
                      {[createDraft.draftSubject, createDraft.draftBody].filter(Boolean).join('\n\n')}
                    </pre>
                  </div>
                )}
                {createTicket.isError && !createDraft && (
                  <p className="text-role-caption text-text-danger">
                    {createTicket.error instanceof Error ? createTicket.error.message : 'Create failed.'}
                  </p>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={createTicket.isPending}
                  loading={createTicket.isPending}
                  onClick={() => createTicket.mutate()}
                  icon={<Send className="h-4 w-4" />}
                  className="w-full text-sm font-medium"
                >
                  Create support ticket
                </Button>

                {/* Link an EXISTING ticket — for claims whose ticket was filed
                    by email (the common case). Search, or type a ticket number
                    by hand; the manual id resolves identically to a list pick. */}
                {!linkOpen ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLinkOpen(true)}
                    icon={<Link2 className="h-3.5 w-3.5" />}
                    className={cn(
                      'h-auto w-full justify-center gap-1.5 border border-border-soft px-3 py-1.5 text-role-caption font-medium text-text-muted hover:bg-surface-hover',
                      cornerClass('control'),
                    )}
                  >
                    Link an existing ticket
                  </Button>
                ) : (
                  <div className={cn('space-y-2 border border-border-soft p-2', cornerClass('control'))}>
                    <div className="flex items-center justify-between">
                      <span className="text-role-caption font-semibold text-text-muted">Link existing ticket</span>
                      <IconButton
                        type="button"
                        onClick={() => {
                          setLinkOpen(false);
                          setLinkQuery('');
                        }}
                        ariaLabel="Cancel linking"
                        icon={<X className="h-3.5 w-3.5" />}
                        className={cn(
                          'p-0.5 text-text-faint transition hover:bg-surface-sunken hover:text-text-muted',
                          cornerClass('chip'),
                        )}
                      />
                    </div>
                    <SearchField
                      value={linkQuery}
                      onChange={setLinkQuery}
                      placeholder="Search subject or type a ticket number"
                      autoFocus
                      tone="neutral"
                      debounceMs={250}
                      isSearching={candidatesQuery.isFetching}
                    />
                    {linkExisting.isError && (
                      <p className="text-role-caption text-text-danger">
                        {linkExisting.error instanceof Error ? linkExisting.error.message : 'Link failed.'}
                      </p>
                    )}
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {candidatesQuery.isFetching ? (
                        <div className="flex items-center justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
                        </div>
                      ) : candidatesQuery.isError ? (
                        <p className="px-1 py-2 text-role-caption text-text-danger">
                          {candidatesQuery.error instanceof Error ? candidatesQuery.error.message : 'Search failed.'}
                        </p>
                      ) : (candidatesQuery.data?.tickets.length ?? 0) === 0 ? (
                        <p className="px-1 py-2 text-center text-role-caption text-text-faint">
                          {linkQuery.trim() ? 'No matching tickets.' : 'No recent tickets.'}
                        </p>
                      ) : (
                        candidatesQuery.data!.tickets.map((t) => (
                          <Button
                            key={t.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={linkExisting.isPending}
                            onClick={() =>
                              linkExisting.mutate(t.id, {
                                onSuccess: () => {
                                  setLinkOpen(false);
                                  setLinkQuery('');
                                  toast.success(`Linked ticket #${t.id}`);
                                },
                              })
                            }
                            className={cn(
                              'h-auto w-full justify-start border border-border-hairline px-2 py-1.5 text-left hover:border-border-accent hover:bg-surface-accent/40',
                              cornerClass('row'),
                            )}
                          >
                            <TicketPickRow
                              ticketId={t.id}
                              subject={t.subject}
                              emptySubject="(no subject)"
                              subjectClassName="font-medium text-text-muted"
                              meta={
                                <span className="text-role-micro uppercase tracking-wide text-text-faint">
                                  {t.status}
                                </span>
                              }
                              trailing={<Link2 className="h-3.5 w-3.5 text-text-accent" />}
                            />
                          </Button>
                        ))
                      )}
                    </div>
                    {(candidatesQuery.data?.hiddenLinked ?? 0) > 0 && (
                      <p className="px-1 text-role-micro text-text-faint">
                        {candidatesQuery.data!.hiddenLinked} hidden — already linked elsewhere.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // The ONE helpdesk mouth. No reply presets — those are the
              // receiving QC chips, not warranty grammar. `onSent` refetches
              // the claim-scoped merged thread; the composer already refreshes
              // the ticket's own keys.
              <TicketComposer ticketId={ticketId} showReplyPresets={false} onSent={invalidate} />
            )}
          </footer>
        </>
      )}
    </>
  );
}
