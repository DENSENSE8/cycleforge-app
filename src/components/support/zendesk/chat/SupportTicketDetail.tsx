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
import type { ZendeskComment, ZendeskTicket } from '@/lib/zendesk';
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

/** Chat-style ticket detail: */
export function SupportTicketDetail({
  ticketId,
  onBack,
  /** Station / Unbox rail — denser chrome, no AI panel. */
  embedded = false,
  /** Carton context for media library “Current carton” tab (unbox / testing). */
  receivingId,
  /** Hide linked-context strip (when already shown by SupportContextHub). */
  hideLinkedContext = false,
  /** Render the {@link RequesterDetailBand} at the head of the conversation's scroll port. */
  showRequesterDetail = false,
  onComposerBridgeChange,
  /** `inline` — sticky composer under the thread (default / console). */
  composerPlacement = 'inline',
  photoStaging,
  mergeFloorTimeline = false,
  preview = null,
}: {
  ticketId: number;
  onBack?: () => void;
  hideExternalLink?: boolean;
  embedded?: boolean;
  receivingId?: number;
  hideLinkedContext?: boolean;
  showRequesterDetail?: boolean;
  onComposerBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  composerPlacement?: 'inline' | 'host';
  photoStaging?: TicketPhotoStaging;
  mergeFloorTimeline?: boolean;
  preview?: { ticket: ZendeskTicket; comments: readonly ZendeskComment[] } | null;
}) {
  const { data: bundle, isLoading, error } = useZendeskTicketBundle(preview ? null : ticketId);
  const ticket = preview?.ticket ?? bundle?.ticket;
  const commentsData = preview
    ? { comments: preview.comments, count: preview.comments.length, next_page: null }
    : bundle
      ? { comments: bundle.comments, count: bundle.commentsCount, next_page: bundle.commentsNextPage }
      : undefined;
  const photosData = bundle ? { entity: bundle.entity, photos: bundle.photos } : undefined;

  const showContext = !hideLinkedContext && !preview;
  const contextAnchor = useMemo(
    () => ({ ticket: String(preview ? 0 : ticketId) }),
    [preview, ticketId],
  );
  const { data: contextBundle } = useSupportContext(contextAnchor, !preview);
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
  const localStaging = useTicketPhotoStaging({ kind: 'ticket', ticketId });
  const staging = photoStaging ?? contextStaging ?? localStaging;
  // Drag + pick only.
  const ignoreDrop = useCallback(() => undefined, []);
  const dz = usePhotoDropzone(preview ? ignoreDrop : staging.addFiles, { paste: false });
  const hostOwnsComposer = composerPlacement === 'host';
  // Live height of the floating composer — the band the thread must keep clear.
  const [composerRef, composerHeight] = useMeasuredHeight<HTMLDivElement>();

  if (!preview && isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!preview && (error || !ticket)) {
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

  if (!ticket) return null;

  const requester = requesterFrom(ticket);

  return (
    <div
      {...dz.rootProps}
      className={cn('relative flex h-full min-h-0 flex-col', CONVERSATION_DETAIL_SURFACE)}
    >
      {/* `data-conversation-port` marks the scroll ancestor the stream measures
          against when the floating composer resizes. */}
      <div data-conversation-port className="min-h-0 flex-1 overflow-y-auto">
        {/*
 * The title rides INSIDE the port (operator ruling 2026-08-31):
 * The title rides INSIDE the port (operator ruling 2026-08-31): it is
 */}
        <SupportChatHeader
          ticket={ticket}
          onBack={onBack}
          compact={embedded}
          readOnly={Boolean(preview)}
        />
        {showRequesterDetail ? (
          <RequesterDetailBand ticketId={ticketId} bundle={contextBundle} />
        ) : null}
        <MergedRecordStream
          ticketId={preview ? 0 : ticketId}
          requesterId={ticket.requester_id}
          requesterName={requesterLabel(ticket)}
          requesterEmail={requester.email}
          onOpenPhoto={onOpenPhoto}
          events={mergeFloorTimeline ? contextBundle?.timeline : undefined}
          bottomInsetPx={hostOwnsComposer ? 0 : composerHeight}
          previewComments={preview?.comments}
        />
      </div>
      {/* AI suggested reply intentionally omitted for now (station + console). */}
      {hostOwnsComposer ? null : (
        // FLOATS over the thread rather than sitting in flow under it:
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
          // FLOAT, not push.
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
            className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent-border bg-surface-sunken/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-accent-bg">
              <Upload className="h-7 w-7" />
              <p className="text-role-caption font-semibold">Drop to attach · #{ticketId}</p>
              <p className="text-role-caption font-semibold text-text-soft">Uploads to the library, attaches on your next reply</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Shared fullscreen viewer for every photo on this ticket. */}
      {gallery.photoItems.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </div>
  );
}
