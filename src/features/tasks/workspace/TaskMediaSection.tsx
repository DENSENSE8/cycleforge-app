'use client';

/**
 * A task's **Media** — how the owner teaches a skill (owner 2026-09-29):
 * attach an unlisted YouTube walkthrough or a recording, and staff watch it
 * on the task. Top to bottom: the add bar, ONE player, the videos as board
 * rows (select one to play it), then photos as a thumb strip that opens the
 * house viewer. Drawn in the Tasks board's voice — no evidence-card chrome.
 * The surface that mounts it owns the file input, drag-drop and paste.
 */

import { useMemo } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { autoplaySrc, taskLessons, taskStills, useLessonPlayer, type TaskLesson } from '@/lib/tasks/task-media-lessons';
import type { TaskMediaPhoto, TaskMediaVideo } from '@/lib/tasks/task-links-shared';
import type { TaskMediaLink, TaskMediaLinkCreateBody } from '@/lib/tasks/media-links';
import type { TaskMediaUploadState } from '@/lib/tasks/use-task-workspace';
import { cn } from '@/utils/_cn';
import { MediaAddBar, MediaLessonRow } from './TaskMediaLinks';

const LABEL = 'text-[11px] font-medium text-text-muted';

export function TaskMediaSection({
  photos,
  videos,
  links,
  loading,
  uploading,
  problems,
  onDismissProblems,
  onPick,
  onAddLink,
  onRenameLink,
  onRemoveLink,
  onRemoveVideo,
  onRemovePhoto,
}: {
  photos: readonly TaskMediaPhoto[];
  videos: readonly TaskMediaVideo[];
  links: readonly TaskMediaLink[];
  loading: boolean;
  uploading: TaskMediaUploadState | null;
  /** Refused / failed files from the last upload, in operator words. */
  problems: readonly string[];
  onDismissProblems: () => void;
  /** Open the surface's file picker. */
  onPick: () => void;
  onAddLink: (body: TaskMediaLinkCreateBody) => Promise<unknown>;
  onRenameLink: (linkId: number, title: string | null) => Promise<unknown>;
  onRemoveLink: (linkId: number) => void;
  onRemoveVideo: (videoId: number) => void;
  onRemovePhoto: (photo: TaskMediaPhoto) => void;
}) {
  const lessons = useMemo(() => taskLessons(videos, links), [videos, links]);
  const stills = useMemo(() => taskStills(photos, links), [photos, links]);
  const player = useLessonPlayer(lessons, !loading);
  const gallery = usePhotoGallery({
    photos: stills.map((still) => ({ id: still.photo?.id, url: still.url, thumbUrl: still.thumbUrl })),
  });

  const remove = (lesson: TaskLesson) => {
    if (!window.confirm(`Delete “${lesson.title}” from this task?${lesson.video ? ' The recording cannot be recovered.' : ''}`)) return;
    if (lesson.link) onRemoveLink(lesson.link.id);
    else if (lesson.video) onRemoveVideo(lesson.video.id);
  };

  return (
    // Full width of whatever holds it (owner 2026-09-30: the Media tab fills the record); a caller that wants a reading column caps it.
    <div className="flex w-full min-w-0 flex-col gap-4" data-testid="task-media">
      <MediaAddBar
        onAdd={onAddLink}
        onPick={onPick}
        uploading={uploading}
        problems={problems}
        onDismissProblems={onDismissProblems}
      />

      {loading ? (
        <div className="aspect-video w-full animate-pulse rounded-xl bg-surface-sunken" />
      ) : lessons.length === 0 && stills.length === 0 ? (
        <p className="py-2 text-[13px] text-text-muted" data-testid="task-media-empty">
          Attach a walkthrough: paste an unlisted YouTube link or upload a recording.
        </p>
      ) : null}

      {player.current ? <TaskLessonPlayer lesson={player.current} autoplay={player.autoplay} /> : null}

      {lessons.length > 0 ? (
        <section aria-label="Videos" className="flex flex-col gap-1">
          <span className={LABEL}>
            Videos <span className="tabular-nums">· {lessons.length}</span>
          </span>
          <ul className="-mx-2 flex flex-col gap-0.5">
            {lessons.map((lesson) => {
              const { link } = lesson;
              return (
                <MediaLessonRow
                  key={lesson.key}
                  lesson={lesson}
                  playing={player.current?.key === lesson.key}
                  onPlay={() => player.play(lesson.key)}
                  onRename={link ? (title) => onRenameLink(link.id, title) : null}
                  onRemove={() => remove(lesson)}
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {stills.length > 0 ? (
        <section aria-label="Photos" className="flex flex-col gap-1.5">
          <span className={LABEL}>
            Photos <span className="tabular-nums">· {stills.length}</span>
          </span>
          <ul className="flex flex-wrap gap-2">
            {stills.map((still, index) => (
              <li key={still.key} className="group/still relative size-16 overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-border-hairline">
                <button
                  type="button"
                  aria-label={`Open photo ${index + 1} of ${stills.length}`}
                  onClick={() => gallery.openViewer(index)}
                  className={cn('absolute inset-0 cursor-zoom-in', focusRing('control'))}
                >
                  <Image src={still.thumbUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete photo ${index + 1}`}
                  onClick={() => {
                    if (!window.confirm('Delete this photo from the task?')) return;
                    if (still.photo) onRemovePhoto(still.photo);
                    else if (still.link) onRemoveLink(still.link.id);
                  }}
                  className={cn(
                    'absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full bg-surface-card text-text-default shadow-sm opacity-0 group-hover/still:opacity-100 focus-visible:opacity-100',
                    focusRing('control'),
                  )}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PhotoViewerPortal g={gallery} />
    </div>
  );
}

/** The ONE player a lesson plays in — the Media tab's, and the Overview's featured lesson. */
export function TaskLessonPlayer({ lesson, autoplay }: { lesson: TaskLesson; autoplay: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl bg-black ring-1 ring-border-hairline" data-testid="task-media-player">
      {lesson.player.kind === 'iframe' ? (
        <iframe
          key={lesson.key}
          src={autoplay ? autoplaySrc(lesson.player.src) : lesson.player.src}
          title={lesson.title}
          className="block aspect-video w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        // `#t=0.1` paints a first frame instead of black until play.
        <video
          key={lesson.key}
          src={autoplay ? lesson.player.src : `${lesson.player.src}#t=0.1`}
          controls
          playsInline
          autoPlay={autoplay}
          preload="metadata"
          aria-label={lesson.title}
          className="block aspect-video w-full bg-black"
        />
      )}
    </div>
  );
}
