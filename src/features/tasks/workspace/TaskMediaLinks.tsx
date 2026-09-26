'use client';

/** Media by LINK inside the task's Media section: */

import { useState } from 'react';
import Image from 'next/image';
import { ExternalLink, Pencil, Trash2 } from '@/components/Icons';
import {
  EVIDENCE_CONTROL_CLASS,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  MEDIA_LINK_PROVIDER_NOUN,
  MEDIA_LINK_REFUSAL_COPY,
  MEDIA_LINK_TITLE_MAX,
  parseMediaLink,
  type TaskMediaLink,
  type TaskMediaLinkCreateBody,
  type TaskMediaLinkPatchBody,
} from '@/lib/tasks/media-links';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const SMALL_VERB = 'min-h-0 py-1';
const ICON_BUTTON = cn(
  'ds-raw-button inline-flex h-7 w-7 items-center justify-center text-mode-ink hover:bg-mode-hover',
  focusRing('control'),
);

/** What a pasted string will become — the field's live caption. */
function previewFace(raw: string): { text: string; ok: boolean } | null {
  if (!raw.trim()) return null;
  const parsed = parseMediaLink(raw);
  if (!parsed.ok) return { text: MEDIA_LINK_REFUSAL_COPY[parsed.reason] ?? 'Not a media link.', ok: false };
  return { text: `${MEDIA_LINK_PROVIDER_NOUN[parsed.link.provider]} ${parsed.link.kind}`, ok: true };
}

export function MediaLinkComposer({ onAdd }: { onAdd: (body: TaskMediaLinkCreateBody) => Promise<unknown> }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = previewFace(url);

  const submit = async () => {
    if (!preview?.ok || busy) return;
    setBusy(true);
    try {
      await onAdd({ url: url.trim() });
      setUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add that link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube, Loom, Vimeo, Drive or image link"
          aria-label="Photo or video link"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className={cn(EVIDENCE_CONTROL_CLASS, 'min-w-0 flex-1')}
          data-testid="task-media-link-input"
        />
        <button type="submit" className={evidenceVerbClass(true)} disabled={busy || !preview?.ok}>
          {busy ? '…' : 'Add link'}
        </button>
      </div>
      {preview ? (
        <p className={cn('text-role-caption', preview.ok ? 'text-mode-muted' : 'text-mode-warn')} role="status">
          {preview.text}
        </p>
      ) : null}
    </form>
  );
}

/** One linked photo or video: the player / image, its caption, and its verbs. */
export function MediaLinkItem({
  link,
  onUpdate,
  onRemove,
  onOpenPhoto,
}: {
  link: TaskMediaLink;
  onUpdate: (patch: TaskMediaLinkPatchBody) => Promise<unknown>;
  onRemove: () => void;
  /** Photos open the shared viewer; videos play in place. */
  onOpenPhoto?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(link.url);
  const [title, setTitle] = useState(link.title ?? '');
  const [busy, setBusy] = useState(false);
  const caption = link.title || MEDIA_LINK_PROVIDER_NOUN[link.provider];

  const save = async () => {
    setBusy(true);
    try {
      const patch: TaskMediaLinkPatchBody = {};
      if (url.trim() !== link.url) patch.url = url.trim();
      if ((title.trim() || null) !== link.title) patch.title = title.trim() || null;
      if (Object.keys(patch).length > 0) await onUpdate(patch);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="overflow-hidden rounded-mode border border-mode-rule" data-testid="task-media-link">
      {link.kind === 'photo' ? (
        <button
          type="button"
          onClick={onOpenPhoto}
          aria-label={`Open ${caption}`}
          className={cn('relative block aspect-video w-full cursor-zoom-in bg-mode-well', focusRing('control'))}
        >
          <Image src={link.embedUrl} alt="" fill unoptimized sizes="24vw" className="object-contain" />
        </button>
      ) : link.provider === 'video_file' ? (
        <video src={link.embedUrl} controls playsInline preload="metadata" className="aspect-video w-full bg-mode-ink" />
      ) : (
        <iframe
          src={link.embedUrl}
          title={caption}
          className="aspect-video w-full bg-mode-ink"
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {editing ? (
        <form
          className="flex flex-col gap-2 border-t border-mode-rule p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-label="Link URL"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={MEDIA_LINK_TITLE_MAX}
            placeholder="Caption (optional)"
            aria-label="Link caption"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className={cn(evidenceVerbClass(false), SMALL_VERB)}
              onClick={() => {
                setUrl(link.url);
                setTitle(link.title ?? '');
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button type="submit" className={cn(evidenceVerbClass(true), SMALL_VERB)} disabled={busy || !url.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-1 border-t border-mode-rule py-1 pl-2">
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>{MEDIA_LINK_PROVIDER_NOUN[link.provider]}</span>
          <span className="min-w-0 flex-1 truncate text-role-data text-mode-ink" title={link.url}>
            {link.title ?? ''}
          </span>
          <a href={link.url} target="_blank" rel="noreferrer" aria-label={`Open ${caption} at its source`} className={ICON_BUTTON}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <button type="button" aria-label={`Edit ${caption}`} onClick={() => setEditing(true)} className={ICON_BUTTON}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" aria-label={`Remove ${caption}`} onClick={onRemove} className={ICON_BUTTON}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
