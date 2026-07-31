'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ZendeskAgent, ZendeskComment, ZendeskUser } from '@/lib/zendesk';
import { useTicketComments, useZendeskAgents, useZendeskUsers } from '@/hooks/useZendeskQueries';
import { Spinner } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Globe, Lock } from '@/components/Icons';
import { formatDateTimePST } from '@/utils/date';
import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';
import { renderInlineMarkdown } from '@/lib/support/markdown';
import { initials, resolveAuthor } from './support-chat-utils';

interface ZAttachment {
  id: number;
  file_name: string;
  content_url: string;
  thumbnail_url?: string | null;
  content_type?: string | null;
}

function imageAttachments(c: ZendeskComment): ZAttachment[] {
  const raw = (c as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) return [];
  return (raw as ZAttachment[]).filter(
    (a) => (a.content_type ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.file_name ?? ''),
  );
}

function Time({ iso }: { iso: string }) {
  return (
    <HoverTooltip label={formatDateTimePST(iso)} focusable={false}>
      <span>{timeAgo(iso)}</span>
    </HoverTooltip>
  );
}

function Avatar({
  name,
  photo,
  ours,
  compact,
}: {
  name: string;
  photo: string | null;
  ours: boolean;
  compact?: boolean;
}) {
  const size = compact ? 'h-5 w-5' : 'h-7 w-7';
  if (photo) {
    return <img src={photo} alt="" loading="lazy" decoding="async" className={cn(size, 'shrink-0 rounded-full object-cover')} />;
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full text-role-micro',
        size,
        ours ? 'bg-blue-100 text-blue-700' : 'bg-surface-strong text-text-muted',
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Bigger, in-app photo grid. Clicking a photo opens the shared PhotoViewerModal
 * (owned by SupportTicketDetail) via `onOpenPhoto` — never a new browser tab.
 */
function Attachments({
  atts,
  onDark,
  onOpenPhoto,
  compact = false,
}: {
  atts: ZAttachment[];
  onDark: boolean;
  onOpenPhoto?: (url: string) => void;
  compact?: boolean;
}) {
  if (!atts.length) return null;
  return (
    <div className={cn('mt-1.5 flex flex-wrap gap-1.5', compact ? 'mt-1' : 'mt-2 gap-2')}>
      {atts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpenPhoto?.(a.content_url)}
          className={cn(
            'ds-raw-button block overflow-hidden rounded-xl ring-1 ring-inset transition hover:opacity-90 hover:ring-2',
            compact ? 'h-16 w-16 rounded-lg' : 'h-28 w-28',
            onDark ? 'ring-white/30 hover:ring-white/60' : 'ring-border-soft hover:ring-blue-300',
          )}
        >
          <img
            src={a.thumbnail_url || a.content_url}
            alt={a.file_name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Chat-style timeline. Avatars always sit on the left; OUR messages (agent
 * public replies AND internal notes) use blue / amber bubbles, the requester
 * uses white. Bodies render inline markdown; authors resolve to a name/email
 * (never "User #<id>").
 */
export function SupportChatThread({
  ticketId,
  requesterId,
  requesterName,
  requesterEmail,
  onOpenPhoto,
  compact = false,
}: {
  ticketId: number;
  requesterId?: number;
  requesterName?: string | null;
  requesterEmail?: string | null;
  onOpenPhoto?: (url: string) => void;
  /** Station / carton push — denser chrome; body stays readable (`text-role-data`). */
  compact?: boolean;
}) {
  const { data, isLoading, error } = useTicketComments(ticketId);
  const { data: agents = [] } = useZendeskAgents();
  const agentsById = useMemo(
    () => new Map<number, ZendeskAgent>(agents.map((a) => [a.id, a] as [number, ZendeskAgent])),
    [agents],
  );

  const comments = data?.comments ?? [];

  // Resolve non-agent authors only when the bundle/comments route did not already enrich them.
  const userIds = useMemo(
    () =>
      comments
        .filter((c) => !(c as { author_name?: string }).author_name)
        .map((c) => c.author_id)
        .filter((id) => id > 0 && !agentsById.has(id)),
    [comments, agentsById],
  );
  const { data: users = [] } = useZendeskUsers(userIds);
  const usersById = useMemo(
    () => new Map<number, ZendeskUser>(users.map((u) => [u.id, u] as [number, ZendeskUser])),
    [users],
  );

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [comments.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <p
        className={cn(
          'px-5 py-6 text-center text-rose-600',
          compact ? 'px-3 py-4 text-role-micro' : 'text-role-caption',
        )}
      >
        Couldn’t load the conversation.
      </p>
    );
  }
  if (!comments.length) {
    return (
      <div className={cn('text-center', compact ? 'px-3 py-10' : 'px-5 py-16')}>
        <p className={cn('text-text-faint', compact ? 'text-role-micro' : 'text-role-caption')}>
          No messages yet — start the conversation below.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(compact ? 'space-y-3 px-2.5 py-2' : 'space-y-5 px-5 py-6')}>
      {comments.map((c) => {
        const a = resolveAuthor(c, { agentsById, usersById, requesterId, requesterName, requesterEmail });
        const atts = imageAttachments(c);
        const internal = c.public === false;
        const onDark = a.isOurs && !internal; // only the blue public bubble is dark
        const showEmail = Boolean(a.email && a.email !== a.name && !compact);
        const nameEl = (
          <span className="shrink-0 font-semibold text-text-muted">{a.name}</span>
        );

        return (
          <div key={c.id} className={cn('flex items-end', compact ? 'gap-1.5' : 'gap-2')}>
            <Avatar name={a.name} photo={a.photo} ours={a.isOurs} compact={compact} />
            <div className="min-w-0 max-w-[78%] items-start">
              <div
                className={cn(
                  'mb-1 flex min-w-0 items-center gap-1.5 justify-start',
                  compact ? 'mb-0.5 gap-1 text-role-micro' : 'text-role-caption',
                )}
              >
                {internal ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center uppercase tracking-widest text-amber-700',
                      compact
                        ? 'gap-0.5 rounded bg-amber-100 px-1 py-px text-role-eyebrow'
                        : 'gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-role-eyebrow',
                    )}
                  >
                    <Lock className={compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} /> Internal
                  </span>
                ) : a.isOurs ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center uppercase tracking-widest text-blue-700',
                      compact
                        ? 'gap-0.5 rounded bg-blue-100 px-1 py-px text-role-eyebrow'
                        : 'gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-role-eyebrow',
                    )}
                  >
                    <Globe className={compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} /> Public
                  </span>
                ) : null}
                {compact && a.email && a.email !== a.name ? (
                  <HoverTooltip label={a.email} focusable={false}>
                    {nameEl}
                  </HoverTooltip>
                ) : (
                  nameEl
                )}
                {showEmail ? (
                  <span className="min-w-0 truncate text-text-faint">· {a.email}</span>
                ) : null}
                <span className="shrink-0 text-text-faint">
                  · <Time iso={c.created_at} />
                </span>
              </div>
              <div
                className={cn(
                  'rounded-2xl shadow-sm rounded-bl-md text-role-data leading-relaxed',
                  compact ? 'px-3 py-2' : 'px-3.5 py-2.5',
                  a.isOurs
                    ? internal
                      ? 'border border-amber-200 bg-amber-50 text-amber-900'
                      : 'bg-blue-600 text-white'
                    : 'border border-border-soft bg-surface-card text-text-default',
                )}
              >
                <div className="break-words">
                  {renderInlineMarkdown(c.body, { onOpenPhoto })}
                </div>
                <Attachments atts={atts} onDark={onDark} onOpenPhoto={onOpenPhoto} compact={compact} />
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
