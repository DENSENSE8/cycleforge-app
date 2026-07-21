'use client';

/**
 * Single owner of Dashboard Search exact-match resolution.
 *
 * Collapses the three formerly-racing auto-open paths (main-pane identifier
 * effect, main-pane sole-hit `onResults`, sidebar auto-open) plus the double
 * `resolveSearchOrder` (view + detail view) into one deterministic pipeline:
 *
 *   openOrderId? ─┐
 *   identifier q? ─┴─▶ resolveSearchOrder(target) ─▶ order | fba | notfound | list
 *
 * The `resolving` phase lets the main pane show a single spinner instead of
 * flashing the cross-entity results list before the detail paints — an
 * identifier / order-# query goes spinner → detail, never spinner → list →
 * detail. Natural-language queries have no `target` and land straight on
 * `list` (their sole-hit convenience open stays in the view's `onResults`).
 *
 * Canonicalize (human # → numeric id) keeps the painted order across the URL
 * replace via `paintedRef`, so there is no Loading↔empty flash mid-canonical.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShippedOrder } from '@/types/orders';
import { looksLikeIdentifier, orderSearchHref } from '@/lib/search/search-hit';
import { resolveSearchOrder } from '@/lib/search/resolve-search-order';

type DashboardSearchOrderPhase =
  | { phase: 'list' }
  | { phase: 'resolving' }
  | { phase: 'order'; order: ShippedOrder }
  | { phase: 'fba' }
  | { phase: 'notfound'; ref: string };

type Outcome =
  | { kind: 'resolving' }
  | { kind: 'order'; order: ShippedOrder }
  | { kind: 'fba' }
  | { kind: 'notfound'; ref: string }
  /** Identifier that resolved to a non-order (Zoho PO / tracking) → results list. */
  | { kind: 'list' };

export function useDashboardSearchOrder({
  q,
  openOrderId,
}: {
  q: string;
  openOrderId: string;
}): DashboardSearchOrderPhase {
  const router = useRouter();

  // The token we must resolve to an order. An explicit `openOrderId` wins;
  // otherwise an identifier-shaped query (order #, tracking, serial) resolves
  // eagerly so exact matches open detail without waiting on retrieve. A
  // natural-language query has no target → the view shows the results list.
  const target = (openOrderId || (looksLikeIdentifier(q) ? q.trim() : '')).trim();

  const [state, setState] = useState<{ forTarget: string; outcome: Outcome }>({
    forTarget: '',
    outcome: { kind: 'resolving' },
  });
  /** Already-painted order — skip blank/refetch across human→numeric canonicalize. */
  const paintedRef = useRef<{ id: number; orderId: string; order: ShippedOrder } | null>(null);

  useEffect(() => {
    if (!target) return; // list mode — nothing to resolve
    let cancelled = false;

    const painted = paintedRef.current;
    if (painted && (target === String(painted.id) || target === painted.orderId)) {
      // Same order across a human→numeric canonicalize; keep the painted detail.
      setState({ forTarget: target, outcome: { kind: 'order', order: painted.order } });
      if (openOrderId && openOrderId !== String(painted.id)) {
        router.replace(orderSearchHref(painted.id, q));
      }
      return;
    }

    setState({ forTarget: target, outcome: { kind: 'resolving' } });

    void (async () => {
      const next = await resolveSearchOrder(target);
      if (cancelled) return;

      if (next.status === 'ok') {
        paintedRef.current = {
          id: next.order.id,
          orderId: String(next.order.order_id || '').trim(),
          order: next.order,
        };
        setState({ forTarget: target, outcome: { kind: 'order', order: next.order } });
        // Canonicalize URL → numeric openOrderId (deep-link + sidebar highlight).
        if (openOrderId !== String(next.order.id)) {
          router.replace(orderSearchHref(next.order.id, q));
        }
        return;
      }

      paintedRef.current = null;

      // Identifier query with no explicit openOrderId: a miss means the token
      // may be a receiving PO / tracking / non-order id — fall to the
      // cross-entity results list rather than dead-ending on "not found".
      if (!openOrderId) {
        setState({ forTarget: target, outcome: { kind: 'list' } });
        return;
      }

      // An explicit openOrderId that failed:
      if (next.status === 'notfound') {
        const qTrim = q.trim();
        const isNumericPk = /^\d+$/.test(openOrderId.trim());
        // Human # / tracking false-open → drop openOrderId and show the list.
        // A numeric pk (from a real hit) stays on the empty shell — redirecting
        // would clear openOrderId and re-trigger a resolve→flash loop.
        if (qTrim && !isNumericPk) {
          router.replace(`/dashboard?mode=search&q=${encodeURIComponent(qTrim)}&map=search`);
          return;
        }
        setState({ forTarget: target, outcome: { kind: 'notfound', ref: openOrderId } });
        return;
      }

      setState({ forTarget: target, outcome: { kind: 'fba' } });
    })();

    return () => {
      cancelled = true;
    };
  }, [target, openOrderId, q, router]);

  if (!target) return { phase: 'list' };
  // Outcome belongs to a stale target (query just changed) → keep the spinner
  // instead of flashing the previous order.
  if (state.forTarget !== target) return { phase: 'resolving' };

  switch (state.outcome.kind) {
    case 'order':
      return { phase: 'order', order: state.outcome.order };
    case 'fba':
      return { phase: 'fba' };
    case 'notfound':
      return { phase: 'notfound', ref: state.outcome.ref };
    case 'list':
      return { phase: 'list' };
    case 'resolving':
    default:
      return { phase: 'resolving' };
  }
}
