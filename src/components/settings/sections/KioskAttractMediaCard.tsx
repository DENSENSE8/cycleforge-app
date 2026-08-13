'use client';

/**
 * Settings → Organization ▸ Branding — kiosk attract / screensaver media.
 *
 * Upload writes immediately via POST /api/admin/organization/attract-media
 * (public Vercel Blob → brand.attractMediaUrl). Optional URL paste stays for
 * CDN-hosted assets and saves with the rest of the Organization form.
 */

import { useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';
import { ATTRACT_ACCEPT } from '@/lib/kiosk/attract-media';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

export function KioskAttractMediaCard({
  attractMediaUrl,
  onUrlChange,
}: {
  attractMediaUrl: string;
  onUrlChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUrlPaste, setShowUrlPaste] = useState(false);

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
          No custom media — kiosk shows brand name / logo
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
          onClick={() => setShowUrlPaste((v) => !v)}
        >
          {showUrlPaste ? 'Hide URL' : 'Use a public URL instead'}
        </Button>
      </div>

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
