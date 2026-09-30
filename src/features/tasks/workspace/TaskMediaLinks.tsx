'use client';

/**
 * The Media tab's two moving parts, in the Tasks board's voice:
 *
 * - `MediaAddBar` — ONE way in: paste a link (YouTube unlisted / Vimeo / Loom
 *   / Drive / image) or Upload a recording / photo, the accepted formats and
 *   the ceiling in quiet line-2 ink, a refused file named in red, and the
 *   upload in flight with its own progress.
 * - `MediaLessonRow` — one video as a board row: line 1 glyph + lesson name,
 *   line 2 provider · who added it · when · size; hover-right verbs.
 */

import { useState } from 'react';
import { ExternalLink, Link2, Pencil, Play, Trash2, TriangleAlert, Upload, Video, X } from 'lucide-react';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { PeopleInline } from '@/features/task-board/task-board-atoms';
import {
  MEDIA_LINK_PROVIDER_NOUN,
  MEDIA_LINK_REFUSAL_COPY,
  MEDIA_LINK_TITLE_MAX,
  parseMediaLink,
  type TaskMediaLinkCreateBody,
} from '@/lib/tasks/media-links';
import { TASK_MEDIA_ACCEPTS_COPY, type TaskLesson } from '@/lib/tasks/task-media-lessons';
import type { TaskMediaUploadState } from '@/lib/tasks/use-task-workspace';
import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';

/** Media's own hue — distinct from the board's triage colours (orange ticket, red late, emerald done). AA at 11px in both themes. */
export const MEDIA_GLYPH_INK = 'text-fuchsia-600 dark:text-fuchsia-400';
export const MEDIA_WORD_INK = 'text-fuchsia-700 dark:text-fuchsia-300';

const LINE_2 = 'text-[11px] leading-4';
const HOVER_VERB = 'opacity-0 focus-visible:opacity-100 group-hover/lesson:opacity-100 group-focus-within/lesson:opacity-100';

export function MediaAddBar({
  onAdd,
  onPick,
  uploading,
  problems,
  onDismissProblems,
}: {
  onAdd: (body: TaskMediaLinkCreateBody) => Promise<unknown>;
  /** Open the surface's file picker (the surface owns the input). */
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

  // Line 2 answers the field: what it accepts, what the paste will become, or why it will not.
  const caption = error
    ? { text: error, bad: true }
    : parsed
      ? parsed.ok
        ? { text: `${MEDIA_LINK_PROVIDER_NOUN[parsed.link.provider]} ${parsed.link.kind} — press Enter to add`, bad: false }
        : { text: MEDIA_LINK_REFUSAL_COPY[parsed.reason] ?? 'Not a media link.', bad: true }
      : { text: TASK_MEDIA_ACCEPTS_COPY, bad: false };

  return (
    <div className="flex flex-col gap-1.5" data-testid="task-media-add-bar">
      <div className="flex items-center gap-1.5">
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-sunken py-1 pl-3.5 pr-1 ring-1 ring-transparent transition-shadow focus-within:ring-border-soft"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Link2 aria-hidden className="size-3.5 shrink-0 text-text-muted" />
          <input
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            placeholder="Paste a YouTube, Vimeo, Loom or Drive link"
            aria-label="Video or photo link"
            aria-describedby="task-media-add-caption"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-text-default outline-none placeholder:text-text-muted"
            data-testid="task-media-link-input"
          />
          {parsed?.ok ? (
            <Button type="submit" size="sm" variant="primary" radius="pill" className="h-7 px-3 text-[11px]" disabled={busy}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          ) : null}
        </form>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          radius="pill"
          className="h-9 shrink-0 px-3.5"
          icon={<Upload aria-hidden />}
          disabled={uploading != null}
          onClick={onPick}
          data-testid="task-media-add"
        >
          Upload
        </Button>
      </div>
      <p
        id="task-media-add-caption"
        role="status"
        className={cn('px-3.5', LINE_2, caption.bad ? 'text-red-700 dark:text-red-300' : 'text-text-muted')}
      >
        {caption.text}
      </p>

      {problems.length > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 py-1.5 pl-3 pr-1 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30"
          data-testid="task-media-problems"
        >
          <TriangleAlert aria-hidden className="mt-1 size-3.5 shrink-0" />
          <ul className={cn('min-w-0 flex-1 py-0.5 font-medium', LINE_2)}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <IconButton
            size="xs"
            radius="pill"
            ariaLabel="Dismiss"
            onClick={onDismissProblems}
            icon={<X aria-hidden className="size-3.5" />}
            className="text-red-800 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-500/20"
          />
        </div>
      ) : null}

      {uploading ? <UploadProgress state={uploading} /> : null}
    </div>
  );
}

/** The file in flight: its name, its percent, its place in the batch, and a bar. */
function UploadProgress({ state }: { state: TaskMediaUploadState }) {
  const pct = state.fraction != null ? Math.round(state.fraction * 100) : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-1.5 rounded-xl bg-surface-sunken px-3 py-2"
      data-testid="task-media-uploading"
    >
      <span className={cn('flex min-w-0 items-center gap-2', LINE_2)}>
        <Upload aria-hidden className={cn('size-3.5 shrink-0', MEDIA_GLYPH_INK)} />
        <span className="min-w-0 truncate font-medium text-text-default">Uploading {state.name}</span>
        <span className="ml-auto shrink-0 tabular-nums text-text-muted">
          {pct != null ? `${pct}%` : 'Sending…'}
          {state.total > 1 ? ` · ${Math.min(state.done + 1, state.total)} of ${state.total}` : ''}
        </span>
      </span>
      <span className="block h-1 overflow-hidden rounded-full bg-surface-card" aria-hidden>
        <span
          className={cn('block h-full rounded-full bg-fuchsia-600 transition-[width] duration-200 dark:bg-fuchsia-400', pct == null && 'animate-pulse')}
          style={{ width: `${pct ?? 100}%` }}
        />
      </span>
    </div>
  );
}

/** One lesson — a board row. Selecting it plays it in the tab's player. */
export function MediaLessonRow({
  lesson,
  playing,
  onPlay,
  onRename,
  onRemove,
}: {
  lesson: TaskLesson;
  playing: boolean;
  onPlay: () => void;
  /** Linked lessons only — an uploaded recording has no title column. */
  onRename: ((title: string | null) => Promise<unknown>) | null;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!onRename) return;
    const next = draft.trim() || null;
    if (next === (lesson.editableTitle || null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRename(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename it.');
    } finally {
      setSaving(false);
    }
  };

  const Glyph = playing ? Play : Video;
  const line2 = (
    <span className={cn('flex min-w-0 items-center gap-2', LINE_2)}>
      <span className={cn('shrink-0 font-semibold', MEDIA_WORD_INK)}>{lesson.provider}</span>
      {lesson.addedBy ? <PeopleInline people={[lesson.addedBy]} /> : null}
      <span className="shrink-0 text-text-muted" title={new Date(lesson.createdAt).toLocaleString()}>
        {timeAgo(lesson.createdAt)}
      </span>
      {lesson.size ? (
        <span className="shrink-0 tabular-nums text-text-muted">{lesson.size}</span>
      ) : null}
    </span>
  );

  return (
    <li
      className={cn(
        'group/lesson relative flex items-center gap-1 rounded-xl py-1.5 pl-2 pr-1 transition-colors',
        playing ? 'bg-surface-selected ring-1 ring-border-soft' : 'hover:bg-surface-hover',
      )}
      data-testid="task-media-lesson"
      data-lesson={lesson.key}
    >
      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-col gap-[3px]"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Glyph aria-hidden className={cn('size-3.5 shrink-0', MEDIA_GLYPH_INK)} strokeWidth={2.25} />
            <input
              autoFocus
              value={draft}
              maxLength={MEDIA_LINK_TITLE_MAX}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void save()}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                // The rail closes on Escape — here it only cancels the rename.
                event.stopPropagation();
                setEditing(false);
                setError(null);
              }}
              placeholder="Name this lesson"
              aria-label="Lesson name"
              className="-my-0.5 min-w-0 flex-1 rounded-md border border-border-soft bg-surface-card px-1.5 py-0.5 text-[13px] font-medium leading-[18px] text-text-default outline-none placeholder:text-text-muted"
              data-testid="task-media-lesson-title-input"
            />
          </span>
          {error ? <span className={cn(LINE_2, 'text-red-700 dark:text-red-300')}>{error}</span> : line2}
        </form>
      ) : (
        <button
          type="button"
          onClick={onPlay}
          aria-current={playing ? 'true' : undefined}
          aria-label={`${playing ? 'Playing' : 'Play'} ${lesson.title}`}
          className={cn('flex min-w-0 flex-1 cursor-default flex-col gap-[3px] rounded-lg text-left', focusRing('control'))}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Glyph aria-hidden className={cn('size-3.5 shrink-0', MEDIA_GLYPH_INK)} strokeWidth={2.25} />
            <span className="truncate text-[13px] font-medium leading-[18px] text-text-default" data-testid="task-media-lesson-title">
              {lesson.title}
            </span>
          </span>
          {line2}
        </button>
      )}

      {!editing ? (
        <span className="flex shrink-0 items-center">
          {onRename ? (
            <IconButton
              size="sm"
              radius="pill"
              ariaLabel={`Rename ${lesson.title}`}
              onClick={() => {
                setDraft(lesson.editableTitle ?? '');
                setError(null);
                setEditing(true);
              }}
              icon={<Pencil aria-hidden className="size-3.5" />}
              className={HOVER_VERB}
            />
          ) : null}
          <a
            href={lesson.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${lesson.title} in a new tab`}
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-text-soft transition-colors hover:text-text-default',
              focusRing('control'),
              HOVER_VERB,
            )}
          >
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
          <IconButton
            size="sm"
            radius="pill"
            ariaLabel={`Delete ${lesson.title}`}
            onClick={onRemove}
            icon={<Trash2 aria-hidden className="size-3.5" />}
            className={cn(HOVER_VERB, 'hover:text-red-700 dark:hover:text-red-300')}
          />
        </span>
      ) : null}
    </li>
  );
}
