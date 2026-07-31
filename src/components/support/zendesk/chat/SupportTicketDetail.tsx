'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
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
import { useSupportContext } from '@/hooks/useSupportContext';
import type { SupportContextBundle } from '@/lib/support/context-types';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
import type { ZendeskComment } from '@/lib/zendesk';
import { EmptyState, Spinner } from '@/design-system/primitives';
import { Link2, Upload } from '@/components/Icons';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { SupportChatHeader } from './SupportChatHeader';
import { SupportChatThread } from './SupportChatThread';
import { SupportChatComposer } from './SupportChatComposer';
import { useTicketComposerStaging } from './TicketComposerStagingContext';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { SupportContextDetailPanel } from '@/components/support/context/SupportContextDetailPanel';
import { supportOrdersHref } from '@/components/sidebar/support/support-sidebar-shared';
import { requesterFrom, requesterLabel } from './support-chat-utils';

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

/** Compact linked-state label for the header Links control. */
function contextBadgeFromBundle(bundle: SupportContextBundle | undefined): string {
  if (!bundle) return 'Links';
  const order = bundle.linkage.order?.orderId?.trim();
  if (order) {
    return order.length > 8 ? `…${order.slice(-4)}` : order;
  }
  const tracking =
    bundle.linkage.trackings.find((t) => t.isPrimary)?.tracking ??
    bundle.linkage.trackings[0]?.tracking ??
    bundle.linkable?.trackingNumber ??
    null;
  if (tracking?.trim()) {
    const t = tracking.trim();
    return t.length > 8 ? `…${t.slice(-4)}` : t;
  }
  return 'Unlinked';
}

/**
 * Chat-style ticket detail: sticky header (requester + Zendesk pickers + staff
 * assignment) → scrollable conversation → sticky composer (or host-owned dock).
 *
 * Support Context (Linkage + Team + Activity) lives in the global detail-stack
 * slide-over ({@link SupportContextDetailPanel}) opened from the header.
 *
 * Owns ONE photo gallery aggregated across all message attachments + linked
 * photos, so clicking any photo opens the shared in-app PhotoViewerModal (no new
 * tab) and the viewer can page across the whole ticket.
 */
export function SupportTicketDetail({
  ticketId,
  onBack,
  hideExternalLink = false,
  /** Station / Unbox rail — denser chrome, no AI panel. */
  embedded = false,
  /**
   * Drop the avatar/requester identity band. Defaults to `embedded` (station
   * Ticket tabs hide it — identity lives in SupportTicketIdentity). Unbox
   * push rail passes `false` so a denser requester line stays visible.
   */
  hideRequesterBand,
  /** Carton context for media library “Current carton” tab (unbox / testing). */
  receivingId,
  /** Hide linked-context strip (when already shown by SupportContextHub). */
  hideLinkedContext = false,
  onComposerBridgeChange,
  /**
   * `inline` — sticky composer under the thread (default / console).
   * `host` — station owns the floating {@link SupportTicketComposerDock}; skip
   * inline I/O. Staging comes from {@link photoStaging} or
   * {@link TicketComposerStagingProvider}.
   */
  composerPlacement = 'inline',
  photoStaging,
}: {
  ticketId: number;
  onBack?: () => void;
  /** Hide the in-header Zendesk link when the host already shows one. */
  hideExternalLink?: boolean;
  embedded?: boolean;
  hideRequesterBand?: boolean;
  receivingId?: number;
  hideLinkedContext?: boolean;
  /** Exposes the embedded composer to a station terminal dock. */
  onComposerBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  composerPlacement?: 'inline' | 'host';
  /**
   * Host-owned staging (optional when a {@link TicketComposerStagingProvider}
   * wraps the tree). Inline placement creates its own when neither is set.
   */
  photoStaging?: TicketPhotoStaging;
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
  const { data: contextBundle } = useSupportContext(contextAnchor, showContext);
  const [contextOpen, setContextOpen] = useState(false);
  const contextBadge = contextBadgeFromBundle(contextBundle);
  const linkedOrderPk = contextBundle?.linkage.order?.id ?? null;
  const ordersHref =
    linkedOrderPk != null && linkedOrderPk > 0 ? supportOrdersHref(linkedOrderPk) : null;

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
  const dz = usePhotoDropzone(staging.addFiles);
  const hostOwnsComposer = composerPlacement === 'host';

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
    <div {...dz.rootProps} className="relative flex h-full min-h-0 flex-col bg-surface-canvas/40">
      <SupportChatHeader
        ticket={ticket}
        onBack={onBack}
        hideExternalLink={hideExternalLink}
        compact={embedded}
        hideRequesterBand={hideRequester}
        onOpenContext={showContext ? () => setContextOpen(true) : undefined}
        contextOpen={contextOpen}
        contextBadge={showContext ? contextBadge : null}
        ordersHref={ordersHref}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SupportChatThread
          ticketId={ticketId}
          requesterId={ticket.requester_id}
          requesterName={requesterLabel(ticket)}
          requesterEmail={requester.email}
          onOpenPhoto={onOpenPhoto}
          compact={embedded}
        />
      </div>
      {/* AI suggested reply intentionally omitted for now (station + console). */}
      {hostOwnsComposer ? null : (
        <SupportChatComposer
          ticketId={ticketId}
          requesterEmail={requester.email}
          staging={staging}
          hideSendBar={embedded}
          receivingId={receivingId}
          onBridgeChange={onComposerBridgeChange}
        />
      )}

      {showContext ? (
        <SupportContextDetailPanel
          ticketId={ticketId}
          anchor={contextAnchor}
          open={contextOpen}
          onClose={() => setContextOpen(false)}
          embedded={embedded}
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
              <p className="text-role-caption font-semibold">Drop photo to add to ticket #{ticketId}</p>
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
