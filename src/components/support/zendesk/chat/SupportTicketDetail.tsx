'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from '@/design-system/motion';
import {
  isNotConfigured,
  isRateLimited,
  useZendeskTicketBundle,
} from '@/hooks/useZendeskQueries';
import {
  useTicketPhotoStaging,
  type TicketPhotoStaging,
} from '@/hooks/useTicketPhotoStaging';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useMeasuredHeight } from '@/hooks/useMeasuredHeight';
import { useSupportContext } from '@/hooks/useSupportContext';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
import type { ZendeskComment } from '@/lib/zendesk';
import { EmptyState, Spinner } from '@/design-system/primitives';
import { Link2, Upload } from '@/components/Icons';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { RequesterDetailBand } from '@/components/support/service-workspace/RequesterDetailBand';
import { SupportChatHeader } from './SupportChatHeader';
import { MergedRecordStream } from './MergedRecordStream';
import { TicketComposer } from '@/components/composer/TicketComposer';
import { useTicketComposerStaging } from './TicketComposerStagingContext';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { SupportContextDetailPanel } from '@/components/support/context/SupportContextDetailPanel';
import { requesterFrom, requesterLabel } from './support-chat-utils';
import {
  CONVERSATION_COMPOSER_PAD,
  CONVERSATION_DETAIL_SURFACE,
} from '@/design-system/primitives/conversation-chrome';
import { cn } from '@/utils/_cn';

/** Image attachment urls on a single Zendesk comment (full-res `content_url`). */
function commentImageUrls(c: ZendeskComment): string[] {
  const raw = (c as { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) return [];
  return (raw as Array<{ content_url?: string; file_name?: string; content_type?: string | null }>)
    .filter(
      (a) =>
        (a.content_type ?? '').startsWith('image/') ||
        /\.(png|jpe?g|webp|gif)$/i.test(a.file_name ?? ''),
    )
    .map((a) => a.content_url)
    .filter((u): u is string => Boolean(u));
}

/**
 * Chat-style ticket detail: lean inline title → scrollable conversation →
 * sticky composer (or host-owned dock).
 *
 * Linkage / Connections live on the host rail, not restated in this header.
 *
 * Owns ONE photo gallery aggregated across all message attachments + linked
 * photos, so clicking any photo opens the shared in-app PhotoViewerModal (no new
 * tab) and the viewer can page across the whole ticket.
 */
export function SupportTicketDetail({
  ticketId,
  onBack,
  /** Station / Unbox rail — denser chrome, no AI panel. */
  embedded = false,
  /**
   * With {@link hideTitle}, hide this strip entirely (`/support`). The header
   * is title-only; this flag no longer draws a requester band.
   */
  hideRequesterBand,
  /**
   * Drop the editable subject title. `/support` sets it: the thread's split
   * header already carries the subject in its identity row, and drawing it
   * again here was the duplicate. Hosts with no such header leave it off.
   */
  hideTitle = false,
  /** Carton context for media library “Current carton” tab (unbox / testing). */
  receivingId,
  /** Hide linked-context strip (when already shown by SupportContextHub). */
  hideLinkedContext = false,
  /**
   * Render the {@link RequesterDetailBand} at the head of the conversation's
   * scroll port. `/support` sets it and, in the same breath, hides this
   * component's own requester band — the band is that line's replacement, not a
   * second copy of it. Station embeds keep the denser header line.
   */
  showRequesterDetail = false,
  onComposerBridgeChange,
  /**
   * `inline` — sticky composer under the thread (default / console).
   * `host` — station owns the floating {@link SupportTicketComposerDock}; skip
   * inline I/O. Staging comes from {@link photoStaging} or
   * {@link TicketComposerStagingProvider}.
   */
  composerPlacement = 'inline',
  photoStaging,
  /**
   * Interleave warehouse / carrier spine with helpdesk messages.
   *
   * **Default `false` (messages only).** Scan-station Ticket Displays (Unbox ·
   * Testing · Pack) keep the floor spine on the peer **Timeline** Displays tab —
   * never inside Ticket. Support service workspace may opt in until an explicit
   * Floor toggle ships.
   */
  mergeFloorTimeline = false,
  /**
   * Forwarded to {@link TicketComposer}. Unbox Ticket Displays passes
   * `false`; Testing · `/support` keep the default on.
   */
  showReplyPresets = true,
}: {
  ticketId: number;
  onBack?: () => void;
  /** Hide the in-header Zendesk link when the host already shows one. */
  hideExternalLink?: boolean;
  embedded?: boolean;
  hideRequesterBand?: boolean;
  hideTitle?: boolean;
  receivingId?: number;
  hideLinkedContext?: boolean;
  showRequesterDetail?: boolean;
  /** Exposes the embedded composer to a station terminal dock. */
  onComposerBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  composerPlacement?: 'inline' | 'host';
  /**
   * Host-owned staging (optional when a {@link TicketComposerStagingProvider}
   * wraps the tree). Inline placement creates its own when neither is set.
   */
  photoStaging?: TicketPhotoStaging;
  mergeFloorTimeline?: boolean;
  showReplyPresets?: boolean;
}) {
  const hideRequester = hideRequesterBand ?? embedded;
  const { data: bundle, isLoading, error } = useZendeskTicketBundle(ticketId);
  const ticket = bundle?.ticket;
  const commentsData = bundle
    ? { comments: bundle.comments, count: bundle.commentsCount, next_page: bundle.commentsNextPage }
    : undefined;
  const photosData = bundle ? { entity: bundle.entity, photos: bundle.photos } : undefined;

  const showContext = !hideLinkedContext;
  const contextAnchor = useMemo(
    () => ({ ticket: String(ticketId) }),
    [ticketId],
  );
  // Always enabled — linkage / requester band / optional floor merge share one
  // `SupportContextBundle` fetch (same key as Focus + Displays). Readers only;
  // never a second query. Floor events reach the stream only when
  // `mergeFloorTimeline` is on — station Ticket keeps them on Timeline Displays.
  const { data: contextBundle } = useSupportContext(contextAnchor, true);
  const [contextOpen, setContextOpen] = useState(false);

  const photoUrls = useMemo(() => {
    const urls: string[] = [];
    for (const c of commentsData?.comments ?? []) urls.push(...commentImageUrls(c));
    for (const p of photosData?.photos ?? []) if (p.url) urls.push(p.url);
    return Array.from(new Set(urls));
  }, [commentsData, photosData]);

  const gallery = usePhotoGallery({ photos: photoUrls });
  const { openViewer } = gallery;

  const onOpenPhoto = useCallback(
    (url: string) => {
      const idx = photoUrls.indexOf(url);
      if (idx >= 0) openViewer(idx);
    },
    [photoUrls, openViewer],
  );

  // Drag-a-photo-onto-the-ticket: the dropzone covers the whole panel; dropping
  // uploads to GCS (linked to this ticket) and stages it in the composer.
  // Host-owned staging (prop or context) wins so Attach / drop share one bag.
  const contextStaging = useTicketComposerStaging();
  const localStaging = useTicketPhotoStaging(ticketId);
  const staging = photoStaging ?? contextStaging ?? localStaging;
  // Drag + pick only. PASTE belongs to the host that owns the whole surface —
  // on `/support`, `SupportTicketFocus` listens at document scope so a pasted
  // image both stages AND asks for a draft. If this body also caught paste, the
  // same gesture would mean "attach quietly" or "attach and draft" depending on
  // where the cursor happened to be.
  const dz = usePhotoDropzone(staging.addFiles, { paste: false });
  const hostOwnsComposer = composerPlacement === 'host';
  // Live height of the floating composer — the band the thread must keep clear.
  const [composerRef, composerHeight] = useMeasuredHeight<HTMLDivElement>();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title={
            isNotConfigured(error)
              ? 'Helpdesk isn’t connected'
              : isRateLimited(error)
                ? `${capabilityTitle('helpdesk')} is busy`
                : 'Couldn’t load ticket'
          }
          description={
            isNotConfigured(error)
              ? 'Connect one in Settings → Integrations to use the console.'
              : isRateLimited(error)
                ? `Too many requests to the ${capabilityTitle('helpdesk').toLowerCase()}. Wait a moment, then refresh or reselect the ticket.`
                : 'Try selecting the ticket again.'
          }
          action={
            isNotConfigured(error) ? (
              <Link
                href="/settings/integrations#zendesk"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent-bg px-4 text-role-data font-semibold text-text-inverse shadow-sm transition-colors hover:bg-accent-bg/90 active:bg-accent-bg/90"
              >
                <Link2 className="h-4 w-4" />
                Connect a helpdesk
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const requester = requesterFrom(ticket);

  return (
    <div
      {...dz.rootProps}
      className={cn('relative flex h-full min-h-0 flex-col', CONVERSATION_DETAIL_SURFACE)}
    >
      {/* `data-conversation-port` marks the scroll ancestor the stream measures
          against when the floating composer resizes. */}
      <div data-conversation-port className="min-h-0 flex-1 overflow-y-auto">
        {/* The title rides INSIDE the port (operator ruling 2026-08-31): it is
            the head of the record, not chrome bolted above it, so it scrolls
            away with the oldest message the same way a subject line does at the
            top of an email thread. Pinned, it cost a row of thread height on
            every station line for a string the operator reads once. */}
        <SupportChatHeader
          ticket={ticket}
          onBack={onBack}
          compact={embedded}
          hideRequesterBand={hideRequester}
          hideTitle={hideTitle}
        />
        {/* Context FOR the conversation, so it lives in the conversation's own
            port and scrolls away with it — not pinned chrome.
            Deliberately NOT `compact={embedded}`: `/support` passes `embedded`
            to mean "denser chrome, no AI panel", not "360px column", and
            deriving density from it silently disabled the counts on the one
            surface the band exists for. `compact` is for a narrow host. */}
        {showRequesterDetail ? (
          <RequesterDetailBand ticketId={ticketId} bundle={contextBundle} />
        ) : null}
        <MergedRecordStream
          ticketId={ticketId}
          requesterId={ticket.requester_id}
          requesterName={requesterLabel(ticket)}
          requesterEmail={requester.email}
          onOpenPhoto={onOpenPhoto}
          events={mergeFloorTimeline ? contextBundle?.timeline : undefined}
          bottomInsetPx={hostOwnsComposer ? 0 : composerHeight}
        />
      </div>
      {/* AI suggested reply intentionally omitted for now (station + console). */}
      {hostOwnsComposer ? null : (
        // FLOATS over the thread rather than sitting in flow under it: the
        // conversation reads as one continuous plane the composer hovers on.
        // The port is not padded — the stream spends `composerHeight` as a
        // spacer above its autoscroll sentinel, so the newest message parks
        // clear of the dock at every composer height.
        <div
          ref={composerRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-raised"
        >
          <div className="pointer-events-auto">
            <TicketComposer
              ticketId={ticketId}
              requesterEmail={requester.email}
              staging={staging}
              receivingId={receivingId}
              onBridgeChange={onComposerBridgeChange}
              showReplyPresets={showReplyPresets}
              className={CONVERSATION_COMPOSER_PAD}
            />
          </div>
        </div>
      )}

      {showContext ? (
        <SupportContextDetailPanel
          ticketId={ticketId}
          anchor={contextAnchor}
          open={contextOpen}
          onClose={() => setContextOpen(false)}
          embedded={embedded}
          // FLOAT, not push. One of this component's hosts is
          // Unbox Displays Ticket (`StationDisplaysPushColumn`) — so pushing
          // would put two columns on one edge. The reason belongs to the HOST,
          // which is why `push` is a required prop rather than a default baked
          // into the panel.
          push={false}
          // No `tabs`: the Unbox "Links" rail keeps the linkage strip above the
          // hub's own Customer | Team | Activity pills. It has no Conversations
          // tab to fall back on, so Team must stay reachable here.
        />
      ) : null}

      {/* Full-panel drop overlay while dragging an OS file over the ticket. */}
      <AnimatePresence>
        {dz.isDragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-blue-700">
              <Upload className="h-7 w-7" />
              <p className="text-role-caption font-semibold">Drop to attach · #{ticketId}</p>
              <p className="text-role-caption font-semibold text-blue-500">Uploads to the library, attaches on your next reply</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Shared fullscreen viewer for every photo on this ticket. */}
      {gallery.photoItems.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </div>
  );
}
