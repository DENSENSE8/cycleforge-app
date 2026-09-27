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
import { Camera, Lock, MessageSquare, Send, Video } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketThreadVisibility } from '@/lib/composer/ticket-thread-handoff';
import { TICKET_HANDOFF_MAX_PHOTOS } from '@/lib/composer/ticket-thread-handoff';
import { repairMediaTimeline } from '@/lib/repair/repair-photos';
import { formatMegabytes } from '@/lib/photos/video-upload-rules';
import { Button } from '@/design-system/primitives';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { formatMonthDayTimePST } from '@/utils/date';

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** What the video picker offers — the three containers the upload rules accept. */
const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';

/** Dock verbs: idle (select / video / photo) or, while selecting, the two send targets. */
type PhotoVerb = 'select' | 'video' | 'photo' | TicketThreadVisibility;

/** `/m/rs/[id]/photos` — the repair's evidence photos and videos. */
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
  const cell = 'min-h-mode-hit-cta w-full px-2';

  const sendDisabled = selectedIds.length === 0;
  const dockVerbs: DetailDockVerb<PhotoVerb>[] = selecting
    ? [
        { id: 'internal', label: 'Internal note', icon: <Lock />, disabled: sendDisabled },
        { id: 'public', label: 'Public reply', icon: <Send />, primary: true, disabled: sendDisabled },
      ]
    : [
        ...(canSelect ? [{ id: 'select' as const, label: 'Send to ticket', icon: <MessageSquare /> }] : []),
        { id: 'video', label: 'Add video', icon: <Video />, disabled: !canUpload || videoBusy },
        { id: 'photo', label: 'Take photo', icon: <Camera />, primary: true, disabled: !canUpload },
      ];
  const onDockVerb = (id: PhotoVerb) => {
    switch (id) {
      case 'internal':
      case 'public':
        sendTo(id);
        return;
      case 'select':
        setSelecting(true);
        return;
      case 'video':
        videoInputRef.current?.click();
        return;
      case 'photo':
        setCapturing(true);
        return;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/rs/${repairId}`}
        subtitle="Photos"
        title={rsCode}
        mono
        meta={repair?.product_title || undefined}
      />

      <div className="flex-1 divide-y divide-mode-rule">
        {uploads.uploading > 0 ? (
          <p role="status" className="bg-mode-panel px-mode-page py-3 text-role-caption font-semibold text-mode-ink">
            Uploading {plural(uploads.uploading, 'photo')}…
          </p>
        ) : null}

        {uploads.video?.state === 'uploading' ? (
          <div role="status" className="space-y-1.5 bg-mode-panel px-mode-page py-3">
            <p className="text-role-caption font-semibold text-mode-ink">
              Uploading video · {formatMegabytes(uploads.video.file.size)} ·{' '}
              {Math.round(uploads.video.progress * 100)}%
            </p>
            <div
              className="h-1.5 overflow-hidden bg-mode-rule"
              role="progressbar"
              aria-label="Video upload"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(uploads.video.progress * 100)}
            >
              <div className="h-full bg-fill-info" style={{ width: `${Math.round(uploads.video.progress * 100)}%` }} />
            </div>
          </div>
        ) : null}

        {uploads.video?.state === 'failed' ? (
          <div role="alert" className="space-y-2 bg-rose-50 px-mode-page py-3 text-role-caption text-rose-700">
            <p className="font-semibold">The video didn&apos;t upload — {uploads.video.error}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" radius="flush" className={cell} onClick={uploads.discardVideo}>
                Discard
              </Button>
              <Button variant="primary" size="lg" radius="flush" className={cell} onClick={uploads.retryVideo}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        {uploads.failed.length > 0 ? (
          <div role="alert" className="space-y-2 bg-rose-50 px-mode-page py-3 text-role-caption text-rose-700">
            <p className="font-semibold">
              {plural(uploads.failed.length, 'photo')} didn&apos;t upload — {uploads.failed[0].error}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" radius="flush" className={cell} onClick={uploads.discardFailed}>
                Discard
              </Button>
              <Button variant="primary" size="lg" radius="flush" className={cell} onClick={uploads.retryFailed}>
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

        {selecting ? (
          <p
            className="bg-mode-well px-mode-page py-2 text-role-caption font-semibold text-mode-ink"
            aria-live="polite"
          >
            {selectedIds.length === 0 ? 'Tap photos to send' : `${plural(selectedIds.length, 'photo')} selected`}
          </p>
        ) : null}

        {loading && items.length === 0 ? (
          <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
        ) : error ? (
          <div className="flex items-center justify-between gap-3 bg-rose-50 px-mode-page py-3">
            <p className="text-role-caption text-rose-700">Couldn&apos;t load photos — {error}</p>
            <Button variant="secondary" size="lg" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-mode-page py-10 text-center text-role-caption text-mode-muted">
            No photos or videos on this repair yet.
          </p>
        ) : (
          <>
            <div className="space-y-3 bg-mode-panel px-mode-page py-3">
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
            </div>
            {attachBlocked ? (
              <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
                Send to ticket: {attachBlocked}
              </p>
            ) : null}
          </>
        )}

        {!canUpload ? (
          <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
            Your role cannot add repair photos or videos (needs Intake repair).
          </p>
        ) : null}
      </div>

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

      <DetailDock<PhotoVerb>
        label={selecting ? 'Photo selection actions' : 'Photo actions'}
        selection={selecting ? { count: selectedIds.length, onClear: stopSelecting } : null}
        verbs={dockVerbs}
        onVerb={onDockVerb}
      />
    </div>
  );
}

export default function RepairPhotosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairPhotosInner />
    </Suspense>
  );
}
