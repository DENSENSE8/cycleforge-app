'use client';

/**
 * The task sheet's **Media** — the phone twin of the desk rail's Media tab
 * (owner 2026-09-29: staff learn a skill from the walkthrough attached to the
 * task). The record shows the media only: videos as two-line rows (tap = play;
 * the playing row shows its verbs), photos as a thumb strip that opens the
 * swipe viewer. Adding is a ⋯ menu verb (owner 2026-10-03): "Add Video Link…"
 * opens `MobileMediaAddBar` in a sheet. The ONE player is not here: it leads
 * the sheet (`MobileTaskMediaFeature`), and these rows drive it. The shared
 * shape lives in `@/lib/tasks/task-media-lessons`.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Link2, Pencil, Play, Trash2, Upload, Video, X } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import {
  MEDIA_LINK_PROVIDER_NOUN,
  MEDIA_LINK_REFUSAL_COPY,
  MEDIA_LINK_TITLE_MAX,
  parseMediaLink,
  type TaskMediaLinkCreateBody,
} from '@/lib/tasks/media-links';
import { TASK_MEDIA_ACCEPTS_COPY, type TaskLesson, type TaskStill } from '@/lib/tasks/task-media-lessons';
import type { TaskMediaUploadState } from '@/lib/tasks/use-task-workspace';
import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';

/** Media's hue — the desk rail's, AA at micro size in both themes. */
const GLYPH_INK = 'text-fuchsia-600 dark:text-fuchsia-400';
const WORD_INK = 'text-fuchsia-700 dark:text-fuchsia-300';

export function MobileTaskMedia({
  lessons,
  stills,
  playingKey,
  loading,
  onPlay,
  onRenameLink,
  onRemoveLink,
  onRemoveVideo,
}: {
  /** `taskLessons(videos, links)` — computed once by the sheet, which owns the player. */
  lessons: readonly TaskLesson[];
  /** `taskStills(photos, links)`. */
  stills: readonly TaskStill[];
  /** The lesson the sheet's player shows; its row reads Playing. */
  playingKey: string | null;
  loading: boolean;
  /** Play a lesson in the sheet's player (and bring it into view). */
  onPlay: (lessonKey: string) => void;
  onRenameLink: (linkId: number, title: string | null) => Promise<unknown>;
  onRemoveLink: (linkId: number) => void;
  onRemoveVideo: (videoId: number) => void;
}) {
  const slides = useMemo<SwipePhotoSlide[]>(
    () => stills.map((still) => ({ id: still.key, previewUrl: still.url, kind: 'photo' })),
    [stills],
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3" data-testid="mobile-task-media">
      {loading ? <div className={cn('h-14 w-full animate-pulse bg-surface-sunken', MOBILE_ROW_CORNER)} /> : null}

      {lessons.length > 0 ? (
        <section aria-label="Videos" className="flex flex-col gap-1.5">
          <ul className="flex flex-col gap-1.5">
            {lessons.map((lesson) => {
              const { link, video } = lesson;
              return (
                <MobileLessonRow
                  key={lesson.key}
                  lesson={lesson}
                  playing={playingKey === lesson.key}
                  onPlay={() => onPlay(lesson.key)}
                  onRename={link ? (title) => onRenameLink(link.id, title) : null}
                  onRemove={() => {
                    if (!window.confirm(`Delete “${lesson.title}” from this task?`)) return;
                    if (link) onRemoveLink(link.id);
                    else if (video) onRemoveVideo(video.id);
                  }}
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {stills.length > 0 ? (
        <section aria-label="Photos" className="flex flex-col gap-1.5">
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {stills.map((still, index) => (
              <li key={still.key} className="shrink-0">
                {/* ds-raw-button: square image tile, not a text/action button */}
                <button
                  type="button"
                  onClick={() => setViewerIndex(index)}
                  aria-label={`Open photo ${index + 1} of ${stills.length}`}
                  className={cn('block size-20 overflow-hidden border border-border-hairline bg-surface-sunken active:opacity-90', MOBILE_ROW_CORNER)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={still.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MobileSwipePhotoViewer
        slides={slides}
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}

/** Paste a video link or upload from the camera roll — the "Add Video Link…" sheet's body. */
export function MobileMediaAddBar({
  onAdd,
  onPick,
  uploading,
  problems,
  onDismissProblems,
}: {
  onAdd: (body: TaskMediaLinkCreateBody) => Promise<unknown>;
  onPick: () => void;
  uploading: TaskMediaUploadState | null;
  problems: readonly string[];
  onDismissProblems: () => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = url.trim() ? parseMediaLink(url) : null;

  const submit = async () => {
    if (!parsed?.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd({ url: url.trim() });
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that link.');
    } finally {
      setBusy(false);
    }
  };

  const caption = error
    ? { text: error, bad: true }
    : parsed
      ? parsed.ok
        ? { text: `${MEDIA_LINK_PROVIDER_NOUN[parsed.link.provider]} ${parsed.link.kind} — tap Add`, bad: false }
        : { text: MEDIA_LINK_REFUSAL_COPY[parsed.reason] ?? 'Not a media link.', bad: true }
      : { text: TASK_MEDIA_ACCEPTS_COPY, bad: false };
  const pct = uploading?.fraction != null ? Math.round(uploading.fraction * 100) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {/* The desk's pill field, touch-sized — the house TextField's resting label reads below 4.5:1. */}
        <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-sunken px-3.5 ring-1 ring-transparent focus-within:ring-border-soft">
          <Link2 aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            placeholder="Paste a YouTube or Loom link"
            aria-label="Video or photo link"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 bg-transparent text-role-data text-text-default outline-none placeholder:text-text-muted"
            data-testid="task-media-link-input"
          />
        </label>
        {parsed?.ok ? (
          <Button type="submit" variant="primary" size="lg" radius="pill" className="min-h-12 shrink-0" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            radius="pill"
            className="min-h-12 shrink-0"
            icon={<Upload aria-hidden className="h-5 w-5" />}
            disabled={uploading != null}
            onClick={onPick}
          >
            Upload
          </Button>
        )}
      </form>
      <p role="status" className={cn('text-role-micro', caption.bad ? 'text-text-danger' : 'text-text-muted')}>
        {caption.text}
      </p>

      {problems.length > 0 ? (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-2 bg-red-50 py-2 pl-3 pr-1 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30',
            MOBILE_ROW_CORNER,
          )}
          data-testid="task-media-problems"
        >
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="min-w-0 flex-1 text-role-caption font-medium">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <IconButton
            size="touch"
            radius="pill"
            ariaLabel="Dismiss"
            onClick={onDismissProblems}
            icon={<X aria-hidden className="h-4 w-4" />}
            className="-my-2 text-red-800 dark:text-red-200"
          />
        </div>
      ) : null}

      {uploading ? (
        <div role="status" aria-live="polite" className={cn('flex flex-col gap-1.5 bg-surface-sunken px-3 py-2', MOBILE_ROW_CORNER)}>
          <span className="flex min-w-0 items-center gap-2 text-role-micro">
            <span className="min-w-0 truncate font-semibold text-text-default">Uploading {uploading.name}</span>
            <span className="ml-auto shrink-0 tabular-nums text-text-muted">
              {pct != null ? `${pct}%` : 'Sending…'}
              {uploading.total > 1 ? ` · ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}` : ''}
            </span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-card" aria-hidden>
            <span
              className={cn('block h-full rounded-full bg-fuchsia-600 transition-[width] duration-200 dark:bg-fuchsia-400', pct == null && 'animate-pulse')}
              style={{ width: `${pct ?? 100}%` }}
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** One lesson as a two-line row; the playing row shows its verbs (a phone has no hover). */
function MobileLessonRow({
  lesson,
  playing,
  onPlay,
  onRename,
  onRemove,
}: {
  lesson: TaskLesson;
  playing: boolean;
  onPlay: () => void;
  onRename: ((title: string | null) => Promise<unknown>) | null;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Glyph = playing ? Play : Video;

  const save = async () => {
    if (!onRename || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onRename(draft.trim() || null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename it.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className={cn('border border-border-soft bg-surface-card p-3', MOBILE_ROW_CORNER)}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextField label="Lesson name" value={draft} onChange={setDraft} maxLength={MEDIA_LINK_TITLE_MAX} autoFocus />
          {error ? (
            <p role="alert" className="text-role-micro text-text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" className="min-h-12 flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="lg" className="min-h-12 flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'flex items-center border bg-surface-card',
        playing ? 'border-border-soft bg-surface-selected' : 'border-border-hairline',
        MOBILE_ROW_CORNER,
      )}
      data-testid="task-media-lesson"
      data-lesson={lesson.key}
    >
      {/* ds-raw-button: the whole two-line row is the play target */}
      <button
        type="button"
        onClick={onPlay}
        aria-current={playing ? 'true' : undefined}
        aria-label={`${playing ? 'Playing' : 'Play'} ${lesson.title}`}
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pl-3 pr-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Glyph aria-hidden className={cn('h-4 w-4 shrink-0', GLYPH_INK)} />
          <span className="truncate text-role-data font-medium text-text-default" data-testid="task-media-lesson-title">
            {lesson.title}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-role-micro">
          <span className={cn('shrink-0 font-semibold', WORD_INK)}>{lesson.provider}</span>
          {lesson.addedBy ? (
            <span className="flex min-w-0 items-center gap-1 text-text-muted">
              <StaffAvatar staffId={lesson.addedBy.id} name={lesson.addedBy.name} size="xs" />
              <StaffBadge staffId={lesson.addedBy.id} name={lesson.addedBy.name.split(' ')[0]} className="truncate font-semibold" />
            </span>
          ) : null}
          <span className="shrink-0 text-text-muted">{timeAgo(lesson.createdAt)}</span>
          {lesson.size ? (
            <span className="shrink-0 tabular-nums text-text-muted">{lesson.size}</span>
          ) : null}
        </span>
      </button>
      {playing ? (
        <span className="flex shrink-0 items-center">
          {onRename ? (
            <IconButton
              size="touch"
              radius="pill"
              ariaLabel={`Rename ${lesson.title}`}
              onClick={() => {
                setDraft(lesson.editableTitle ?? '');
                setError(null);
                setEditing(true);
              }}
              icon={<Pencil aria-hidden className="h-5 w-5" />}
            />
          ) : null}
          <a
            href={lesson.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${lesson.title} in a new tab`}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-text-soft"
          >
            <ExternalLink aria-hidden className="h-5 w-5" />
          </a>
          <IconButton
            size="touch"
            radius="pill"
            ariaLabel={`Delete ${lesson.title}`}
            onClick={onRemove}
            icon={<Trash2 aria-hidden className="h-5 w-5" />}
          />
        </span>
      ) : null}
    </li>
  );
}
