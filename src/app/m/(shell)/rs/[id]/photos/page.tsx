'use client';

import { Suspense, useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import {
  MobilePackerSpamCamera,
  type CapturedShot,
  type PriorPhoto,
} from '@/components/mobile/station/MobilePackerSpamCamera';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { RepairPhotoGrid } from '@/components/mobile/repair/RepairPhotoGrid';
import { DetailAck } from '@/components/mobile/detail/DetailParts';
import { useRepairPhotos } from '@/components/mobile/repair/useRepairPhotos';
import { useRepairPhotoUploads } from '@/components/mobile/repair/useRepairPhotoUploads';
import {
  ticketBlockedReason,
  ticketThreadHref,
  useRepairRecord,
  useRepairTicketLink,
} from '@/components/mobile/repair/useRepairWorkbench';
import { Camera, MessageSquare, Video } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketThreadVisibility } from '@/lib/composer/ticket-thread-handoff';
import { TICKET_HANDOFF_MAX_PHOTOS } from '@/lib/composer/ticket-thread-handoff';
import { repairMediaTimeline } from '@/lib/repair/repair-photos';
import { formatMegabytes } from '@/lib/photos/video-upload-rules';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { formatMonthDayTimePST } from '@/utils/date';

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** What the video picker offers — the three containers the upload rules accept. */
const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';

/**
 * `/m/rs/[id]/photos` — the repair's evidence photos and videos. Grid + full-screen
 * viewer (videos play inline); **Take photo** uploads through `/api/photos/upload`
 * (entity `REPAIR_SERVICE`) and refetches; **Add video** records and uploads
 * through the same entity routing (`/api/photos/upload/video`, direct to
 * storage, then finalize); **Select to send** hands the chosen photos
 * to the linked ticket thread staged as a Public reply or Internal note —
 * the thread's composer sends, this screen never does.
 */
function RepairPhotosInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const router = useRouter();
  const { has, isLoaded } = useAuth();
  const { repair } = useRepairRecord(repairId);
  const { photos, videos, loading, error, reload } = useRepairPhotos(repairId);
  const { link, error: linkError } = useRepairTicketLink(repairId);
  const uploads = useRepairPhotoUploads(repairId, reload);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const rsCode = `RS-${repairId}`;
  const canUpload = !isLoaded || has('repair.intake');
  const canReply = !isLoaded || has('integrations.zendesk');

  // Send is live only for an unambiguous link (never the free-typed number)
  // and a staffer the thread would let reply.
  const attachBlocked = linkError
    ? `Could not check the ticket link — ${linkError}`
    : !link
      ? null
      : ticketThreadHref(link) == null
        ? ticketBlockedReason(link)
        : !canReply
          ? 'Your role cannot reply on helpdesk tickets.'
          : null;
  const canSelect = link != null && attachBlocked == null && photos.length > 0;

  const items = useMemo(() => repairMediaTimeline(photos, videos), [photos, videos]);
  const slides = useMemo<SwipePhotoSlide[]>(
    () =>
      items.map((item) =>
        item.kind === 'photo'
          ? { id: `p${item.photo.id}`, previewUrl: item.photo.url }
          : { id: `v${item.video.id}`, previewUrl: item.video.url, kind: 'video' },
      ),
    [items],
  );
  const priorPhotos = useMemo<PriorPhoto[]>(
    () => photos.map((p) => ({ id: String(p.id), previewUrl: p.thumbUrl })),
    [photos],
  );

  const toggle = useCallback((photoId: number) => {
    setSelectedIds((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : prev.length >= TICKET_HANDOFF_MAX_PHOTOS
          ? prev
          : [...prev, photoId],
    );
  }, []);

  const stopSelecting = () => {
    setSelecting(false);
    setSelectedIds([]);
  };

  const sendTo = (visibility: TicketThreadVisibility) => {
    const href = ticketThreadHref(link, { photoIds: selectedIds, visibility });
    if (href) router.push(href);
  };

  const onCaptured = (shots: CapturedShot[]) => {
    setCapturing(false);
    uploads.clearCommitted();
    if (shots.length > 0) uploads.upload(shots);
  };

  const onVideoPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploads.clearCommitted();
    uploads.uploadVideo(file);
  };

  const newest = items.length > 0 ? items[items.length - 1] : null;
  const newestAt = newest ? (newest.kind === 'photo' ? newest.photo.createdAt : newest.video.createdAt) : null;
  const countLine = [
    photos.length > 0 ? plural(photos.length, 'photo') : null,
    videos.length > 0 ? plural(videos.length, 'video') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const videoBusy = uploads.video?.state === 'uploading';
  const cell = 'min-h-mode-hit-cta w-full rounded-mode px-2';

  return (
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/rs/${repairId}`}
        subtitle="Photos"
        title={rsCode}
        mono
        meta={repair?.product_title || undefined}
      />

      <div className="flex-1 space-y-4 px-mode-page py-mode-page">
        {uploads.uploading > 0 ? (
          <p role="status" className="text-role-caption font-semibold text-mode-ink">
            Uploading {plural(uploads.uploading, 'photo')}…
          </p>
        ) : null}

        {uploads.video?.state === 'uploading' ? (
          <div role="status" className="space-y-1.5">
            <p className="text-role-caption font-semibold text-mode-ink">
              Uploading video · {formatMegabytes(uploads.video.file.size)} ·{' '}
              {Math.round(uploads.video.progress * 100)}%
            </p>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-mode-rule"
              role="progressbar"
              aria-label="Video upload"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(uploads.video.progress * 100)}
            >
              <div
                className="h-full rounded-full bg-fill-info transition-[width]"
                style={{ width: `${Math.round(uploads.video.progress * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {uploads.video?.state === 'failed' ? (
          <div
            role="alert"
            className="space-y-2 rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-role-caption text-rose-700"
          >
            <p className="font-semibold">The video didn&apos;t upload — {uploads.video.error}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" className={cell} onClick={uploads.discardVideo}>
                Discard
              </Button>
              <Button variant="primary" size="lg" className={cell} onClick={uploads.retryVideo}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {uploads.failed.length > 0 ? (
          <div
            role="alert"
            className="space-y-2 rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-role-caption text-rose-700"
          >
            <p className="font-semibold">
              {plural(uploads.failed.length, 'photo')} didn&apos;t upload — {uploads.failed[0].error}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" className={cell} onClick={uploads.discardFailed}>
                Discard
              </Button>
              <Button variant="primary" size="lg" className={cell} onClick={uploads.retryFailed}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {uploads.lastCommitted > 0 && uploads.uploading === 0 ? (
          <DetailAck onDismiss={uploads.clearCommitted}>
            Saved {plural(uploads.lastCommitted, 'photo')} to {rsCode}
          </DetailAck>
        ) : null}

        {uploads.videoCommitted ? (
          <DetailAck onDismiss={uploads.clearCommitted}>Saved the video to {rsCode}</DetailAck>
        ) : null}

        {loading && items.length === 0 ? (
          <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
        ) : error ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-role-caption text-rose-600">Couldn&apos;t load photos — {error}</p>
            <Button variant="secondary" size="lg" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-role-caption text-mode-muted">
            No photos or videos on this repair yet.
          </p>
        ) : (
          <>
            <p className="text-role-caption text-mode-muted">
              {countLine}
              {newestAt ? ` · newest ${formatMonthDayTimePST(newestAt)}` : ''}
            </p>
            <RepairPhotoGrid
              items={items}
              selecting={selecting}
              selectedIds={selectedIds}
              onOpen={setViewerIndex}
              onToggle={toggle}
            />
            {attachBlocked ? (
              <p className="text-role-caption text-mode-muted">Send to ticket: {attachBlocked}</p>
            ) : null}
          </>
        )}

        {!canUpload ? (
          <p className="text-role-caption text-mode-muted">
            Your role cannot add repair photos or videos (needs Intake repair).
          </p>
        ) : null}
      </div>

      <nav
        aria-label="Photo actions"
        className="sticky bottom-0 z-sticky border-t border-mode-rule bg-mode-bar px-mode-page pt-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {selecting ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-role-caption font-semibold text-mode-ink" aria-live="polite">
                {selectedIds.length === 0
                  ? 'Tap photos to send'
                  : `${plural(selectedIds.length, 'photo')} selected`}
              </p>
              <Button variant="ghost" size="lg" onClick={stopSelecting}>
                Cancel
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="lg"
                className={cell}
                disabled={selectedIds.length === 0}
                onClick={() => sendTo('internal')}
              >
                Internal note
              </Button>
              <Button
                variant="primary"
                size="lg"
                className={cell}
                disabled={selectedIds.length === 0}
                onClick={() => sendTo('public')}
              >
                Public reply
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {canSelect ? (
              <Button
                variant="secondary"
                size="lg"
                className={cell}
                icon={<MessageSquare />}
                onClick={() => setSelecting(true)}
              >
                Send to ticket
              </Button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="lg"
                className={cell}
                icon={<Video />}
                disabled={!canUpload || videoBusy}
                onClick={() => videoInputRef.current?.click()}
              >
                Add video
              </Button>
              <Button
                variant="primary"
                size="lg"
                className={cell}
                icon={<Camera />}
                disabled={!canUpload}
                onClick={() => setCapturing(true)}
              >
                Take photo
              </Button>
            </div>
          </div>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={onVideoPicked}
          data-testid="repair-video-input"
        />
      </nav>

      <MobileSwipePhotoViewer
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        slides={slides}
        onClose={() => setViewerIndex(null)}
      />

      {capturing ? (
        <MobilePackerSpamCamera
          onDone={onCaptured}
          onCancel={() => setCapturing(false)}
          maxPhotos={10}
          priorPhotos={priorPhotos}
          header={
            <div className="min-w-0">
              <p className="text-role-micro uppercase tracking-[0.22em] text-white/60">Repair photos</p>
              <p className="truncate text-sm font-semibold text-white">
                {rsCode}
                {repair?.product_title ? ` · ${repair.product_title}` : ''}
              </p>
            </div>
          }
        />
      ) : null}
    </ModeRegion>
  );
}

export default function RepairPhotosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairPhotosInner />
    </Suspense>
  );
}
