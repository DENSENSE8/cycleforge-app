'use client';

/** CC strip — the audience row of a **public** ticket reply. */

import { useId, useMemo, useRef } from 'react';
import { AtSign, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useZendeskAgents, useZendeskTicket } from '@/hooks/useZendeskQueries';
import { requesterFrom } from '@/components/support/zendesk/chat/support-chat-utils';
import {
  addComposerCc,
  buildComposerCcSuggestions,
  removeComposerCc,
} from '@/lib/composer/ticket-cc';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function ComposerTicketCcStrip({
  ccs,
  onCcsChange,
  draft,
  onDraftChange,
  requesterEmail,
  ticketId,
  className,
}: {
  ccs: string[];
  onCcsChange: (next: string[]) => void;
  /** The half-typed address. Owned by the host so send can fold it in. */
  draft: string;
  onDraftChange: (next: string) => void;
  /** Resolved requester (console passes it; the station leaves it undefined). */
  requesterEmail?: string | null;
  /** Station path — resolve the requester from the ticket cache instead. */
  ticketId?: number | null;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const datalistId = useId();
  const { data: agents = [] } = useZendeskAgents();
  // Only when the host could not hand us one — the console already has it, and
  // the station shares this cache with the ticket pane when it is open.
  const needsRequesterLookup = requesterEmail === undefined && ticketId != null;
  const { data: ticket } = useZendeskTicket(needsRequesterLookup ? ticketId : null);
  const resolvedRequester =
    requesterEmail ?? (ticket ? requesterFrom(ticket).email : null);

  const suggestions = useMemo(
    () =>
      buildComposerCcSuggestions({
        requesterEmail: resolvedRequester,
        agentEmails: agents.map((a) => a.email),
        ccs,
      }),
    [agents, resolvedRequester, ccs],
  );

  const commitDraft = (raw: string) => {
    const next = addComposerCc(ccs, raw);
    if (next.length !== ccs.length) {
      onCcsChange(next);
      onDraftChange('');
    }
  };

  return (
    <div
      data-testid="composer-ticket-cc-strip"
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-1 py-0.5',
        className,
      )}
    >
      <HoverTooltip label="Cc someone on this reply" asChild>
        {/* ds-raw-button */}
        <button
          type="button"
          aria-label="Add Cc"
          data-testid="composer-ticket-cc-at"
          onClick={() => inputRef.current?.focus()}
          className={cn(
            'ds-raw-button inline-flex h-5 shrink-0 items-center gap-0.5 rounded-sm px-1',
            'text-role-micro font-semibold uppercase tracking-widest text-text-faint',
            'hover:bg-surface-sunken hover:text-text-muted',
            focusRing('control', 'accent'),
          )}
        >
          <AtSign className="h-3 w-3" /> Cc
        </button>
      </HoverTooltip>
      {ccs.map((email) => (
        <span
          key={email}
          data-testid="composer-ticket-cc-chip"
          className="inline-flex h-5 items-center gap-0.5 rounded-sm bg-blue-50 px-1.5 text-role-micro font-semibold text-blue-700 ring-1 ring-inset ring-blue-200"
        >
          {email}
          <IconButton
            onClick={() => onCcsChange(removeComposerCc(ccs, email))}
            ariaLabel={`Remove ${email}`}
            tone="accent"
            icon={<X className="h-2.5 w-2.5" />}
            className="rounded-full text-blue-400 hover:text-blue-700"
          />
        </span>
      ))}
      <input
        ref={inputRef}
        list={datalistId}
        data-testid="composer-ticket-cc-input"
        aria-label="Add email to CC"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
            // Enter here is "add this address", never "send the reply".
            e.preventDefault();
            e.stopPropagation();
            commitDraft(draft);
          } else if (e.key === 'Backspace' && !draft && ccs.length) {
            onCcsChange(removeComposerCc(ccs, ccs[ccs.length - 1]!));
          }
        }}
        onBlur={() => commitDraft(draft)}
        placeholder={ccs.length ? 'Add another…' : 'Add email to CC…'}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-role-caption text-text-default outline-none placeholder:text-text-faint"
      />
      <datalist id={datalistId}>
        {suggestions.map((email) => (
          <option key={email} value={email} />
        ))}
      </datalist>
    </div>
  );
}
