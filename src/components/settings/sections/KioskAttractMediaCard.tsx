'use client';

/**
 * Settings → Organization ▸ Branding — kiosk attract / screensaver media.
 *
 * Upload writes immediately via POST /api/admin/organization/attract-media
 * (public Vercel Blob → brand.attractMediaUrl). Optional URL paste stays for
 * CDN-hosted assets and saves with the rest of the Organization form.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Button } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';
import { ATTRACT_ACCEPT } from '@/lib/kiosk/attract-media';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/**
 * The preview mounts the REAL kiosk surface, not a settings-local mock of it —
 * an approximation would drift from the thing it claims to preview, which is
 * the whole failure the preview exists to prevent. `dynamic` keeps AttractLoop
 * (and the motion engine it pulls) out of the settings chunk until asked for,
 * the same reason the kiosk runtime loads it that way.
 */
const AttractLoop = dynamic(
  () => import('@/app/kiosk/AttractLoop').then((m) => m.AttractLoop),
  { ssr: false },
);

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

export function KioskAttractMediaCard({
  attractMediaUrl,
  onUrlChange,
  headline,
  subline,
  inkColor,
}: {
  attractMediaUrl: string;
  onUrlChange: (url: string) => void;
  /** Draft wordmark copy — previewed live, before the form is saved. */
  headline?: string;
  subline?: string;
  inkColor?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUrlPaste, setShowUrlPaste] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!previewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewing]);

  const hasMedia = Boolean(attractMediaUrl.trim());
  const video = hasMedia && isVideoUrl(attractMediaUrl);

  async function commit(action: 'upload' | 'clear', file?: File) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/admin/organization/attract-media', {
        method: action === 'clear' ? 'DELETE' : 'POST',
        body: action === 'clear' ? undefined : buildForm(file!),
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as {
        attractMediaUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || 'Could not update kiosk media. Please try again.');
        return;
      }
      onUrlChange(json.attractMediaUrl ?? '');
    } catch {
      setError('Could not update kiosk media. Please try again.');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3 rounded-none border border-border-hairline bg-surface-sunken/40 p-4">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Kiosk screensaver
        </h4>
        <p className="mt-1 text-role-caption text-text-soft">
          Shown full-screen on the front-desk kiosk after idle. Video plays muted and loops.
        </p>
      </div>

      {hasMedia ? (
        <div className="overflow-hidden rounded-none border border-border-soft bg-surface-inverse">
          {video ? (
            <div className="flex h-36 items-center justify-center px-4 text-center text-sm text-white/80">
              Video ready — plays muted on the kiosk attract loop
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attractMediaUrl}
              alt=""
              className="h-36 w-full object-cover opacity-90"
            />
          )}
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-none border border-dashed border-border-soft bg-surface-card text-role-caption text-text-faint">
          No custom media — kiosk shows the wordmark lines below
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ATTRACT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void commit('upload', file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === 'upload' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : hasMedia ? (
            'Replace media'
          ) : (
            'Upload media'
          )}
        </Button>
        {hasMedia ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => void commit('clear')}
          >
            {busy === 'clear' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Removing…
              </>
            ) : (
              'Clear'
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => setPreviewing(true)}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => setShowUrlPaste((v) => !v)}
        >
          {showUrlPaste ? 'Hide URL' : 'Use a public URL instead'}
        </Button>
      </div>

      {previewing && typeof document !== 'undefined'
        ? createPortal(
            /*
              Portaled to <body>: the preview is the full kiosk viewport, and a
              `fixed` child inside a transformed settings ancestor would size to
              that ancestor instead of the screen.

              `z-takeover` on the wrapper, not on AttractLoop: the kiosk's own
              `z-panel` is correct ON the kiosk, where nothing else is mounted.
              Here it has the whole app behind it, and app chrome (the assistant
              bubble at `z-fab`, toasts) would otherwise float over the surface
              being previewed. The wrapper opens one stacking context that the
              kiosk layer sits inside, so the preview stays honest.
            */
            <div className="fixed inset-0 z-takeover">
              <AttractLoop
                mediaUrl={attractMediaUrl.trim() || null}
                onWake={() => setPreviewing(false)}
                active
                plain
                headline={headline}
                subline={subline}
                inkColor={inkColor}
              />
              {/* Preview chrome — outside AttractLoop so the surface under test
                  stays exactly what the kiosk paints. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-8 z-panelOverlay flex justify-center">
                <span className="bg-surface-inverse/80 px-4 py-2 text-role-caption text-white backdrop-blur-sm">
                  Preview — click anywhere or press Esc to close
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}

      {showUrlPaste ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-muted">
            Public image or video URL
          </span>
          <input
            type="url"
            value={attractMediaUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            className={
              'w-full rounded-xl border border-border-default bg-surface-card px-3 py-2 text-sm text-text-default ' +
              cn('placeholder:text-text-faint', focusRing('field', 'accent'))
            }
            placeholder="https://…"
          />
          <span className="mt-1 block text-xs text-text-soft">
            Saves with the Organization form below. Prefer Upload for files hosted by Cycle Forge.
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="text-role-caption text-text-danger" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function buildForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}
