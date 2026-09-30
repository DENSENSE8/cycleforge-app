/**
 * A task's media as the staff-teaching surface reads it (owner 2026-09-29: "I
 * attach an unlisted YouTube link or a video I recorded to a task and staff
 * watch it there"). Linked and uploaded videos are one list of **lessons**,
 * played one at a time in one player; photos are a strip beside them. Shared
 * by the desktop rail / workspace and the phone task sheet — pure, no UI.
 */

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_VIDEO_MAX_BYTES, formatMegabytes, normalizeMime, validateVideoUpload } from '@/lib/photos/video-upload-rules';
import { MEDIA_LINK_PROVIDER_NOUN, type TaskMediaLink } from './media-links';
import type { TaskMediaPhoto, TaskMediaVideo } from './task-links-shared';

export interface TaskLesson {
  /** `link:12` / `video:34` — stable across refetches. */
  key: string;
  /** Line 1: the lesson's name. */
  title: string;
  /** Linked lessons carry an editable title; an uploaded recording has no title column. */
  editableTitle: string | null;
  /** Line 2's provider word: `YouTube`, `Vimeo · Unlisted`, `Uploaded`. */
  provider: string;
  player: { kind: 'iframe' | 'video'; src: string };
  /** Where "open in a new tab" goes. */
  openUrl: string;
  addedBy: { id: number; name: string } | null;
  createdAt: string;
  /** `48 KB` / `7.5 MB` — uploads only; a linked video's size is the host's business. */
  size: string | null;
  link: TaskMediaLink | null;
  video: TaskMediaVideo | null;
}

export interface TaskStill {
  key: string;
  url: string;
  thumbUrl: string;
  photo: TaskMediaPhoto | null;
  link: TaskMediaLink | null;
}

const LESSON_PROVIDER: Readonly<Record<TaskMediaLink['provider'], string>> = {
  ...MEDIA_LINK_PROVIDER_NOUN,
  drive: 'Drive',
  video_file: 'Video link',
};

function recordingTitle(createdAt: string): string {
  const at = new Date(createdAt);
  if (!Number.isFinite(at.getTime())) return 'Recording';
  return `Recording · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at)}`;
}

/** Linked and uploaded videos, one list, in the order they were added (a course reads first-to-last). */
export function taskLessons(videos: readonly TaskMediaVideo[], links: readonly TaskMediaLink[]): TaskLesson[] {
  const lessons: TaskLesson[] = [
    ...links
      .filter((link) => link.kind === 'video')
      .map(
        (link): TaskLesson => ({
          key: `link:${link.id}`,
          title: link.title || `${LESSON_PROVIDER[link.provider]} video`,
          editableTitle: link.title ?? '',
          player: { kind: link.provider === 'video_file' ? 'video' : 'iframe', src: link.embedUrl },
          // Vimeo's unlisted hash rides the stored URL (`vimeo.com/123/abcdef`); YouTube's unlisted state is not in the URL.
          provider: `${LESSON_PROVIDER[link.provider]}${
            link.provider === 'vimeo' && /^https:\/\/vimeo\.com\/\d+\/[\da-f]+$/i.test(link.url) ? ' · Unlisted' : ''
          }`,
          openUrl: link.url,
          addedBy: link.createdBy,
          createdAt: link.createdAt,
          size: null,
          link,
          video: null,
        }),
      ),
    ...videos.map(
      (video): TaskLesson => ({
        key: `video:${video.id}`,
        title: recordingTitle(video.createdAt),
        editableTitle: null,
        provider: 'Uploaded',
        player: { kind: 'video', src: video.url },
        openUrl: video.url,
        addedBy: video.createdBy,
        createdAt: video.createdAt,
        // formatMegabytes reads a 50 KB clip as `0.0 MB`; under a megabyte, say KB.
        size: video.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(video.sizeBytes / 1024))} KB` : formatMegabytes(video.sizeBytes),
        link: null,
        video,
      }),
    ),
  ];
  return lessons.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Uploaded photos, then photo links — the order the viewer steps through. */
export function taskStills(photos: readonly TaskMediaPhoto[], links: readonly TaskMediaLink[]): TaskStill[] {
  return [
    ...photos.map((photo): TaskStill => ({ key: `photo:${photo.id}`, url: photo.url, thumbUrl: photo.thumbUrl, photo, link: null })),
    ...links
      .filter((link) => link.kind === 'photo')
      .map(
        (link): TaskStill => ({
          key: `link:${link.id}`,
          url: link.embedUrl,
          thumbUrl: link.thumbnailUrl ?? link.embedUrl,
          photo: null,
          link,
        }),
      ),
  ];
}

/** The add bar's quiet line: what goes in, and the ceiling. */
export const TASK_MEDIA_ACCEPTS_COPY = `YouTube (unlisted is fine), Vimeo, Loom or Drive links · MP4, MOV or WebM up to ${formatMegabytes(DEFAULT_VIDEO_MAX_BYTES)} · photos`;

/** What the file pickers offer: every image and video, refused files named after the pick. */
export const TASK_MEDIA_ACCEPT = 'image/*,video/*';

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;
const VIDEO_FILE = /\.(mp4|m4v|mov|qt|webm|mkv|avi|wmv|flv|3gp|mpe?g|ogv)$/i;

export type TaskMediaFileKind = 'photo' | 'video';

/**
 * Sort a drop / paste / pick into what uploads and what is refused, with the
 * refusal in operator words (`clip.mkv is a .mkv file — upload MP4, MOV or
 * WebM.`) BEFORE a byte moves.
 */
export function screenTaskMediaFiles(
  files: readonly File[],
  maxBytes: number = DEFAULT_VIDEO_MAX_BYTES,
): { accepted: { file: File; kind: TaskMediaFileKind }[]; refused: string[] } {
  const accepted: { file: File; kind: TaskMediaFileKind }[] = [];
  const refused: string[] = [];
  for (const file of files) {
    const mime = normalizeMime(file.type);
    if (mime.startsWith('video/') || VIDEO_FILE.test(file.name)) {
      const typeOk = validateVideoUpload({ contentType: file.type, sizeBytes: 1, fileName: file.name }, 1).ok;
      if (!typeOk) {
        const ext = /\.([a-z\d]+)$/i.exec(file.name)?.[1]?.toLowerCase();
        refused.push(`${file.name} is ${ext ? `a .${ext} file` : 'a video format that will not play here'} — upload MP4, MOV or WebM.`);
      } else if (file.size <= 0) {
        refused.push(`${file.name} is empty.`);
      } else if (file.size > maxBytes) {
        refused.push(`${file.name} is ${formatMegabytes(file.size)} — the limit is ${formatMegabytes(maxBytes)}. Trim it or upload it to YouTube as unlisted and paste the link.`);
      } else {
        accepted.push({ file, kind: 'video' });
      }
    } else if (mime.startsWith('image/') || IMAGE_FILE.test(file.name)) {
      accepted.push({ file, kind: 'photo' });
    } else {
      refused.push(`${file.name} is not a photo or a video.`);
    }
  }
  return { accepted, refused };
}

/** An iframe `src` that starts playing — the operator just picked it. */
export function autoplaySrc(src: string): string {
  try {
    const u = new URL(src);
    u.searchParams.set('autoplay', '1');
    return u.toString();
  } catch {
    return src;
  }
}

/** The ONE player's state: which lesson it shows, whether it starts on its own, and the row tap that picks one. */
export interface TaskLessonPlayer {
  current: TaskLesson | null;
  /** True only right after a tap — a lesson the list merely loaded never starts itself. */
  autoplay: boolean;
  play: (key: string) => void;
}

/**
 * Which lesson the ONE player shows: the picked one, else the first. A lesson
 * that arrives after the list first loaded (just pasted / just uploaded) takes
 * the player so the operator sees what they added.
 */
export function useLessonPlayer(lessons: readonly TaskLesson[], ready: boolean): TaskLessonPlayer {
  const [picked, setPicked] = useState<{ key: string; autoplay: boolean } | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const keys = lessons.map((lesson) => lesson.key).join('|');

  useEffect(() => {
    if (!ready) return;
    const now = keys ? keys.split('|') : [];
    const before = seen.current;
    seen.current = new Set(now);
    if (!before) return;
    const fresh = now.filter((key) => !before.has(key)).at(-1);
    if (fresh) setPicked({ key: fresh, autoplay: false });
  }, [keys, ready]);

  const current = lessons.find((lesson) => lesson.key === picked?.key) ?? lessons[0] ?? null;
  return {
    current,
    autoplay: current != null && picked?.key === current.key && picked.autoplay,
    play: (key: string) => setPicked({ key, autoplay: true }),
  };
}
