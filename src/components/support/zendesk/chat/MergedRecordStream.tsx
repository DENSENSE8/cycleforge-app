'use client';

/** The ticket conversation stream — helpdesk messages (optionally interleaved with warehouse / carrier events) over one shared… */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ZendeskAgent, ZendeskComment, ZendeskUser } from '@/lib/zendesk';
import { useTicketComments, useZendeskAgents, useZendeskUsers } from '@/hooks/useZendeskQueries';
import {
  zendeskCommentsToTimeline,
  type MergedRecordItem,
  type TicketAttachment,
  type TicketCommentRow,
  type TicketMessageDetail,
} from '@/lib/timeline';
import type { TimelineItem } from '@/lib/timeline/types';
import { resolveTimelineGlyph } from '@/lib/timeline/timeline-glyphs';
import { TIMELINE_GLYPH_ICONS } from '@/components/ui/timeline-glyph-icons';
import { TimelineRefChip } from '@/components/ui/timeline-ref-chip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IdentityMark, StaffAvatar } from '@/components/identity';
import { staffInitials } from '@/design-system/components/StaffBadge';
import { Button, Spinner } from '@/design-system/primitives';
import { CONVERSATION_INSET } from '@/design-system/primitives/conversation-chrome';
import { formatDateTimePST, formatDateWithOrdinal, toPSTDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { renderBlockMarkdown } from '@/lib/support/markdown';
import { ConversationMessageCard } from '@/design-system/primitives/ConversationMessageCard';
import { isConversationAtEnd, resolveAuthor } from './support-chat-utils';
import {
  TICKET_BUBBLE_BODY,
  TICKET_BUBBLE_DAY_HEADER,
  TICKET_BUBBLE_DAY_LABEL,
  TICKET_BUBBLE_MARK_NODE,
  TICKET_BUBBLE_MARK_PLACEHOLDER,
  TICKET_BUBBLE_MARK_BOX,
  TICKET_BUBBLE_STREAM,
} from './ticket-bubble-chrome';

/** Rows rendered before the "Show earlier" control appears, and the size of one page of history. */
const STREAM_PAGE = 60;

interface ZAttachmentWire {
  id: number;
  file_name: string;
  content_url: string;
  thumbnail_url?: string | null;
  content_type?: string | null;
}

function imageAttachments(c: ZendeskComment): TicketAttachment[] {
  const raw = (c as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) return [];
  return (raw as ZAttachmentWire[])
    .filter(
      (a) =>
        (a.content_type ?? '').startsWith('image/') ||
        /\.(png|jpe?g|webp|gif)$/i.test(a.file_name ?? ''),
    )
    .map((a) => ({
      id: a.id,
      fileName: a.file_name,
      contentUrl: a.content_url,
      thumbnailUrl: a.thumbnail_url ?? null,
    }));
}

function atMs(at: string | null): number {
  if (!at) return 0;
  const t = new Date(at).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Leading mark — author's identity for a message, station glyph for an event. */
function ThreadStaffMark({
  staffId,
  name,
}: {
  staffId: number | string;
  name?: string | null;
}) {
  return (
    <div className={TICKET_BUBBLE_MARK_BOX}>
      <StaffAvatar
        staffId={staffId}
        name={name}
        size="sm"
        colorRing
        className={TICKET_BUBBLE_MARK_NODE}
        alt={name ?? undefined}
      />
    </div>
  );
}

function RowMark({ item }: { item: MergedRecordItem }) {
  if (item.message) {
    const { authorName, authorPhoto, authorStaffId } = item.message;
    const staffId = authorStaffId ?? item.actorStaffId ?? null;
    if (staffId) {
      return <ThreadStaffMark staffId={staffId} name={authorName} />;
    }
    return (
      <div className={TICKET_BUBBLE_MARK_BOX}>
        <IdentityMark
          initials={staffInitials(authorName)}
          src={authorPhoto}
          size="sm"
          ring={false}
          alt={authorName}
          className={TICKET_BUBBLE_MARK_PLACEHOLDER}
        />
      </div>
    );
  }

  if (item.actorStaffId) {
    return <ThreadStaffMark staffId={item.actorStaffId} name={item.actor} />;
  }

  const glyph = resolveTimelineGlyph(item.sourceEventType);
  const Icon = TIMELINE_GLYPH_ICONS[glyph.id];
  return (
    <div className={TICKET_BUBBLE_MARK_BOX}>
      <HoverTooltip label={glyph.tooltip} focusable={false}>
        {/* A system event's node. Opaque + z-10 like an avatar, so the spine
            passes behind it rather than through it. */}
        <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-surface-canvas text-text-soft ring-1 ring-border-hairline">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </HoverTooltip>
    </div>
  );
}

function Attachments({
  atts,
  onOpenPhoto,
}: {
  atts: TicketAttachment[];
  onOpenPhoto?: (url: string) => void;
}) {
  if (!atts.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {atts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpenPhoto?.(a.contentUrl)}
          className="ds-raw-button block h-14 w-14 overflow-hidden rounded-lg ring-1 ring-inset ring-border-soft transition hover:opacity-90 hover:ring-blue-300"
        >
          <img
            src={a.thumbnailUrl || a.contentUrl}
            alt={a.fileName}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

function MessageMedia({
  msg,
  item,
  onOpenPhoto,
}: {
  msg: TicketMessageDetail | undefined;
  item: MergedRecordItem;
  onOpenPhoto?: (url: string) => void;
}) {
  const refs = item.refs?.length ? item.refs : item.ref ? [item.ref] : [];
  return (
    <>
      {refs.length ? (
        <div className="flex flex-wrap items-center gap-1">
          {refs.map((r, i) => (
            <TimelineRefChip key={`${r.kind}-${r.value}-${i}`} refItem={r} />
          ))}
        </div>
      ) : null}
      {msg?.attachments.length ? (
        <Attachments atts={msg.attachments} onOpenPhoto={onOpenPhoto} />
      ) : null}
    </>
  );
}

function MessageCopy({
  msg,
  item,
  onOpenPhoto,
}: {
  msg: TicketMessageDetail | undefined;
  item: MergedRecordItem;
  onOpenPhoto?: (url: string) => void;
}) {
  if (msg) {
    return <>{renderBlockMarkdown(msg.body, { onOpenPhoto })}</>;
  }
  return (
    <>
      <p className={TICKET_BUBBLE_BODY}>{item.title}</p>
      {item.subtitle ? (
        <p className="text-role-caption text-text-soft">{item.subtitle}</p>
      ) : null}
    </>
  );
}

function StreamRow({
  item,
  onOpenPhoto,
}: {
  item: MergedRecordItem;
  onOpenPhoto?: (url: string) => void;
}) {
  const msg: TicketMessageDetail | undefined = item.message;
  const internal = Boolean(msg?.internal);
  const ours = Boolean(msg?.ours);

  if (msg) {
    return (
      <ConversationMessageCard
        internal={internal}
        mark={<RowMark item={item} />}
        author={msg.authorName}
        at={item.at}
        atAbsolute={item.at ? formatDateTimePST(item.at) : null}
        data-testid={ours ? 'ticket-message-ours' : 'ticket-message'}
        footer={<MessageMedia msg={msg} item={item} onOpenPhoto={onOpenPhoto} />}
      >
        <MessageCopy msg={msg} item={item} onOpenPhoto={onOpenPhoto} />
      </ConversationMessageCard>
    );
  }

  // Floor / carrier events — same node + card grammar as messages so the
  // glyph top-aligns with the actor row (not a shorter `flex` fork).
  return (
    <ConversationMessageCard
      mark={<RowMark item={item} />}
      author={item.actor || undefined}
      at={item.at}
      atAbsolute={item.at ? formatDateTimePST(item.at) : null}
      data-testid="ticket-stream-event"
      footer={<MessageMedia msg={undefined} item={item} onOpenPhoto={onOpenPhoto} />}
    >
      <MessageCopy msg={undefined} item={item} onOpenPhoto={onOpenPhoto} />
    </ConversationMessageCard>
  );
}

export function MergedRecordStream({
  ticketId,
  requesterId,
  requesterName,
  requesterEmail,
  onOpenPhoto,
  events,
  bottomInsetPx = 0,
  previewComments,
}: {
  ticketId: number;
  requesterId?: number;
  requesterName?: string | null;
  requesterEmail?: string | null;
  onOpenPhoto?: (url: string) => void;
  events?: TimelineItem[];
  bottomInsetPx?: number;
  /** Unfiled station draft — render these instead of fetching the helpdesk. */
  previewComments?: readonly ZendeskComment[];
}) {
  const live = useTicketComments(previewComments ? null : ticketId);
  const { data: agents = [] } = useZendeskAgents();
  const agentsById = useMemo(
    () => new Map<number, ZendeskAgent>(agents.map((a) => [a.id, a] as [number, ZendeskAgent])),
    [agents],
  );

  const comments = useMemo(
    () => previewComments ?? live.data?.comments ?? [],
    [previewComments, live.data],
  );
  const isLoading = previewComments ? false : live.isLoading;
  const error = previewComments ? null : live.error;

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

  const rows = useMemo<MergedRecordItem[]>(() => {
    const commentRows: TicketCommentRow[] = comments.map((c) => {
      const a = resolveAuthor(c, {
        agentsById,
        usersById,
        requesterId,
        requesterName,
        requesterEmail,
      });
      return {
        id: c.id,
        at: c.created_at,
        body: c.body,
        internal: c.public === false,
        authorName: a.name,
        authorEmail: a.email,
        authorPhoto: a.photo,
        authorStaffId: a.staffId,
        ours: a.isOurs,
        attachments: imageAttachments(c),
      };
    });

    return [...zendeskCommentsToTimeline(commentRows), ...(events ?? [])].sort(
      (a, b) => atMs(a.at) - atMs(b.at),
    );
  }, [comments, agentsById, usersById, requesterId, requesterName, requesterEmail, events]);

  const [windowSize, setWindowSize] = useState(STREAM_PAGE);
  useEffect(() => setWindowSize(STREAM_PAGE), [ticketId]);

  const hiddenCount = Math.max(0, rows.length - windowSize);
  const visible = hiddenCount > 0 ? rows.slice(hiddenCount) : rows;

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [rows.length]);

  // A growing composer (auto-grow textarea, CC strip, staged thumbs) eats the band the newest message occupies.
  useEffect(() => {
    const end = endRef.current;
    const port = end?.closest<HTMLElement>('[data-conversation-port]');
    if (!end || !port) return;
    if (!isConversationAtEnd(port)) return;
    end.scrollIntoView({ block: 'end' });
  }, [bottomInsetPx]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-16', CONVERSATION_INSET)}>
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <p className={cn(CONVERSATION_INSET, 'py-4 text-center text-role-micro text-rose-600')}>
        Couldn’t load the conversation.
      </p>
    );
  }
  if (!rows.length) {
    return (
      <div className={cn(CONVERSATION_INSET, 'py-10 text-center')}>
        <p className="text-role-micro text-text-faint">
          No messages yet — start the conversation below.
        </p>
      </div>
    );
  }

  let lastDay: string | null = null;

  return (
    <div
      data-testid="support-merged-stream"
      data-stream-shell="bubble"
      className={TICKET_BUBBLE_STREAM}
    >
      {hiddenCount > 0 ? (
        <div className="flex justify-center py-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setWindowSize((n) => n + STREAM_PAGE)}
          >
            Show earlier · {hiddenCount} more
          </Button>
        </div>
      ) : null}

      {visible.map((item) => {
        const dayKey = toPSTDateKey(item.at);
        const showDay = dayKey !== lastDay;
        lastDay = dayKey;
        return (
          // Fragment, NOT a wrapper div: day dividers and rows stay siblings
          // in the stream so the column can centre the date independently.
          <Fragment key={String(item.id)}>
            {showDay ? (
              <div className={TICKET_BUBBLE_DAY_HEADER} data-date={dayKey}>
                <span className={TICKET_BUBBLE_DAY_LABEL}>
                  {formatDateWithOrdinal(dayKey)}
                </span>
              </div>
            ) : null}
            <StreamRow item={item} onOpenPhoto={onOpenPhoto} />
          </Fragment>
        );
      })}
      {bottomInsetPx > 0 ? (
        <div aria-hidden style={{ height: bottomInsetPx }} className="shrink-0" />
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
