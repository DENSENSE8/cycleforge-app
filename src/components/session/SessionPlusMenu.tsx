'use client';

/**
 * SessionPlusMenu — the + menu content for the session composer. Unifies the
 * add-verbs that used to be scattered across surfaces:
 *
 *   • Attach file — uploads through the composer's attachment chips (the
 *     same path as a drop on the composer); the message carries the stored id.
 *   • Add photo — uploads through the same document-intake attachment path;
 *     the server derives local OCR before the chat model sees the turn.
 *   • # Order number — ping an order: seeds "Look up order #<num>".
 *   • Log details — seeds a "Log: …" entry the agent records.
 *
 * Every action lands as a DRAFT in the ask field — nothing auto-sends.
 * ("@ Assign a task" is not ported to this lane: it needs the ops-plans task
 * route + `ops_plan_members` migration.)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileText, Hash, Paperclip, Search } from '@/components/Icons';
import { ComposerPlusMenuRow, ComposerPlusMenuSection } from '@/components/composer/ComposerPlusMenu';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { COMPOSER_ATTACHMENT_ACCEPT } from './composer/useComposerAttachments';

type Sub = null | { kind: 'photoSearch' } | { kind: 'order' } | { kind: 'log' };

export function SessionPlusMenu({
  onClose,
  onAttachFiles,
}: {
  onClose: () => void;
  /** Uploads picked files as composer attachments (`useComposerAttachments.add`). */
  onAttachFiles: (files: File[]) => void;
}) {
  const [sub, setSub] = useState<Sub>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const seed = useCallback((text: string) => {
    onClose();
    requestComposerSeed({ text, autoSend: false });
  }, [onClose]);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length === 0) return;
      onClose();
      onAttachFiles(files);
    },
    [onAttachFiles, onClose],
  );

  const onPickPhoto = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      onAttachFiles(files);
      seed('Read the attached photo as a document.');
      e.target.value = '';
    },
    [onAttachFiles, seed],
  );

  return (
    <>
      {sub === null ? (
        <>
          <ComposerPlusMenuSection>
            <ComposerPlusMenuRow icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
              Attach file
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<Camera className="h-3.5 w-3.5" />} onClick={() => photoRef.current?.click()}>
              Add photo
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<Search className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'photoSearch' })}>
              Search existing photos
            </ComposerPlusMenuRow>
          </ComposerPlusMenuSection>
          <ComposerPlusMenuSection>
            <ComposerPlusMenuRow icon={<Hash className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'order' })}>
              # Order number
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<FileText className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'log' })}>
              Log details
            </ComposerPlusMenuRow>
          </ComposerPlusMenuSection>
        </>
      ) : null}

      {sub?.kind === 'photoSearch' ? <PhotoSearchSub onPick={seed} onBack={() => setSub(null)} /> : null}
      {sub?.kind === 'order' ? (
        <TextSub
          placeholder="Order number…"
          onSubmit={(v) => seed(`Look up order #${v}`)}
          onBack={() => setSub(null)}
        />
      ) : null}
      {sub?.kind === 'log' ? (
        <TextSub
          placeholder="What happened…"
          multiline
          onSubmit={(v) => seed(`Log this: ${v}`)}
          onBack={() => setSub(null)}
        />
      ) : null}

      {/* hidden pickers */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={COMPOSER_ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={onPickFile}
        data-testid="session-add-file-input"
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={onPickPhoto}
        data-testid="session-add-photo-input"
      />
    </>
  );
}

function TextSub({
  placeholder,
  onSubmit,
  onBack,
  multiline = false,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  onBack: () => void;
  multiline?: boolean;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
  };
  return (
    <div className="flex flex-col gap-1.5">
      {multiline ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-16 w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
        />
      ) : (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
        />
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="ds-raw-button text-role-micro text-text-faint hover:text-text-default">
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="ds-raw-button rounded-lg bg-blue-600 px-2.5 py-1 text-role-micro font-semibold text-white disabled:opacity-50"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

function PhotoSearchSub({ onPick, onBack }: { onPick: (text: string) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<Record<string, unknown>> | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/photos/library?q=${encodeURIComponent(q.trim())}&limit=6`);
        if (!res.ok) return;
        const data = (await res.json()) as { photos?: Array<Record<string, unknown>> };
        if (alive) setResults(data.photos ?? []);
      } catch {
        if (alive) setResults(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search existing photos…"
        aria-label="Search existing photos"
        className="w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
      />
      {results && results.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto">
          {results.map((p, i) => {
            const label =
              typeof p.title === 'string'
                ? p.title
                : typeof p.id !== 'undefined'
                  ? `Photo ${String(p.id)}`
                  : `Result ${i + 1}`;
            const id = typeof p.id !== 'undefined' ? String(p.id) : '';
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(`Look at photo ${id} (${label}).`)}
                  className="block w-full truncate rounded-lg px-2 py-1 text-left text-role-caption text-text-muted hover:bg-surface-sunken"
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <button type="button" onClick={onBack} className="ds-raw-button self-start text-role-micro text-text-faint hover:text-text-default">
        Back
      </button>
    </div>
  );
}
