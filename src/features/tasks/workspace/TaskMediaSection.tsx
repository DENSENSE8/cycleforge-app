'use client';

/** Task evidence — **Photos** and **Videos**: */

import Image from 'next/image';
import { Images, Trash2 } from '@/components/Icons';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { EvidenceSection, evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { TaskMediaPhoto, TaskMediaVideo } from '@/lib/tasks/task-links-shared';
import type { TaskMediaLink, TaskMediaLinkCreateBody, TaskMediaLinkPatchBody } from '@/lib/tasks/media-links';
import { cn } from '@/utils/_cn';
import type { TaskMediaUploadState } from '@/lib/tasks/use-task-workspace';
import { MediaLinkComposer, MediaLinkItem } from './TaskMediaLinks';

function sizeFace(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function uploadFace(state: TaskMediaUploadState): string {
  const pct = state.fraction != null ? ` · ${Math.round(state.fraction * 100)}%` : '';
  return `Uploading ${Math.min(state.done + 1, state.total)}/${state.total}${pct}`;
}

const DELETE_CLASS = cn(
  'ds-raw-button absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-mode bg-mode-panel text-mode-ink opacity-0 group-hover/media:opacity-100 focus-visible:opacity-100',
  focusRing('control'),
);

export function TaskMediaSection({
  photos,
  videos,
  links,
  loading,
  uploading,
  onPick,
  onDeletePhoto,
  onDeleteVideo,
  onAddLink,
  onUpdateLink,
  onRemoveLink,
}: {
  photos: readonly TaskMediaPhoto[];
  videos: readonly TaskMediaVideo[];
  loading: boolean;
  uploading: TaskMediaUploadState | null;
  /** Open the shared file picker (the column owns the input). */
  onPick: () => void;
  onDeletePhoto: (photo: TaskMediaPhoto) => void;
  onDeleteVideo: (video: TaskMediaVideo) => void;
  /** Photos / videos attached by URL — full CRUD. */
  links: readonly TaskMediaLink[];
  onAddLink: (body: TaskMediaLinkCreateBody) => Promise<unknown>;
  onUpdateLink: (id: number, patch: TaskMediaLinkPatchBody) => Promise<unknown>;
  onRemoveLink: (link: TaskMediaLink) => void;
}) {
  const linkPhotos = links.filter((link) => link.kind === 'photo');
  // Uploaded photos first, then linked ones — one viewer steps through both.
  const gallery = usePhotoGallery({
    photos: [
      ...photos.map((photo) => ({ id: photo.id, url: photo.url, thumbUrl: photo.thumbUrl })),
      ...linkPhotos.map((link) => ({ url: link.embedUrl, thumbUrl: link.thumbnailUrl ?? link.embedUrl })),
    ],
  });
  const photoCount = photos.length + linkPhotos.length;
  const videoCount = videos.length + links.length - linkPhotos.length;
  const empty = !loading && photoCount === 0 && videoCount === 0;

  return (
    <EvidenceSection
      label="Media"
      testId="task-media"
      collapsible
      lazy
      tone={empty ? 'neutral' : 'info'}
      icon={<Images />}
      summary={
        loading
          ? 'Loading attachments…'
          : empty
            ? 'No photos or videos'
            : `${photoCount} photo${photoCount === 1 ? '' : 's'} · ${videoCount} video${videoCount === 1 ? '' : 's'}`
      }
      action={
        <button
          type="button"
          className={cn(evidenceVerbClass(false), 'min-h-0 py-1')}
          disabled={uploading !== null}
          onClick={onPick}
          data-testid="task-media-add"
        >
          {uploading ? uploadFace(uploading) : 'Add photos / videos'}
        </button>
      }
    >
      <div className="mb-3">
        <MediaLinkComposer onAdd={onAddLink} />
      </div>
      {empty ? (
        <button
          type="button"
          onClick={onPick}
          className={cn(
            'flex aspect-[16/7] w-full flex-col items-center justify-center gap-1 rounded-mode border border-dashed border-mode-control bg-mode-well',
            focusRing('control'),
          )}
        >
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-ink')}>Drop, paste or pick</span>
          <span className="text-role-data text-mode-muted">Photos and videos of what needs doing.</span>
        </button>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Photos">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="group/media relative aspect-square overflow-hidden rounded-mode border border-mode-rule bg-mode-well"
            >
              <button
                type="button"
                aria-label={`Open photo ${index + 1} of ${photos.length}`}
                onClick={() => gallery.openViewer(index)}
                className={cn('absolute inset-0 cursor-zoom-in', focusRing('control'))}
              >
                <Image src={photo.thumbUrl} alt="" fill unoptimized sizes="8vw" className="object-cover" />
              </button>
              <button
                type="button"
                aria-label={`Delete photo ${index + 1}`}
                onClick={() => onDeletePhoto(photo)}
                className={DELETE_CLASS}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {videos.length > 0 ? (
        <ul className={cn('flex flex-col gap-2', photos.length > 0 && 'mt-2')} aria-label="Videos">
          {videos.map((video, index) => (
            <li key={video.id} className="group/media relative overflow-hidden rounded-mode border border-mode-rule bg-mode-ink">
              {/* `#t=0.1` paints a first frame instead of black; metadata only until play. */}
              <video
                src={`${video.url}#t=0.1`}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full"
                aria-label={`Video ${index + 1} of ${videos.length}`}
              />
              <span
                className={cn(RECORD_LABEL_CLASS, 'pointer-events-none absolute left-1 top-1 bg-mode-panel px-1 text-mode-ink')}
              >
                {sizeFace(video.sizeBytes)}
              </span>
              <button
                type="button"
                aria-label={`Delete video ${index + 1}`}
                onClick={() => onDeleteVideo(video)}
                className={DELETE_CLASS}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2" aria-label="Linked media">
          {links.map((link) => (
            <MediaLinkItem
              key={link.id}
              link={link}
              onUpdate={(patch) => onUpdateLink(link.id, patch)}
              onRemove={() => onRemoveLink(link)}
              onOpenPhoto={
                link.kind === 'photo' ? () => gallery.openViewer(photos.length + linkPhotos.indexOf(link)) : undefined
              }
            />
          ))}
        </ul>
      ) : null}
      <PhotoViewerPortal g={gallery} />
    </EvidenceSection>
  );
}
