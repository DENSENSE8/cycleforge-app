'use client';

import { useEffect, useState } from 'react';
import { documentNetworkUrl } from '@/lib/documents/document-network-url';

interface FetchedDocumentObjectUrl {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/** Download document bytes (session cookies on same-origin routes) and expose a `blob:` object URL for an iframe. */
export function useFetchedDocumentObjectUrl(
  src: string | null | undefined,
): FetchedDocumentObjectUrl {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchUrl = documentNetworkUrl(src);
    const ac = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    setLoading(true);
    setError(null);

    void (async () => {
      const res = await fetch(fetchUrl, {
        credentials: 'include',
        cache: 'no-store',
        signal: ac.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Could not load file (${res.status})`);
      }
      const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (contentType.includes('json')) {
        throw new Error('File is not a document');
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: contentType || 'application/pdf' });
      objectUrl = URL.createObjectURL(blob);
      if (ac.signal.aborted) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setUrl(objectUrl);
      setLoading(false);
    })().catch((err: unknown) => {
      if (ac.signal.aborted) return;
      setUrl(null);
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Could not load file');
    });

    return () => {
      ac.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return { url, loading, error };
}
