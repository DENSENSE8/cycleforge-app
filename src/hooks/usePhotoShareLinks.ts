'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  formatShareLinksText,
  formatUriList,
  type ShareLinkLine,
} from '@/lib/photos/share-link-format';

/** Shape returned by POST /api/photos/share. */
interface ShareApiResponse {
  links: Array<ShareLinkLine & { photoId: number; kind: 'signed' | 'proxy'; expiresAt: string | null }>;
  expiresAt: string | null;
  missingIds: number[];
  groupUrl: string | null;
}

interface ShareLinksOutcome {
  /** The formatted, clipboard-ready text block. */
  text: string;
  /** `text/uri-list` payload (one URL per line). */
  uriList: string;
  response: ShareApiResponse;
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

/** `usePhotoShareLinks` — generate temporary share URLs for a set of photo ids, copy the formatted block to the clipboard, and toast the… */
export function usePhotoShareLinks() {
  const [isLoading, setIsLoading] = useState(false);

  /** POST the ids, format + copy the result, toast success/failure. */
  const generateAndCopy = useCallback(
    async (photoIds: number[], opts: { ttlSeconds?: number } = {}): Promise<ShareLinksOutcome | null> => {
      const ids = [...new Set(photoIds.filter((id) => Number.isFinite(id) && id > 0))];
      if (ids.length === 0) {
        toast.error('Select at least one photo to share');
        return null;
      }

      setIsLoading(true);
      const toastId = toast.loading(
        `Generating ${ids.length} share link${ids.length === 1 ? '' : 's'}…`,
      );

      try {
        const res = await fetch('/api/photos/share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ photoIds: ids, ttlSeconds: opts.ttlSeconds }),
        });
        const data = (await res.json().catch(() => null)) as ShareApiResponse | { error?: string } | null;
        if (!res.ok || !data || !('links' in data)) {
          const message = (data as { error?: string } | null)?.error || 'Failed to generate share links';
          throw new Error(message);
        }

        const text = formatShareLinksText(data.links, {
          groupUrl: data.groupUrl,
          expiresInLabel: expiresInLabel(data.expiresAt),
        });
        const uriList = formatUriList(data.links);

        // Copy to clipboard.
        let copied = true;
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          copied = false;
        }

        const signed = data.links.filter((l) => l.kind === 'signed').length;
        const note = data.missingIds.length
          ? ` · ${data.missingIds.length} skipped (not found)`
          : '';
        toast.success(
          copied
            ? `Copied ${data.links.length} share link${data.links.length === 1 ? '' : 's'}${note}`
            : `Generated ${data.links.length} link${data.links.length === 1 ? '' : 's'} — press Ctrl/⌘+V to paste${note}`,
          {
            id: toastId,
            description:
              signed < data.links.length
                ? `${data.links.length - signed} link(s) are session-only (not GCS-backed).`
                : undefined,
          },
        );

        return { text, uriList, response: data };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to generate share links', {
          id: toastId,
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /** Create a durable, public share *page* for the selection (vs. */
  const createSharePage = useCallback(
    async (
      photoIds: number[],
      opts: { title?: string; expiresInDays?: number } = {},
    ): Promise<{ shareUrl: string } | null> => {
      const ids = [...new Set(photoIds.filter((id) => Number.isFinite(id) && id > 0))];
      if (ids.length === 0) {
        toast.error('Select at least one photo to share');
        return null;
      }

      setIsLoading(true);
      const toastId = toast.loading('Creating share page…');
      try {
        const res = await fetch('/api/photos/share-packs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            photoIds: ids,
            title: opts.title?.trim() || `Photos (${ids.length})`,
            expiresInDays: opts.expiresInDays,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { shareUrl?: string; error?: string }
          | null;
        if (!res.ok || !data?.shareUrl) {
          throw new Error(data?.error || 'Failed to create share page');
        }
        let copied = true;
        try {
          await navigator.clipboard.writeText(data.shareUrl);
        } catch {
          copied = false;
        }
        toast.success(
          copied ? 'Share page link copied' : 'Share page created — press Ctrl/⌘+V to paste',
          { id: toastId, description: data.shareUrl },
        );
        return { shareUrl: data.shareUrl };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create share page', {
          id: toastId,
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

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

  return { generateAndCopy, createSharePage, downloadZip, isLoading };
}
