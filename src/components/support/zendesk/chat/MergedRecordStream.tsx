'use client';

/**
 * The ticket's MERGED RECORD STREAM — helpdesk messages, optionally interleaved
 * with warehouse / carrier events, over one shared `TimelineItem` waist.
 *
 * **Two row shells, one job discriminator (read vs select):**
 *
 * - `variant="ledger"` (default) — flat rows on one shared left reading edge
 *   (`divide-y`, leading mark). Correct when the stream is **scanned / selected**
 *   (dense triage — `/support` service workspace). Direction is the mark, never
 *   a fill.
 * - `variant="bubble"` — conversation bubbles (inbound vs outbound by shell).
 *   Correct when the surface is **read + reply** — station Ticket Displays
 *   (`TicketDisplayHost` → `SupportTicketDetail` `streamVariant="bubble"`).
 *   Opted in there only; never derive from `embedded` alone (`/support` focus
 *   is also embedded and stays ledger). Never a third renderer
 *   (`SupportChatThread` stays deleted).
 *
 * **Station Ticket Displays omit `events`** (messages only). Floor spine lives
 * on the peer Timeline Displays tab (`EventTimeline` / `WorkspaceTimelineTab`).
 * Support service workspace may still pass a collapsed event spine via
 * `mergeFloorTimeline` until an explicit Floor toggle ships.
 *
 * ## It is a SIBLING of `EventTimeline`, not a fork of it — and not a third one
 *
 * `reference-timeline.md` sanctions exactly one fork (`AuditTimeline`) and
 * forbids growing another, so this needs its reason stated rather than assumed:
 *
 *  - **The data waist is shared, and that is the part that matters.** Every row
 *    here is a `TimelineItem` produced by an adapter in `src/lib/timeline/` —
 *    `zendeskCommentsToTimeline` for messages, the existing `*ToTimeline`
 *    adapters (via `bundle.timeline`) for events. Merge / sort / day-key logic is
 *    the house's. Nothing about a domain is re-derived here.
 *  - **Only the ROW SHELL diverges.** Ledger uses the house one-row anatomy
 *    (40px leading mark, `divide-y`, day bands via {@link DateGroupHeader}).
 *    Bubble keeps the same adapters / day bands / markdown / attachments — only
 *    the message shell changes for a read surface.
 *  - **Body still cannot live in `EventTimeline`.** A message is *block
 *    markdown* + attachments; that does not fit `title` + `subtitle`.
 *
 * ## Reading direction is ASCENDING, and that is not the timeline default
 *
 * Every `EventTimeline` consumer reads newest-first. A conversation does not:
 * the composer that answers it is docked at the bottom, so the newest message
 * must be adjacent to it and the eye path is body → last message → input. The
 * stream therefore sorts oldest → newest and rests scrolled to the end.
 *
 * ## `collapseTimeline` runs on the EVENT spine only
 *
 * That helper folds adjacent rows with an equal `title + ref + actor + tone`
 * signature. Every message from one author shares a title and an actor, so
 * running it across the merged list would fold two consecutive replies into one
 * and silently delete a customer's words. The caller hands us an
 * already-collapsed event list; messages are never collapsed.
 *
 * ## Scroll ownership
 *
 * This is CONTENT. The host owns the port (`SupportTicketDetail`'s
 * `min-h-0 flex-1 overflow-y-auto`); the stream adds no `overflow-*`, no
 * `flex-1`, no height floor.
 *
 * ## Displays gutter
 *
 * On `variant="bubble"` chrome comes from {@link ./ticket-bubble-chrome} —
 * stream + composer share `DISPLAYS_BODY_INSET`, one white shell face, micro
 * body type, left-aligned capped width. Host stays flush (`DISPLAYS_FLUSH_HOST`).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Lock } from '@/components/Icons';
import { formatDateTimePST, toPSTDateKey } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';
import { renderBlockMarkdown } from '@/lib/support/markdown';
import { resolveAuthor } from './support-chat-utils';
import {
  TICKET_BUBBLE_BODY,
  TICKET_BUBBLE_INTERNAL_CHIP,
  TICKET_BUBBLE_MARK,
  TICKET_BUBBLE_MARK_BOX,
  TICKET_BUBBLE_META,
  TICKET_BUBBLE_ROW,
  TICKET_BUBBLE_SHELL,
  TICKET_BUBBLE_STREAM,
  TICKET_LEDGER_BODY,
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

type MergedRecordStreamVariant = 'ledger' | 'bubble';

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

/** Relative in the row, absolute on hover — never `title=`. */
function RowTime({ at, dense }: { at: string | null; dense?: boolean }) {
  // Subscribe so a 12h↔24h flip re-renders the absolute face immediately.
  useTimeFormat();
  if (!at) return <span className="text-text-faint">—</span>;
  const face = dense ? formatTicketBubbleAge(at) ?? '—' : timeAgo(at);
  return (
    <HoverTooltip label={formatDateTimePST(at)} focusable={false}>
      <span className="shrink-0 text-text-faint">{face}</span>
    </HoverTooltip>
  );
}

/**
 * The leading mark — author's identity for a message, station glyph for an event.
 *
 * Messages use {@link IdentityMark} with the helpdesk roster photo rather than
 * {@link StaffAvatar}: a helpdesk comment carries an agent id, not a `staff.id`,
 * and an avatar is never guessed from a display name.
 *
 * Bubble rows pass `dense` — quieter xs mark via {@link TICKET_BUBBLE_MARK}.
 */
function RowMark({
  item,
  compact,
  dense,
}: {
  item: MergedRecordItem;
  compact: boolean;
  dense?: boolean;
}) {
  const size = dense || compact ? 'xs' : 'sm';
  const box = dense ? TICKET_BUBBLE_MARK_BOX : compact ? 'flex w-7 shrink-0 justify-start pt-0.5' : 'flex w-10 shrink-0 justify-start pt-0.5';
  const quiet = dense ? TICKET_BUBBLE_MARK : undefined;

  if (item.message) {
    const { authorName, authorPhoto } = item.message;
    return (
      <div className={box}>
        <IdentityMark
          initials={staffInitials(authorName)}
          src={authorPhoto}
          size={size}
          ring={false}
          alt={authorName}
          className={quiet}
        />
      </div>
    );
  }

  if (item.actorStaffId) {
    return (
      <div className={box}>
        <StaffAvatar
          staffId={item.actorStaffId}
          name={item.actor}
          size={size}
          ring={false}
          className={quiet}
        />
      </div>
    );
  }

  const glyph = resolveTimelineGlyph(item.sourceEventType);
  const Icon = TIMELINE_GLYPH_ICONS[glyph.id];
  return (
    <div className={box}>
      <HoverTooltip label={glyph.tooltip} focusable={false}>
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-canvas text-text-soft',
            dense || compact ? 'h-5 w-5' : 'h-7 w-7',
          )}
        >
          <Icon className={dense || compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </span>
      </HoverTooltip>
    </div>
  );
}

function Attachments({
  atts,
  onOpenPhoto,
  compact,
}: {
  atts: TicketAttachment[];
  onOpenPhoto?: (url: string) => void;
  compact: boolean;
}) {
  if (!atts.length) return null;
  return (
    <div className={cn('flex flex-wrap', compact ? 'gap-1' : 'gap-1.5')}>
      {atts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpenPhoto?.(a.contentUrl)}
          className={cn(
            'ds-raw-button block overflow-hidden rounded-lg ring-1 ring-inset ring-border-soft transition hover:opacity-90 hover:ring-blue-300',
            compact ? 'h-14 w-14' : 'h-20 w-20',
          )}
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
  internal,
  compact,
  dense,
}: {
  item: MergedRecordItem;
  msg: TicketMessageDetail | undefined;
  internal: boolean;
  compact: boolean;
  /** Station Ticket bubble — micro meta + `N hrs` age. */
  dense?: boolean;
}) {
  return (
    <div
      className={
        dense
          ? TICKET_BUBBLE_META
          : 'flex min-w-0 items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-soft'
      }
    >
      <span className="truncate text-text-muted">{msg ? msg.authorName : item.actor || ''}</span>
      {msg?.authorEmail && msg.authorEmail !== msg.authorName && !compact ? (
        <span className="min-w-0 truncate normal-case tracking-normal text-text-faint">
          {msg.authorEmail}
        </span>
      ) : null}
      <span aria-hidden className="text-text-faint">
        ·
      </span>
      <RowTime at={item.at} dense={dense} />
      {internal ? (
        <>
          <span aria-hidden className="text-text-faint">
            ·
          </span>
          <span
            className={
              dense
                ? TICKET_BUBBLE_INTERNAL_CHIP
                : 'inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1 py-px text-amber-700'
            }
          >
            <Lock className="h-2.5 w-2.5" /> Internal
          </span>
        </>
      ) : null}
    </div>
  );
}

function MessageBody({
  msg,
  item,
  onOpenPhoto,
  compact,
  dense,
}: {
  msg: TicketMessageDetail | undefined;
  item: MergedRecordItem;
  onOpenPhoto?: (url: string) => void;
  compact: boolean;
  /** Station Ticket bubble — micro density from {@link TICKET_BUBBLE_BODY}. */
  dense?: boolean;
}) {
  const refs = item.refs?.length ? item.refs : item.ref ? [item.ref] : [];
  const bodyRole = dense ? TICKET_BUBBLE_BODY : TICKET_LEDGER_BODY;
  return (
    <>
      {msg ? (
        <div className={bodyRole}>
          {renderBlockMarkdown(msg.body, { onOpenPhoto })}
        </div>
      ) : (
        <div className="stack-tight">
          <p className={bodyRole}>{item.title}</p>
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
        <Attachments atts={msg.attachments} onOpenPhoto={onOpenPhoto} compact={compact} />
      ) : null}
    </>
  );
}

function StreamRow({
  item,
  onOpenPhoto,
  compact,
  variant,
}: {
  item: MergedRecordItem;
  onOpenPhoto?: (url: string) => void;
  compact: boolean;
  variant: MergedRecordStreamVariant;
}) {
  const msg: TicketMessageDetail | undefined = item.message;
  const internal = Boolean(msg?.internal);
  const ours = Boolean(msg?.ours);

  if (variant === 'bubble' && msg) {
    return (
      <div
        data-stream-row="message"
        data-stream-shell="bubble"
        data-internal={internal ? 'true' : undefined}
        data-ours={ours ? 'true' : undefined}
        className={TICKET_BUBBLE_ROW}
      >
        <RowMark item={item} compact={compact} dense />
        <div className={TICKET_BUBBLE_SHELL}>
          <MetaLine
            item={item}
            msg={msg}
            internal={internal}
            compact={compact}
            dense
          />
          <MessageBody
            msg={msg}
            item={item}
            onOpenPhoto={onOpenPhoto}
            compact={compact}
            dense
          />
        </div>
      </div>
    );
  }

  // Ledger (default) — and non-message rows even when the stream is bubble.
  return (
    <div
      data-stream-row={msg ? 'message' : 'event'}
      data-stream-shell="ledger"
      data-internal={internal ? 'true' : undefined}
      className={cn(
        'flex gap-2',
        // Bubble list already owns DISPLAYS_BODY_INSET — vertical pad only.
        variant === 'bubble'
          ? 'py-1.5'
          : compact
            ? 'px-2.5 py-2'
            : 'px-4 py-3',
        // A tint, never a bubble — and never the ONLY carrier of "internal":
        // the row also says so in words on the meta line.
        internal && variant === 'ledger' ? 'bg-surface-sunken' : null,
      )}
    >
      <RowMark item={item} compact={compact} />

      <div className="min-w-0 flex-1 stack-tight">
        <MetaLine item={item} msg={msg} internal={internal} compact={compact} />
        <MessageBody msg={msg} item={item} onOpenPhoto={onOpenPhoto} compact={compact} />
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
  compact = false,
  variant = 'ledger',
}: {
  ticketId: number;
  requesterId?: number;
  requesterName?: string | null;
  requesterEmail?: string | null;
  onOpenPhoto?: (url: string) => void;
  /**
   * The warehouse / carrier spine for this ticket — `SupportContextBundle.timeline`,
   * already merged, sorted and **collapsed** by `mergeSupportContextTimeline`.
   * Omit ⇒ messages only (the stream still renders; it just has one spine).
   */
  events?: TimelineItem[];
  /** Station / carton push — denser chrome. Ledger body stays data; bubble uses {@link TICKET_BUBBLE_BODY}. */
  compact?: boolean;
  /**
   * Row shell. `ledger` = flat selectable/scannable list (default, `/support`).
   * `bubble` = read-a-conversation on station Ticket Displays.
   */
  variant?: MergedRecordStreamVariant;
}) {
  const bubble = variant === 'bubble';
  const { data, isLoading, error } = useTicketComments(ticketId);
  const { data: agents = [] } = useZendeskAgents();
  const agentsById = useMemo(
    () => new Map<number, ZendeskAgent>(agents.map((a) => [a.id, a] as [number, ZendeskAgent])),
    [agents],
  );

  const comments = useMemo(() => data?.comments ?? [], [data]);

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

    // Messages are never collapsed (see the docblock); `events` arrives already
    // collapsed from `mergeSupportContextTimeline`.
    return [...zendeskCommentsToTimeline(commentRows), ...(events ?? [])].sort(
      (a, b) => atMs(a.at) - atMs(b.at),
    );
  }, [comments, agentsById, usersById, requesterId, requesterName, requesterEmail, events]);

  const [windowSize, setWindowSize] = useState(STREAM_PAGE);
  // A new ticket restarts at the tail — otherwise arrowing to a short ticket
  // would keep a previous ticket's expanded window.
  useEffect(() => setWindowSize(STREAM_PAGE), [ticketId]);

  const hiddenCount = Math.max(0, rows.length - windowSize);
  const visible = hiddenCount > 0 ? rows.slice(hiddenCount) : rows;

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [rows.length]);

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-16',
          bubble && DISPLAYS_BODY_INSET,
        )}
      >
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <p
        className={cn(
          'text-center text-rose-600',
          bubble
            ? cn(DISPLAYS_BODY_INSET, 'py-4 text-role-micro')
            : compact
              ? 'px-3 py-4 text-role-micro'
              : 'px-5 py-6 text-role-caption',
        )}
      >
        Couldn’t load the conversation.
      </p>
    );
  }
  if (!rows.length) {
    return (
      <div
        className={cn(
          'text-center',
          bubble
            ? cn(DISPLAYS_BODY_INSET, 'py-10')
            : compact
              ? 'px-3 py-10'
              : 'px-5 py-16',
        )}
      >
        <p className={cn('text-text-faint', compact ? 'text-role-micro' : 'text-role-caption')}>
          No messages yet — start the conversation below.
        </p>
      </div>
    );
  }

  // Day-band counts come from the whole (visible) window, so a band never
  // advertises a total the operator cannot see.
  const dayTotals = new Map<string, number>();
  for (const r of visible) {
    const key = toPSTDateKey(r.at);
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + 1);
  }

  let lastDay: string | null = null;

  return (
    <div
      data-testid="support-merged-stream"
      data-stream-variant={variant}
      className={cn(
        bubble ? TICKET_BUBBLE_STREAM : 'divide-y divide-border-hairline',
      )}
    >
      {hiddenCount > 0 ? (
        <div
          className={cn(
            'flex justify-center',
            bubble ? 'py-2' : compact ? 'px-2.5 py-2' : 'px-4 py-3',
          )}
        >
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
          <div key={String(item.id)}>
            {showDay ? (
              <DateGroupHeader
                date={dayKey}
                total={dayTotals.get(dayKey) ?? 0}
                // Bubble list already owns DISPLAYS_BODY_INSET — drop QUEUE_ROW.px.
                className={bubble ? 'px-0' : undefined}
              />
            ) : null}
            <StreamRow
              item={item}
              onOpenPhoto={onOpenPhoto}
              compact={compact}
              variant={variant}
            />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
