'use client';

/**
 * The ticket conversation stream — helpdesk messages (optionally interleaved
 * with warehouse / carrier events) over one shared `TimelineItem` waist.
 *
 * **One face everywhere.** Unbox · Arrival · Testing Ticket Displays and
 * `/support` share this bubble chrome ({@link ./ticket-bubble-chrome}). No
 * ledger shell or variant prop — `SupportChatThread` stays deleted.
 *
 * **Station Ticket Displays omit `events`** (messages only). Floor spine lives
 * on the peer Timeline Displays tab (`EventTimeline` / `WorkspaceTimelineTab`).
 * Support service workspace may still pass a collapsed event spine via
 * `mergeFloorTimeline` until an explicit Floor toggle ships.
 *
 * ## Sibling of `EventTimeline`, not a fork
 *
 * Every row is a `TimelineItem` from `src/lib/timeline/` adapters. Merge / sort /
 * day-key logic is shared. Only the message **shell** is conversation chrome
 * (block markdown + attachments do not fit `EventTimeline`'s title + subtitle).
 *
 * ## Reading direction is ASCENDING
 *
 * Composer docks at the bottom → newest adjacent → sort oldest → newest and
 * scroll to the end. `collapseTimeline` runs on the EVENT spine only (never
 * messages — consecutive same-author replies must not fold).
 *
 * ## Scroll + gutter
 *
 * Host owns the scroll port (`SupportTicketDetail`). Chrome from
 * {@link ./ticket-bubble-chrome}: stream + composer share `DISPLAYS_BODY_INSET`.
 * Host stays flush (`DISPLAYS_FLUSH_HOST`).
 */

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
import { DateGroupHeader } from '@/components/ui/DateGroupHeader';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IdentityMark, StaffAvatar } from '@/components/identity';
import { staffInitials } from '@/design-system/components/StaffBadge';
import { Button, Spinner } from '@/design-system/primitives';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { formatDateTimePST, toPSTDateKey } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { cn } from '@/utils/_cn';
import { renderBlockMarkdown } from '@/lib/support/markdown';
import { ConversationMessageCard } from '@/design-system/primitives/ConversationMessageCard';
import { isConversationAtEnd, resolveAuthor } from './support-chat-utils';
import {
  TICKET_BUBBLE_BODY,
  TICKET_BUBBLE_DAY_HEADER,
  TICKET_BUBBLE_MARK,
  TICKET_BUBBLE_MARK_BOX,
  TICKET_BUBBLE_META,
  TICKET_BUBBLE_STREAM,
  formatTicketBubbleAge,
} from './ticket-bubble-chrome';

/**
 * Rows rendered before the "Show earlier" control appears, and the size of one
 * page of history.
 *
 * A ticket can carry hundreds of comments and an unbounded `map` over all of
 * them is what the ruling forbids. A bottom-anchored conversation makes the
 * cheap answer the right one: render the TAIL and page backwards on request —
 * no virtualizer, no measured row heights, and the newest message (the only one
 * that must be on screen) is always mounted.
 */
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

/** Relative in the row (`N hrs`), absolute on hover — never `title=`. */
function RowTime({ at }: { at: string | null }) {
  useTimeFormat();
  if (!at) return <span className="shrink-0 text-text-faint">—</span>;
  return (
    <HoverTooltip label={formatDateTimePST(at)} focusable={false}>
      <span className="shrink-0 text-text-faint">{formatTicketBubbleAge(at) ?? '—'}</span>
    </HoverTooltip>
  );
}

/**
 * Leading mark — author's identity for a message, station glyph for an event.
 *
 * Messages use {@link IdentityMark} with the helpdesk roster photo rather than
 * {@link StaffAvatar}: a helpdesk comment carries an agent id, not a `staff.id`.
 */
function RowMark({ item }: { item: MergedRecordItem }) {
  if (item.message) {
    const { authorName, authorPhoto } = item.message;
    return (
      <div className={TICKET_BUBBLE_MARK_BOX}>
        <IdentityMark
          initials={staffInitials(authorName)}
          src={authorPhoto}
          size="xs"
          ring={false}
          alt={authorName}
          className={TICKET_BUBBLE_MARK}
        />
      </div>
    );
  }

  if (item.actorStaffId) {
    return (
      <div className={TICKET_BUBBLE_MARK_BOX}>
        <StaffAvatar
          staffId={item.actorStaffId}
          name={item.actor}
          size="xs"
          ring={false}
          className={TICKET_BUBBLE_MARK}
        />
      </div>
    );
  }

  const glyph = resolveTimelineGlyph(item.sourceEventType);
  const Icon = TIMELINE_GLYPH_ICONS[glyph.id];
  return (
    <div className={TICKET_BUBBLE_MARK_BOX}>
      <HoverTooltip label={glyph.tooltip} focusable={false}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-canvas text-text-soft">
          <Icon className="h-3 w-3" />
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

function MetaLine({
  item,
  msg,
}: {
  item: MergedRecordItem;
  msg: TicketMessageDetail | undefined;
}) {
  return (
    <div className={TICKET_BUBBLE_META}>
      <span className="truncate font-semibold text-text-default">
        {msg ? msg.authorName : item.actor || ''}
      </span>
      <span aria-hidden className="text-text-faint">
        ·
      </span>
      <RowTime at={item.at} />
    </div>
  );
}

function MessageBody({
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
      {msg ? (
        <div className={TICKET_BUBBLE_BODY}>
          {renderBlockMarkdown(msg.body, { onOpenPhoto })}
        </div>
      ) : (
        <div className="stack-tight">
          <p className={TICKET_BUBBLE_BODY}>{item.title}</p>
          {item.subtitle ? (
            <p className="text-role-caption text-text-soft">{item.subtitle}</p>
          ) : null}
        </div>
      )}

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
      >
        <MessageBody msg={msg} item={item} onOpenPhoto={onOpenPhoto} />
      </ConversationMessageCard>
    );
  }

  // Floor / carrier events (optional merge) — quiet flat row, same mark density.
  return (
    <div data-stream-row="event" data-stream-shell="event" className="flex gap-1.5 py-1">
      <RowMark item={item} />
      <div className="min-w-0 flex-1 stack-tight">
        <MetaLine item={item} msg={undefined} />
        <MessageBody msg={undefined} item={item} onOpenPhoto={onOpenPhoto} />
      </div>
    </div>
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
}: {
  ticketId: number;
  requesterId?: number;
  requesterName?: string | null;
  requesterEmail?: string | null;
  onOpenPhoto?: (url: string) => void;
  /**
   * Warehouse / carrier spine — `SupportContextBundle.timeline`, already merged,
   * sorted and collapsed. Omit ⇒ messages only.
   */
  events?: TimelineItem[];
  /**
   * Live height of a floating composer overlaying the bottom of this stream's
   * scroll port (measured by {@link useMeasuredHeight} in the host).
   *
   * It is spent as a SPACER inside the stream, ABOVE the autoscroll sentinel —
   * not as padding on the port. `scrollIntoView({ block: 'end' })` aligns the
   * sentinel with the port's bottom edge, so a sentinel below the reserved band
   * would park the newest message right back under the composer. With the
   * spacer first, "scrolled to the end" means the last message sits clear of
   * the dock.
   */
  bottomInsetPx?: number;
}) {
  const { data, isLoading, error } = useTicketComments(ticketId);
  const { data: agents = [] } = useZendeskAgents();
  const agentsById = useMemo(
    () => new Map<number, ZendeskAgent>(agents.map((a) => [a.id, a] as [number, ZendeskAgent])),
    [agents],
  );

  const comments = useMemo(() => data?.comments ?? [], [data]);

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

  // A growing composer (auto-grow textarea, CC strip, staged thumbs) eats the
  // band the newest message occupies. Re-dock the end ONLY when the reader is
  // already parked there — re-scrolling someone who has read up into history
  // would yank the thread out from under them.
  useEffect(() => {
    const end = endRef.current;
    const port = end?.closest<HTMLElement>('[data-conversation-port]');
    if (!end || !port) return;
    if (!isConversationAtEnd(port)) return;
    end.scrollIntoView({ block: 'end' });
  }, [bottomInsetPx]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-16', DISPLAYS_BODY_INSET)}>
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <p className={cn(DISPLAYS_BODY_INSET, 'py-4 text-center text-role-micro text-rose-600')}>
        Couldn’t load the conversation.
      </p>
    );
  }
  if (!rows.length) {
    return (
      <div className={cn(DISPLAYS_BODY_INSET, 'py-10 text-center')}>
        <p className="text-role-micro text-text-faint">
          No messages yet — start the conversation below.
        </p>
      </div>
    );
  }

  const dayTotals = new Map<string, number>();
  for (const r of visible) {
    const key = toPSTDateKey(r.at);
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + 1);
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
          // Fragment, NOT a wrapper div: `DateGroupHeader` is `sticky top-0`,
          // and a sticky element only travels inside its own containing block.
          // Wrapped per-item, the docked date fell out of view as soon as the
          // day's FIRST message scrolled past. As siblings of the rows, the
          // band stays docked for the whole day it labels.
          <Fragment key={String(item.id)}>
            {showDay ? (
              <DateGroupHeader
                date={dayKey}
                total={dayTotals.get(dayKey) ?? 0}
                className={TICKET_BUBBLE_DAY_HEADER}
              />
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
