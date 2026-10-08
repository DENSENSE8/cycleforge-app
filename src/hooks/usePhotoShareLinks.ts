'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/lib/toast';
import { copyToClipboardWhenReady } from '@/utils/_dom';
import { formatShareLinksText, type ShareLinkLine } from '@/lib/photos/share-link-format';

/** Shape returned by POST /api/photos/share. */
interface ShareApiResponse {
  links: Array<ShareLinkLine & { photoId: number; kind: 'signed' | 'proxy'; expiresAt: string | null }>;
  expiresAt: string | null;
  missingIds: number[];
  groupUrl: string | null;
}

/** What the share sheet shows once links or a share page exist. */
export interface PhotoShareReady {
  kind: 'links' | 'page';
  /** How many photos the share covers. */
  count: number;
  /** The exact clipboard payload (the formatted link block, or the page URL). */
  text: string;
  /** The public share page, for `kind: 'page'`. */
  url: string | null;
  /** "24 hours" — when signed links stop working; null when they don't expire. */
  expiresInLabel: string | null;
  /** Whether the copy made during the press landed. */
  copied: boolean;
  /** Photos the server could not find (skipped). */
  skipped: number;
}

/** Render the uniform expiry as a short human label ("24 hours"). */
function expiresInLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * `usePhotoShareLinks` — temporary share links or a durable share page for a
 * set of photo ids. The copy is claimed during the press itself
 * ({@link copyToClipboardWhenReady}), because a clipboard write made after the
 * network round trip is refused. The result lands in `ready` for the share
 * sheet, which always offers its own Copy button; failures toast.
 */
export function usePhotoShareLinks() {
  const [isLoading, setIsLoading] = useState(false);
  const [ready, setReady] = useState<PhotoShareReady | null>(null);

  /** POST the ids and copy the formatted link block. Call straight from the press. */
  const generateAndCopy = useCallback(
    async (photoIds: number[], opts: { ttlSeconds?: number } = {}): Promise<PhotoShareReady | null> => {
      const ids = [...new Set(photoIds.filter((id) => Number.isFinite(id) && id > 0))];
      if (ids.length === 0) {
        toast.error('Select at least one photo to share');
        return null;
      }

      const request = (async () => {
        const res = await fetch('/api/photos/share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ photoIds: ids, ttlSeconds: opts.ttlSeconds }),
        });
        const data = (await res.json().catch(() => null)) as ShareApiResponse | { error?: string } | null;
        if (!res.ok || !data || !('links' in data)) {
          throw new Error((data as { error?: string } | null)?.error || 'Failed to generate share links');
        }
        const expires = expiresInLabel(data.expiresAt);
        return { data, expires, text: formatShareLinksText(data.links, { groupUrl: data.groupUrl, expiresInLabel: expires }) };
      })();
      // Before any await: this is still the operator's press.
      const copied = copyToClipboardWhenReady(request.then((r) => r.text), { historyKind: 'photo-share-links' });

      setIsLoading(true);
      setReady(null);
      try {
        const { data, expires, text } = await request;
        const next: PhotoShareReady = {
          kind: 'links',
          count: data.links.length,
          text,
          url: data.groupUrl,
          expiresInLabel: expires,
          copied: await copied,
          skipped: data.missingIds.length,
        };
        setReady(next);
        return next;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to generate share links');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /** Create one durable public share page for the selection and copy its URL. Call straight from the press. */
  const createSharePage = useCallback(
    async (
      photoIds: number[],
      opts: { title?: string; expiresInDays?: number } = {},
    ): Promise<PhotoShareReady | null> => {
      const ids = [...new Set(photoIds.filter((id) => Number.isFinite(id) && id > 0))];
      if (ids.length === 0) {
        toast.error('Select at least one photo to share');
        return null;
      }

      const request = (async () => {
        const res = await fetch('/api/photos/share-packs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            photoIds: ids,
            title: opts.title?.trim() || `Photos (${ids.length})`,
            expiresInDays: opts.expiresInDays,
          }),
        });
        const data = (await res.json().catch(() => null)) as { shareUrl?: string; error?: string } | null;
        if (!res.ok || !data?.shareUrl) throw new Error(data?.error || 'Failed to create share page');
        return data.shareUrl;
      })();
      // Before any await: this is still the operator's press.
      const copied = copyToClipboardWhenReady(request, { historyKind: 'photo-share-page' });

      setIsLoading(true);
      setReady(null);
      try {
        const shareUrl = await request;
        const next: PhotoShareReady = {
          kind: 'page',
          count: ids.length,
          text: shareUrl,
          url: shareUrl,
          expiresInLabel: null,
          copied: await copied,
          skipped: 0,
        };
        setReady(next);
        return next;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create share page');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const dismissReady = useCallback(() => setReady(null), []);

  /** Download the selection as a single ZIP via the existing `GET /api/photos/download-zip` (a session-protected attachment response). */
  const downloadZip = useCallback((photoIds: number[], opts: { title?: string } = {}) => {
    const ids = [...new Set(photoIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (ids.length === 0) {
      toast.error('Select at least one photo to download');
      return;
    }
    const params = new URLSearchParams({ ids: ids.join(',') });
    if (opts.title?.trim()) params.set('title', opts.title.trim());
    const link = document.createElement('a');
    link.href = `/api/photos/download-zip?${params.toString()}`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Preparing ZIP of ${ids.length} photo${ids.length === 1 ? '' : 's'}…`);
  }, []);

  return { generateAndCopy, createSharePage, downloadZip, isLoading, ready, dismissReady };
}
