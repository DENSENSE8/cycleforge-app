'use client';

/**
 * The task sheet's MEDIA LINKS — a photo or video that lives elsewhere (an
 * unlisted YouTube walkthrough, a Loom, a Vimeo, a Drive clip, a hosted image
 * or video file), attached by URL.
 *
 * Video links PLAY IN PLACE: a hosted player is the provider's `embedUrl` in an
 * iframe, a direct file is a `<video>`. Photo links join the uploaded photos in
 * the grid and swipe viewer (`taskMediaTimeline`); all linked media is listed
 * here with source, edit and remove controls.
 *
 * The field previews what the SERVER will store: it runs the same
 * `parseMediaLink` the route uses, and speaks its refusals in the same
 * `MEDIA_LINK_REFUSAL_COPY` the desk does. Both URL and caption are editable
 * on the phone.
 */

import { useState } from 'react';
import { ExternalLink, Pencil, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import {
  MEDIA_LINK_PROVIDER_NOUN,
  MEDIA_LINK_REFUSAL_COPY,
  parseMediaLink,
  type TaskMediaLink,
  type TaskMediaLinkCreateBody,
  type TaskMediaLinkPatchBody,
} from '@/lib/tasks/media-links';
import { cn } from '@/utils/_cn';

/** Paste a URL → the server stores the embed. Refusals come back as operator words. */
export function MediaLinkField({ onAdd }: { onAdd: (body: TaskMediaLinkCreateBody) => Promise<unknown> }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = url.trim() ? parseMediaLink(url) : null;
  const preview = parsed
    ? parsed.ok
      ? { text: `${MEDIA_LINK_PROVIDER_NOUN[parsed.link.provider]} ${parsed.link.kind}`, ok: true }
      : { text: MEDIA_LINK_REFUSAL_COPY[parsed.reason] ?? 'Not a media link.', ok: false }
    : null;

  const submit = async () => {
    if (!preview?.ok || busy) return;
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

  return (
    <form
      className="flex flex-col gap-1 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <TextField
          label="Paste a video or photo link"
          value={url}
          onChange={(next) => {
            setUrl(next);
            setError(null);
          }}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        {/* R9 — the verb names what it is waiting for instead of greying silently. */}
        <Button type="submit" variant="secondary" size="lg" className="min-h-12 shrink-0" disabled={busy || !preview?.ok}>
          {busy ? 'Adding…' : 'Add link'}
        </Button>
      </div>
      {error ?? preview ? (
        <p
          role="status"
          className={cn('text-role-micro', error || !preview?.ok ? 'text-text-danger' : 'text-text-muted')}
        >
          {error ?? preview?.text}
        </p>
      ) : null}
    </form>
  );
}

/** Every media link with its player and complete edit / remove controls. */
export function MediaLinkList({
  links,
  removingId,
  onRemove,
  onUpdate,
}: {
  links: readonly TaskMediaLink[];
  removingId: number | null;
  onRemove: (link: TaskMediaLink) => void;
  onUpdate: (link: TaskMediaLink, patch: TaskMediaLinkPatchBody) => Promise<unknown>;
}) {
  return (
    <ul className="flex flex-col gap-2 pt-3">
      {links.map((link) => (
        <MediaLinkRow
          key={link.id}
          link={link}
          removing={removingId === link.id}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}
    </ul>
  );
}

function MediaLinkRow({
  link,
  removing,
  onRemove,
  onUpdate,
}: {
  link: TaskMediaLink;
  removing: boolean;
  onRemove: (link: TaskMediaLink) => void;
  onUpdate: (link: TaskMediaLink, patch: TaskMediaLinkPatchBody) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(link.url);
  const [title, setTitle] = useState(link.title ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = MEDIA_LINK_PROVIDER_NOUN[link.provider];
  const parsed = editing ? parseMediaLink(url) : null;

  const save = async () => {
    if (saving || !parsed?.ok) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(link, { url: url.trim(), title: title.trim() || null });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={cn('overflow-hidden border border-border-hairline bg-surface-card', MOBILE_ROW_CORNER)}>
      {link.kind === 'video' ? (
        link.provider === 'video_file' ? (
          <video src={link.embedUrl} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
        ) : (
          <iframe
            src={link.embedUrl}
            title={link.title ?? `${noun} video`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video w-full border-0 bg-black"
          />
        )
      ) : null}
      {editing ? (
        <form
          className="flex flex-col gap-2 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextField label="Media URL" value={url} onChange={setUrl} inputMode="url" autoComplete="off" spellCheck={false} />
          <TextField label="Caption" value={title} onChange={setTitle} maxLength={200} />
          {error || (parsed && !parsed.ok) ? (
            <p role="alert" className="text-role-micro text-text-danger">
              {error ?? (parsed && !parsed.ok ? MEDIA_LINK_REFUSAL_COPY[parsed.reason] : null)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="min-h-12 flex-1"
              type="button"
              onClick={() => {
                setUrl(link.url);
                setTitle(link.title ?? '');
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="lg" className="min-h-12 flex-1" type="submit" disabled={saving || !parsed?.ok}>
              {saving ? 'Saving…' : 'Save link'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-1 pl-3">
          <span className="min-w-0 flex-1 py-2">
            <span className="block text-role-micro uppercase tracking-wide text-text-faint">{noun} {link.kind}</span>
            {link.title ? <span className="block truncate text-role-caption text-text-default">{link.title}</span> : null}
          </span>
          <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${noun}`} className="flex h-11 w-11 shrink-0 items-center justify-center text-text-muted">
            <ExternalLink aria-hidden className="h-5 w-5" />
          </a>
          <IconButton
            onClick={() => {
              setUrl(link.url);
              setTitle(link.title ?? '');
              setError(null);
              setEditing(true);
            }}
            ariaLabel={`Edit ${noun} ${link.kind}`}
            size="touch"
            icon={<Pencil aria-hidden className="h-5 w-5" />}
            className="shrink-0"
          />
          <IconButton
            onClick={() => onRemove(link)}
            ariaLabel={`Remove ${noun} ${link.kind}`}
            size="touch"
            disabled={removing}
            icon={<X aria-hidden className="h-5 w-5" />}
            className="shrink-0"
          />
        </div>
      )}
    </li>
  );
}
