/**
 * The contextual sidebar's HTTP client — framework-free, so the web shell and
 * the Tauri app call the same routes and parse the same shapes. Every call is
 * same-origin with the session cookie; nothing here reads React state.
 */

import { z } from 'zod';
import {
  NavContextSchema,
  NavFacetsResponseSchema,
  NavFulfilledResponseSchema,
  NavLocateResponseSchema,
  NavPurchasesResponseSchema,
  NavRecentRowSchema,
  type NavContext,
  type NavFacetsResponse,
  type NavFulfilledResponse,
  type NavLocateResponse,
  type NavPurchasesResponse,
  type NavLocateScope,
  type NavRecentRow,
  type NavRecents,
} from './schema';

export class NavHttpError extends Error {
  constructor(
    readonly status: number,
    readonly route: string,
  ) {
    super(`${route} → ${status}`);
    this.name = 'NavHttpError';
  }
}

async function getJson(url: string, signal?: AbortSignal, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { credentials: 'same-origin', signal, ...init });
  if (!res.ok) throw new NavHttpError(res.status, url.split('?')[0] ?? url);
  return res.json();
}

/** Past this many characters a pasted list leaves the URL for a POST body (cookies + request line stay well under the 16KB header cap). */
const NAV_LOCATE_GET_MAX_REFS_CHARS = 2048;

/** `GET /api/nav/context?path=` — `view: 'top'` is the `‹` peek. */
export async function fetchNavContext(
  path: string,
  options: { view?: 'top'; signal?: AbortSignal } = {},
): Promise<NavContext> {
  const qs = new URLSearchParams({ path });
  if (options.view) qs.set('view', options.view);
  return NavContextSchema.parse(await getJson(`/api/nav/context?${qs}`, options.signal));
}

/**
 * `GET /api/nav/facets?context=…&<current params>`. `search` is the page's
 * own query string; `context` is appended last so a stray page param of the
 * same name can never shadow it.
 */
export async function fetchNavFacets(
  facetContext: string,
  search: string,
  signal?: AbortSignal,
): Promise<NavFacetsResponse> {
  const qs = new URLSearchParams(search);
  qs.delete('context');
  qs.set('context', facetContext);
  return NavFacetsResponseSchema.parse(await getJson(`/api/nav/facets?${qs}`, signal));
}

/**
 * `/api/nav/locate` — where identifiers live. `q` = the field's text (bucket
 * counts only); `refs` = a pasted list (one entry per ref). A long list is a
 * POST (same answer, same gate) so it never outgrows the URL.
 */
export async function fetchNavLocate(
  scope: NavLocateScope,
  input: { q: string } | { refs: readonly string[] },
  signal?: AbortSignal,
): Promise<NavLocateResponse> {
  const qs = new URLSearchParams({ locator: scope });
  if ('q' in input) qs.set('q', input.q);
  else {
    const refs = input.refs.join(',');
    if (refs.length > NAV_LOCATE_GET_MAX_REFS_CHARS) {
      return NavLocateResponseSchema.parse(
        await getJson('/api/nav/locate', signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locator: scope, refs: input.refs }),
        }),
      );
    }
    qs.set('refs', refs);
  }
  return NavLocateResponseSchema.parse(await getJson(`/api/nav/locate?${qs}`, signal));
}

/** `GET /api/nav/purchases?<params>` — Receiving › Purchasing (`NavPurchasesQuery` names the params). */
export async function fetchNavPurchases(params: URLSearchParams, signal?: AbortSignal): Promise<NavPurchasesResponse> {
  return NavPurchasesResponseSchema.parse(await getJson(`/api/nav/purchases?${params}`, signal));
}

/** `GET /api/nav/fulfilled?<params>` — Fulfillment › Fulfilled (`NavFulfilledQuery` names the params; `fulfilledApiParams` builds them). */
export async function fetchNavFulfilled(params: URLSearchParams, signal?: AbortSignal): Promise<NavFulfilledResponse> {
  return NavFulfilledResponseSchema.parse(await getJson(`/api/nav/fulfilled?${params}`, signal));
}

const NavRecentsResponseSchema = z.object({
  surface: z.string(),
  rows: z.array(NavRecentRowSchema),
  nextBefore: z.string().nullable(),
});

export interface NavRecentsPage {
  rows: NavRecentRow[];
  nextBefore: string | null;
}

/** `GET <recents.endpoint>` — the endpoint already carries `surface=`; `before` / `q` page and narrow a `paged` / `find` surface. */
export async function fetchNavRecents(
  endpoint: string,
  options: { before?: string | null; q?: string; signal?: AbortSignal } = {},
): Promise<NavRecentsPage> {
  const url = new URL(endpoint, 'http://nav.local');
  if (options.before) url.searchParams.set('before', options.before);
  if (options.q?.trim()) url.searchParams.set('q', options.q.trim());
  const { rows, nextBefore } = NavRecentsResponseSchema.parse(
    await getJson(`${url.pathname}${url.search}`, options.signal),
  );
  return { rows, nextBefore };
}

/** One row verb against the feed owner's route (`NavRecents.rowActions`). `restore` undoes a `delete`. */
export async function runNavRecentRowVerb(
  rowActions: NonNullable<NavRecents['rowActions']>,
  entityId: string,
  verb: { kind: 'rename'; title: string } | { kind: 'delete' } | { kind: 'restore' },
): Promise<void> {
  const url = rowActions.endpoint.replace('{id}', encodeURIComponent(entityId));
  const body = verb.kind === 'rename' ? { title: verb.title } : verb.kind === 'restore' ? { restore: true } : null;
  const res = await fetch(url, {
    method: verb.kind === 'delete' ? 'DELETE' : 'PATCH',
    credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new NavHttpError(res.status, url);
}

/** `POST /api/nav/recents` — upsert-on-open for `nav_recents`-backed surfaces. */
export async function postNavRecent(input: {
  surface: string;
  entityType: string;
  entityId: string;
  label: string;
}): Promise<void> {
  const res = await fetch('/api/nav/recents', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new NavHttpError(res.status, '/api/nav/recents');
}
