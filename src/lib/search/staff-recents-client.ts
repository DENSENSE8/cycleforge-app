'use client';

/**
 * Client writer for the per-staff DB recents store (`search_recents`).
 *
 * **Why this exists.** `POST /api/search/recents` and the `pushStaffRecent`
 * domain helper behind it had ZERO callers as of 2026-08-21 — the route was
 * live, permission-gated and tested, and nothing in the app had invoked it
 * since `GlobalFindCombobox`'s `presentation="stage"` path was deleted. The
 * only surviving recents writer was `useSearchRecents`, which is localStorage
 * (`cf_search_recents_v1`) and per-browser.
 *
 * The `/search` rail reads the DB store. So the rail could only ever paint rows
 * left behind by the retired path — the same 89 dead rows whose stale
 * `scope_label` produced the "Search" caption under every row. An operator's
 * own searches never entered their rail, and nothing errored: a GET against a
 * table nobody writes returns 200 and a frozen list.
 *
 * Two stores for one job is its own problem and is NOT settled here (see
 * `docs/todo/search-unbox-parity-teardown-HANDOFF.md` §4) — this restores the
 * writer so the surface is honest, rather than deleting a store mid-audit.
 *
 * **Fire-and-forget by contract.** Recording a recent is bookkeeping behind a
 * navigation the operator already made; it must never delay, block or fail that
 * navigation. Errors are swallowed on purpose.
 */

import type { SearchRecentEntry } from '@/lib/search/search-recents';

/** Prefix key for the `/search` rail feed — invalidate to wake an open rail. */
export const SEARCH_RECENTS_RAIL_KEY_PREFIX = 'search.recents.rail' as const;

export interface PushStaffRecentClientInput {
  query: string;
  scope?: string;
  scopeHref?: string;
  resultCount?: number;
  topHit?: SearchRecentEntry['topHit'];
}

/**
 * Record (or MRU-bump) a query in the DB recents store. Never throws, never
 * awaited by a navigation path.
 *
 * `scopeLabel` is deliberately NOT sent. The column is a snapshot that outlives
 * the surface that wrote it, and `staff-recents.ts` re-resolves the label from
 * `scope` on every read — sending one would only re-seed the exact staleness
 * that fix removed.
 */
export function pushStaffRecentClient(input: PushStaffRecentClientInput): void {
  const query = input.query.trim();
  if (!query) return;
  void fetch('/api/search/recents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      scope: input.scope,
      scopeHref: input.scopeHref,
      resultCount: input.resultCount,
      topHit: input.topHit,
    }),
  }).catch(() => {});
}
