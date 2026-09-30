'use client';

/**
 * The Overview's featured media (owner 2026-09-30: "The media, if linked,
 * should appear as a more prominent feature, like above the status in the
 * overview page"). A task with a video leads with its first lesson — the
 * Media tab's ONE player (`TaskLessonPlayer`), full width, then its title and
 * provider line; photos only → a compact thumb strip opening the house
 * viewer. `All media (n) →` steps to the Media tab. The caller mounts this
 * only when the row's counts say media exists, so an empty task never fetches.
 */

import { useMemo } from 'react';
import Image from 'next/image';
import { ArrowRight, Images } from 'lucide-react';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { MEDIA_GLYPH_INK, MEDIA_WORD_INK } from '@/features/tasks/workspace/TaskMediaLinks';
import { TaskLessonPlayer } from '@/features/tasks/workspace/TaskMediaSection';
import { taskLessons, taskStills, useLessonPlayer } from '@/lib/tasks/task-media-lessons';
import { useTaskMedia } from '@/lib/tasks/use-task-workspace';
import { cn } from '@/utils/_cn';

/** Thumbs the strip shows before the rest collapse into `+N`. */
const STRIP_MAX = 6;

export function TaskOverviewMedia({
  taskId,
  expectVideo,
  onOpenMedia,
}: {
  taskId: number;
  /** The row counts a video — the skeleton holds the player's 16:9, not a thumb strip's height. */
  expectVideo: boolean;
  onOpenMedia: () => void;
}) {
  const media = useTaskMedia(taskId);
  const lessons = useMemo(() => taskLessons(media.videos, media.links), [media.videos, media.links]);
  const stills = useMemo(() => taskStills(media.photos, media.links), [media.photos, media.links]);
  const player = useLessonPlayer(lessons, !media.loading);
  const gallery = usePhotoGallery({
    photos: stills.map((still) => ({ id: still.photo?.id, url: still.url, thumbUrl: still.thumbUrl })),
  });
  const total = lessons.length + stills.length;
  if (media.loading) {
    return <div className={cn('mb-3 w-full animate-pulse rounded-xl bg-surface-sunken', expectVideo ? 'aspect-video' : 'h-12')} />;
  }
  if (total === 0) return null;

  const allMedia = (
    <button
      type="button"
      onClick={onOpenMedia}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-[11px] font-semibold hover:bg-surface-hover',
        MEDIA_WORD_INK,
        focusRing('control'),
      )}
      data-testid="task-overview-all-media"
    >
      All media ({total})
      <ArrowRight aria-hidden className="size-3" />
    </button>
  );

  return (
    <section aria-label="Featured media" className="mb-3 flex flex-col gap-2" data-testid="task-overview-media">
      {player.current ? (
        <>
          <TaskLessonPlayer lesson={player.current} autoplay={player.autoplay} />
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold text-text-default">{player.current.title}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-text-muted">
                <span className={cn('shrink-0 font-semibold', MEDIA_WORD_INK)}>{player.current.provider}</span>
                {player.current.addedBy ? <span className="truncate">· added by {player.current.addedBy.name.split(' ')[0]}</span> : null}
                {lessons.length > 1 ? <span className="shrink-0">· 1 of {lessons.length} videos</span> : null}
              </span>
            </div>
            {allMedia}
          </div>
        </>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <Images aria-hidden className={cn('size-3.5 shrink-0', MEDIA_GLYPH_INK)} />
          <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {stills.slice(0, STRIP_MAX).map((still, index) => (
              <li key={still.key} className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-border-hairline">
                <button
                  type="button"
                  aria-label={`Open photo ${index + 1} of ${stills.length}`}
                  onClick={() => gallery.openViewer(index)}
                  className={cn('absolute inset-0 cursor-zoom-in', focusRing('control'))}
                >
                  <Image src={still.thumbUrl} alt="" fill unoptimized sizes="48px" className="object-cover" />
                </button>
              </li>
            ))}
            {stills.length > STRIP_MAX ? (
              <li className="shrink-0 text-[11px] font-semibold tabular-nums text-text-muted">+{stills.length - STRIP_MAX}</li>
            ) : null}
          </ul>
          {allMedia}
        </div>
      )}
      <PhotoViewerPortal g={gallery} />
    </section>
  );
}
