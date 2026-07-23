'use client';

/**
 * Single owner of Dashboard Search exact-match resolution.
 *
 * Collapses the three formerly-racing auto-open paths (main-pane identifier
 * effect, main-pane sole-hit `onResults`, sidebar auto-open) plus the double
 * `resolveSearchOrder` (view + detail view) into one deterministic pipeline:
 *
 *   openOrderId? ─┐
 *   identifier q? ─┴─▶ resolveSearchOrder(target)
 *                         ├─ order | fba | notfound
 *                         └─ miss + no openOrderId
 *                              └─ retrieve sole ORDER match? → resolve pk
 *                                 else → list (Zoho PO / multi / true miss)
 *
 * The `resolving` phase lets the main pane show a single spinner instead of
 * flashing the cross-entity results list before the detail paints —
 * identifier / order-# queries go spinner → detail, never spinner → list →
 * detail. Natural-language queries have no `target` and land straight on
 * `list` (their sole-hit convenience open stays in the view's `onResults`).
 *
 * Canonicalize (human # → numeric id) keeps the painted order across the URL
 * replace via `paintedRef`, so there is no Loading↔empty flash mid-canonical.
 * The render path reads `paintedRef` synchronously so a human→numeric URL
 * update never dips back through `resolving` (that was the visible flash
 * between the q-only URL and the openOrderId URL).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShippedOrder } from '@/types/orders';
import {
  looksLikeIdentifier,
  orderSearchHref,
  soleMatchingOrderHit,
} from '@/lib/search/search-hit';
import { resolveSearchOrder } from '@/lib/search/resolve-search-order';
import { postAiRetrieve } from '@/lib/search/ai-search-client';

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

type SearchMapMode = 'search' | 'recent';

function parseMap(raw: string | undefined): SearchMapMode {
  return raw === 'recent' ? 'recent' : 'search';
}

function sameOrderTarget(
  painted: { id: number; orderId: string },
  target: string,
): boolean {
  return target === String(painted.id) || target === painted.orderId;
}

/**
 * When `/api/orders/lookup` misses an identifier but hybrid retrieve finds
 * exactly one ORDER that matches the query, open that order — same outcome as
 * clicking the L2 sidebar hit, without forcing the operator to click.
 */
async function bridgeSoleOrderFromRetrieve(
  query: string,
  signal?: AbortSignal,
): Promise<ShippedOrder | null> {
  const data = await postAiRetrieve(query, {
    limit: 8,
    pageContext: '/dashboard',
    signal,
  });
  const match = soleMatchingOrderHit(data?.hits ?? [], query);
  if (!match) return null;
  const bridged = await resolveSearchOrder(String(match.id));
  return bridged.status === 'ok' ? bridged.order : null;
}

export function useDashboardSearchOrder({
  q,
  openOrderId,
  map: mapRaw,
}: {
  q: string;
  openOrderId: string;
  /** Preserve Recent|Search rail across canonicalize (default search). */
  map?: string;
}): DashboardSearchOrderPhase {
  const router = useRouter();
  const map = parseMap(mapRaw);

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

  const replaceOrderHref = (orderId: number, query: string) => {
    const href = orderSearchHref(orderId, query, { map });
    // Skip only when the live URL already matches — never gate on a sticky
    // "last replaced" ref (that blocks heal after something strips openOrderId).
    if (typeof window !== 'undefined') {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === href) return;
    }
    router.replace(href);
  };

  useEffect(() => {
    if (!target) return; // list mode — nothing to resolve
    let cancelled = false;
    const abort = new AbortController();

    const painted = paintedRef.current;
    if (painted && sameOrderTarget(painted, target)) {
      // Same order across a human→numeric canonicalize; keep the painted detail.
      setState({ forTarget: target, outcome: { kind: 'order', order: painted.order } });
      // Restore / canonicalize numeric openOrderId (also heals a stripped URL).
      if (openOrderId !== String(painted.id)) {
        replaceOrderHref(painted.id, q);
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
          replaceOrderHref(next.order.id, q);
        }
        return;
      }

      paintedRef.current = null;

      // Identifier query with no explicit openOrderId: lookup miss may still be
      // a sales order that retrieve finds (dual-engine gap). Bridge to sole
      // matching ORDER; otherwise fall to the cross-entity list (Zoho PO /
      // tracking / non-order id). Stay on `resolving` until the bridge settles
      // so the main pane never flashes "1 result" before detail.
      if (!openOrderId) {
        try {
          const bridged = await bridgeSoleOrderFromRetrieve(target, abort.signal);
          if (cancelled) return;
          if (bridged) {
            paintedRef.current = {
              id: bridged.id,
              orderId: String(bridged.order_id || '').trim(),
              order: bridged,
            };
            setState({ forTarget: target, outcome: { kind: 'order', order: bridged } });
            replaceOrderHref(bridged.id, q);
            return;
          }
        } catch {
          // AbortError or retrieve failure — fall through to list.
          if (cancelled) return;
        }
        if (cancelled) return;
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
          const listHref = `/dashboard?mode=search&q=${encodeURIComponent(qTrim)}&map=${map}`;
          if (typeof window !== 'undefined') {
            const current = `${window.location.pathname}${window.location.search}`;
            if (current === listHref) return;
          }
          router.replace(listHref);
          return;
        }
        setState({ forTarget: target, outcome: { kind: 'notfound', ref: openOrderId } });
        return;
      }

      setState({ forTarget: target, outcome: { kind: 'fba' } });
    })();

    return () => {
      cancelled = true;
      abort.abort();
    };
    // replaceOrderHref closes over map/q/router — listed via those deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stable replace helper
  }, [target, openOrderId, q, map, router]);

  if (!target) return { phase: 'list' };

  // Sync read: human→numeric canonicalize must not flash `resolving` between
  // the q-only URL and the openOrderId URL. paintedRef is the source of truth
  // for "same order, new target token".
  const painted = paintedRef.current;
  if (painted && sameOrderTarget(painted, target)) {
    return { phase: 'order', order: painted.order };
  }

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
