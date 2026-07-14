'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, Globe, MessageSquare, Send, Ticket } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useThread } from '@/hooks/useThread';
import type { ThreadMessage } from '@/lib/threads/types';
import { initials } from '@/components/support/zendesk/chat/support-chat-utils';
import { formatDateTimePST } from '@/utils/date';
import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';

/**
 * ThreadPanel — the one reusable entity-conversation surface (chat bubbles +
 * composer), ticket-optional, mounted in the idiomatic slot of every entity
 * detail Workbench (docs/todo/entity-threads-conversation-plan.md D5).
 * Mirrors the sanctioned support-chat anatomy (`SupportChatThread` /
 * `SupportChatComposer`); the read-only merged history stays `EventTimeline`
 * (its rows gain THREAD_MESSAGE via the adapter) — this is the *channel*,
 * never the record. Do NOT mount the composer on a Monitor surface (D8).
 */

function Time({ iso }: { iso: string }) {
  return (
    <HoverTooltip label={formatDateTimePST(iso)} focusable={false}>
      <span>{timeAgo(iso)}</span>
    </HoverTooltip>
  );
}

function MessageBubble({ m, ownStaffId }: { m: ThreadMessage; ownStaffId: number | null }) {
  const internal = m.visibility === 'internal';
  const ours = m.authorStaffId != null && m.authorStaffId === ownStaffId;
  const name = m.authorName?.trim() || (m.provider === 'system' ? 'System' : 'Staff');
  const pending = m.id < 0; // optimistic row (negative temp id) awaiting server ack

  return (
    <div className={cn('flex items-end gap-2.5', pending && 'opacity-60')}>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-role-micro',
          ours ? 'bg-blue-100 text-blue-700' : 'bg-surface-strong text-text-muted',
        )}
      >
        {initials(name)}
      </span>
      <div className="min-w-0 max-w-[78%] items-start">
        <div className="mb-1 flex items-center gap-2 text-role-caption justify-start">
          {internal ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-amber-700">
              <Lock className="h-2.5 w-2.5" /> Internal
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-blue-700">
              <Globe className="h-2.5 w-2.5" /> Public
            </span>
          )}
          <span className="font-bold text-text-muted">{name}</span>
          <span className="text-text-faint">
            · <Time iso={m.createdAt} />
          </span>
        </div>
        <div
          className={cn(
            'rounded-2xl rounded-bl-md px-3.5 py-2.5 text-role-data leading-relaxed shadow-sm',
            internal
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : ours
                ? 'bg-blue-600 text-white'
                : 'border border-border-soft bg-surface-card text-text-default',
          )}
        >
          <div className="whitespace-pre-wrap break-words">{m.body}</div>
        </div>
      </div>
    </div>
  );
}

export function ThreadPanel({
  entityType,
  entityId,
  dense = false,
  className,
}: {
  /** Canonical anchor vocab (SURFACE_ENTITY_TYPES key, e.g. 'ORDER'). */
  entityType: string;
  entityId: number | null | undefined;
  /** Tighter paddings for sidebar/tab slots. */
  dense?: boolean;
  className?: string;
}) {
  const { user, has, isLoaded } = useAuth();
  const canView = isLoaded && has('support.thread.view');
  const canPost = isLoaded && has('support.thread.manage');
  const {
    thread,
    threadLoading,
    threadError,
    messages,
    messagesLoading,
    messagesError,
    postMessage,
  } = useThread(entityType, entityId);

  const [body, setBody] = useState('');
  // Default to internal — public mirrors to the linked ticket only once
  // provider mirroring lands; the toggle stays for Zendesk note/reply parity.
  const [isPublic, setIsPublic] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (!isLoaded || !canView) return null;

  const submit = () => {
    const text = body.trim();
    if (!text || postMessage.isPending) return;
    postMessage.mutate(
      { body: text, visibility: isPublic ? 'public' : 'internal' },
      { onSuccess: () => setBody('') },
    );
  };

  const loading = threadLoading || messagesLoading;
  const error = threadError || messagesError;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {thread?.supportTicketId ? (
        <div className={cn('flex items-center justify-end pb-2', dense ? 'px-3' : 'px-5')}>
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-role-eyebrow font-black uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
            <Ticket className="h-2.5 w-2.5" /> Ticket #{thread.supportTicketId}
          </span>
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1 overflow-y-auto', dense ? 'px-3 py-3' : 'px-5 py-4')}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-role-caption text-text-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-600">
            Couldn’t load the conversation.
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-5 w-5 text-text-faint" />
            <p className="text-role-caption text-text-faint">
              No messages yet — start the conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} ownStaffId={user?.staffId ?? null} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {canPost ? (
        <div className={cn('shrink-0 border-t border-border-hairline bg-surface-card py-3', dense ? 'px-3' : 'px-4')}>
          <div className="mb-2.5 flex items-center justify-between">
            <VisibilityToggle
              value={isPublic}
              onChange={setIsPublic}
              internalLabel="Internal note"
              publicLabel="Public"
            />
          </div>
          <div
            className={cn(
              'rounded-xl border bg-surface-card transition',
              isPublic
                ? 'border-border-soft focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100'
                : 'border-amber-300 bg-amber-50/30 focus-within:ring-2 focus-within:ring-amber-100',
            )}
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
              }}
              rows={dense ? 2 : 3}
              placeholder={
                isPublic
                  ? 'Message…  (⌘↵ to send)'
                  : 'Internal note — team only…  (⌘↵ to send)'
              }
              className="block w-full resize-none rounded-xl bg-transparent px-3.5 py-2.5 text-role-caption leading-relaxed text-text-default outline-none placeholder:text-text-faint"
            />
            <div className="flex items-center justify-between border-t border-border-hairline px-3 py-2">
              <span className="text-role-caption text-text-faint">
                {postMessage.isError ? 'Couldn’t send — try again.' : isPublic ? 'Visible on the record' : 'Team-only note'}
              </span>
              <Button
                variant={isPublic ? 'primary' : 'secondary'}
                size="sm"
                loading={postMessage.isPending}
                disabled={!body.trim()}
                onClick={submit}
                icon={<Send className="h-3.5 w-3.5" />}
              >
                {isPublic ? 'Send' : 'Add note'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
