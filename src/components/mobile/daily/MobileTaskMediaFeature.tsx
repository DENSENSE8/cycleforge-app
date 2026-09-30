'use client';

/**
 * The task sheet's media, FIRST (owner 2026-09-30: task media sits at the top
 * of a task). A walkthrough → the ONE lesson player, its title and provider;
 * photos only → a thumb strip into the swipe viewer. Either way a door to the
 * full Media section below. The player is the sheet's only one: the Media
 * section's lesson rows drive it (`useLessonPlayer`, lifted to the sheet).
 */

import { useMemo, useState, type Ref } from 'react';
import { ChevronRight } from 'lucide-react';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { Button } from '@/design-system/primitives';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { autoplaySrc, type TaskLesson, type TaskLessonPlayer, type TaskStill } from '@/lib/tasks/task-media-lessons';
import { cn } from '@/utils/_cn';

export function MobileTaskMediaFeature({
  lessons,
  stills,
  player,
  playerRef,
  onShowAll,
}: {
  lessons: readonly TaskLesson[];
  stills: readonly TaskStill[];
  /** The sheet's one player — `useLessonPlayer(lessons, ready)`. */
  player: TaskLessonPlayer;
  /** On the player, so a lesson row's tap can scroll it into view. */
  playerRef: Ref<HTMLDivElement>;
  /** Scroll to the full Media section. */
  onShowAll: () => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const slides = useMemo<SwipePhotoSlide[]>(
    () => stills.map((still) => ({ id: still.key, previewUrl: still.url, kind: 'photo' })),
    [stills],
  );
  const lesson = player.current;
  if (!lesson && stills.length === 0) return null;

  const showAll = (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 shrink-0"
      iconRight={<ChevronRight aria-hidden className="size-4" />}
      onClick={onShowAll}
      data-testid="mobile-task-media-all"
    >
      All media ({lessons.length + stills.length})
    </Button>
  );

  return (
    <section aria-label="Featured media" className="flex flex-col gap-2 pt-3" data-testid="mobile-task-media-feature">
      {lesson ? (
        <>
          <div
            ref={playerRef}
            className={cn('scroll-mt-2 overflow-hidden bg-black ring-1 ring-border-hairline', MOBILE_ROW_CORNER)}
            data-testid="task-media-player"
          >
            {lesson.player.kind === 'iframe' ? (
              <iframe
                key={lesson.key}
                src={player.autoplay ? autoplaySrc(lesson.player.src) : lesson.player.src}
                title={lesson.title}
                className="block aspect-video w-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <video
                key={lesson.key}
                src={player.autoplay ? lesson.player.src : `${lesson.player.src}#t=0.1`}
                controls
                playsInline
                autoPlay={player.autoplay}
                preload="metadata"
                aria-label={lesson.title}
                className="block aspect-video w-full bg-black"
              />
            )}
          </div>
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-role-data font-semibold text-text-default">{lesson.title}</p>
              <p className="truncate text-role-micro text-text-muted">
                {lesson.provider}
                {lesson.size ? ` · ${lesson.size}` : ''}
              </p>
            </div>
            {showAll}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <ul className="-my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1">
            {stills.map((still, index) => (
              <li key={still.key} className="shrink-0">
                {/* ds-raw-button: square image tile, not a text/action button */}
                <button
                  type="button"
                  onClick={() => setViewerIndex(index)}
                  aria-label={`Open photo ${index + 1} of ${stills.length}`}
                  className={cn('block size-14 overflow-hidden border border-border-hairline bg-surface-sunken active:opacity-90', MOBILE_ROW_CORNER)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={still.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
          {showAll}
        </div>
      )}

      <MobileSwipePhotoViewer
        slides={slides}
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </section>
  );
}
