/**
 * **Media links** — a photo or video that lives somewhere else (an unlisted
 * YouTube walkthrough, a Loom, a Vimeo, a Drive clip, a hosted image) attached
 * to a task by URL, and painted in place like an uploaded one.
 *
 * Pure and client-safe: the server validates and normalises with it (the
 * stored `kind` / `provider` / `embed_url` are ITS answer, never the
 * request's), and the evidence column previews a pasted link with the same
 * function before it is saved, so the preview is what will be stored.
 *
 * Only hosts listed here are embedded. An arbitrary page cannot be framed
 * meaningfully (most send `X-Frame-Options`), and framing a URL we did not
 * recognise would be an open redirect into the desk.
 */

export const MEDIA_LINK_KINDS = ['video', 'photo'] as const;
export type MediaLinkKind = (typeof MEDIA_LINK_KINDS)[number];

export const MEDIA_LINK_PROVIDERS = ['youtube', 'vimeo', 'loom', 'drive', 'image', 'video_file'] as const;
export type MediaLinkProvider = (typeof MEDIA_LINK_PROVIDERS)[number];

export const MEDIA_LINK_URL_MAX = 2000;
export const MEDIA_LINK_TITLE_MAX = 200;

export interface ParsedMediaLink {
  kind: MediaLinkKind;
  provider: MediaLinkProvider;
  /** The canonical URL stored and opened ("Open on YouTube"). */
  url: string;
  /**
   * What the column renders: an iframe `src` for hosted players, the file
   * itself for a direct image / video.
   */
  embedUrl: string;
  /** A still for the grid, when the provider publishes one without an API call. */
  thumbnailUrl: string | null;
}

export type MediaLinkParse = { ok: true; link: ParsedMediaLink } | { ok: false; reason: 'invalid_url' | 'unsupported_link' };

const YOUTUBE_ID = /^[\w-]{11}$/;
const IMAGE_PATH = /\.(jpe?g|png|webp|gif|avif)$/i;
const VIDEO_PATH = /\.(mp4|m4v|webm|mov)$/i;

function youtube(id: string | null | undefined): ParsedMediaLink | null {
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    kind: 'video',
    provider: 'youtube',
    url: `https://www.youtube.com/watch?v=${id}`,
    // nocookie: an unlisted training clip plays without seeding ad cookies.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/**
 * `https://youtu.be/dQw4w9WgXcQ` → a YouTube video; `https://x.com/a.png` → a
 * photo; a page on an unknown host → `unsupported_link`. Unlisted YouTube and
 * Vimeo links parse like public ones — the unlisted hash rides the URL.
 */
export function parseMediaLink(raw: string): MediaLinkParse {
  const text = raw.trim();
  if (!text || text.length > MEDIA_LINK_URL_MAX) return { ok: false, reason: 'invalid_url' };
  // A scheme other than http(s) (`ftp://`, `javascript:`, `mailto:`) is not a
  // web address; only a scheme-less paste (`youtu.be/…`) gets `https://`.
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(text);
  if (hasScheme && !/^https?:\/\//i.test(text)) return { ok: false, reason: 'invalid_url' };
  let u: URL;
  try {
    u = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'invalid_url' };
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const segments = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const link = youtube(segments[0]);
    return link ? { ok: true, link } : { ok: false, reason: 'unsupported_link' };
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    const id =
      segments[0] === 'watch'
        ? u.searchParams.get('v')
        : ['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')
          ? segments[1]
          : null;
    const link = youtube(id);
    return link ? { ok: true, link } : { ok: false, reason: 'unsupported_link' };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const ids = segments.filter((s) => /^\d+$/.test(s));
    const id = ids[0];
    if (!id) return { ok: false, reason: 'unsupported_link' };
    // Unlisted: `vimeo.com/123/abcdef` or `?h=abcdef` — the hash is the key.
    const after = segments[segments.indexOf(id) + 1];
    const hash = u.searchParams.get('h') ?? (after && /^[\da-f]+$/i.test(after) ? after : null);
    return {
      ok: true,
      link: {
        kind: 'video',
        provider: 'vimeo',
        url: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`,
        embedUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`,
        thumbnailUrl: null,
      },
    };
  }
  if (host === 'loom.com') {
    const id = segments[0] === 'share' || segments[0] === 'embed' ? segments[1] : null;
    if (!id || !/^[\da-f]{16,64}$/i.test(id)) return { ok: false, reason: 'unsupported_link' };
    return {
      ok: true,
      link: {
        kind: 'video',
        provider: 'loom',
        url: `https://www.loom.com/share/${id}`,
        embedUrl: `https://www.loom.com/embed/${id}`,
        thumbnailUrl: null,
      },
    };
  }
  if (host === 'drive.google.com') {
    const id = segments[0] === 'file' && segments[1] === 'd' ? segments[2] : u.searchParams.get('id');
    if (!id || !/^[\w-]{10,}$/.test(id)) return { ok: false, reason: 'unsupported_link' };
    return {
      ok: true,
      link: {
        kind: 'video',
        provider: 'drive',
        url: `https://drive.google.com/file/d/${id}/view`,
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        thumbnailUrl: null,
      },
    };
  }
  if (u.protocol === 'https:' && IMAGE_PATH.test(u.pathname)) {
    return { ok: true, link: { kind: 'photo', provider: 'image', url: u.href, embedUrl: u.href, thumbnailUrl: u.href } };
  }
  if (u.protocol === 'https:' && VIDEO_PATH.test(u.pathname)) {
    return { ok: true, link: { kind: 'video', provider: 'video_file', url: u.href, embedUrl: u.href, thumbnailUrl: null } };
  }
  return { ok: false, reason: 'unsupported_link' };
}

/** One stored media link, as the media payload carries it. */
export interface TaskMediaLink extends ParsedMediaLink {
  id: number;
  taskId: number;
  /** Operator's caption; null shows the provider's name. */
  title: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; name: string } | null;
}

/** `POST /api/tasks/[id]/media/links` and `PATCH …?linkId=` bodies. */
export interface TaskMediaLinkCreateBody {
  url: string;
  title?: string | null;
}
export interface TaskMediaLinkPatchBody {
  url?: string;
  title?: string | null;
}

export const MEDIA_LINK_PROVIDER_NOUN: Readonly<Record<MediaLinkProvider, string>> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
  drive: 'Google Drive',
  image: 'Image link',
  video_file: 'Video file',
};

export const MEDIA_LINK_REFUSAL_COPY: Readonly<Record<string, string>> = {
  task_not_found: 'That task no longer exists.',
  link_not_found: 'That media link is no longer on this task.',
  invalid_url: 'That is not a web address.',
  unsupported_link:
    'Paste a YouTube, Vimeo, Loom or Google Drive link, or a direct image / video file (https://…/photo.jpg).',
  duplicate_link: 'That link is already on this task.',
};
