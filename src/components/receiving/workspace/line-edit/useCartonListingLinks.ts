'use client';

/** Client waist for the DURABLE carton listing links (`receiving_listing_links` via `/api/receiving/[id]/listing-links`). */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredListingLink } from '@/lib/receiving/listing-link-store';

/**
 * The row shape is the STORE's own type (type-only import — erased at build, so
 * no server graph follows it here). One shape for the row the API returns and
 * the row the writer produces; a client-local twin would be free to drift.
 */
export type CartonListingLinkRow = StoredListingLink;

interface CartonListingLinksApi {
  /** False when there is no carton to write against — render read-only. */
  supported: boolean;
  rows: CartonListingLinkRow[];
  loading: boolean;
  /** Last write failure, already humanized. Cleared by the next write. */
  error: string | null;
  create: (href: string, label?: string | null) => Promise<CartonListingLinkRow | null>;
  update: (id: number, patch: { href?: string; label?: string | null }) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  /** Every durable row on this carton. Returns false if any delete refused. */
  removeAll: () => Promise<boolean>;
  reorder: (orderedIds: number[]) => Promise<boolean>;
  reload: () => void;
}

const ERROR_COPY: Record<string, string> = {
  INVALID_HREF: 'That is not a valid http(s) URL.',
  DUPLICATE_HREF: 'This carton already has that link.',
  NOT_FOUND: 'That link is gone — reloading.',
  CARTON_NOT_FOUND: 'That carton is gone — reloading.',
  BIND_REQUIRES_STAFF: 'Sign in again to bind a link to a line.',
  NOTHING_TO_UPDATE: 'Nothing changed.',
};

export function useCartonListingLinks(receivingId: number | null | undefined): CartonListingLinksApi {
  const supported = Number.isFinite(Number(receivingId));
  const [rows, setRows] = useState<CartonListingLinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // A carton switch mid-flight must not paint the previous box's links.
  const requestRef = useRef(0);
  /** Latest rows for callbacks that must not re-create as the list shrinks. */
  const rowsRef = useRef<CartonListingLinkRow[]>([]);

  const base = supported ? `/api/receiving/${receivingId}/listing-links` : null;

  useEffect(() => {
    if (!base) {
      setRows([]);
      return;
    }
    const seq = ++requestRef.current;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(base);
        const body = await res.json().catch(() => ({}));
        if (cancelled || seq !== requestRef.current) return;
        setRows(Array.isArray(body?.links) ? body.links : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        // Always clear the flag, even for a superseded request:
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, nonce]);

  // Mirror in an effect, never during render: a ref write in the render body
  // is a side effect React is free to discard or replay under concurrency.
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const fail = useCallback((body: { error?: string } | null) => {
    const code = body?.error ?? '';
    setError(ERROR_COPY[code] ?? 'That write did not go through.');
    return false;
  }, []);

  const create = useCallback(
    async (href: string, label?: string | null) => {
      if (!base) return null;
      setError(null);
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ href, label: label ?? null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.link) {
        fail(body);
        return null;
      }
      // A GET issued before this write must not paint over it when it lands.
      requestRef.current += 1;
      setRows((prev) => [...prev, body.link as CartonListingLinkRow]);
      return body.link as CartonListingLinkRow;
    },
    [base, fail],
  );

  const update = useCallback(
    async (id: number, patch: { href?: string; label?: string | null }) => {
      if (!base) return false;
      setError(null);
      const res = await fetch(`${base}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ href: patch.href, label: patch.label }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.link) return fail(body);
      requestRef.current += 1;
      setRows((prev) => prev.map((r) => (r.id === id ? (body.link as CartonListingLinkRow) : r)));
      return true;
    },
    [base, fail],
  );

  const remove = useCallback(
    async (id: number) => {
      if (!base) return false;
      setError(null);
      const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) return fail(body);
      requestRef.current += 1;
      setRows((prev) => prev.filter((r) => r.id !== id));
      return true;
    },
    [base, fail],
  );

  /**
   * Sequential, not Promise.all: each DELETE is its own row and a failure
   * halfway through must leave the survivors on screen rather than blank the
   * list on optimism. The rows that did delete are already gone from state.
   */
  const removeAll = useCallback(async () => {
    if (!base) return false;
    const targets = rowsRef.current;
    let failed = 0;
    for (const row of targets) {
      // eslint-disable-next-line no-await-in-loop -- one row at a time, see above
      const ok = await remove(row.id);
      if (!ok) failed += 1;
    }
    // Each `remove` clears the error on entry, so a failure early in the loop
    // would be wiped by the next iteration's success. Report the run's own
    // outcome once, after it finishes.
    if (failed > 0) {
      setError(
        failed === targets.length
          ? 'None of those links could be deleted.'
          : `${failed} of ${targets.length} links could not be deleted.`,
      );
    }
    return failed === 0;
  }, [base, remove]);

  const reorder = useCallback(
    async (orderedIds: number[]) => {
      if (!base) return false;
      setError(null);
      // Paint the new order first — the server answer is the same sequence.
      setRows((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as CartonListingLinkRow[];
        return [...next, ...prev.filter((r) => !orderedIds.includes(r.id))];
      });
      const res = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        reload();
        return fail(body);
      }
      if (Array.isArray(body?.links)) setRows(body.links);
      return true;
    },
    [base, fail, reload],
  );

  return { supported, rows, loading, error, create, update, remove, removeAll, reorder, reload };
}
