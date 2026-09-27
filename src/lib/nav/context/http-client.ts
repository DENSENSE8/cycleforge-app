/**
 * The contextual sidebar's HTTP client — framework-free, so the web shell and
 * the Tauri app call the same routes and parse the same shapes. Every call is
 * same-origin with the session cookie; nothing here reads React state.
 */

import { z } from 'zod';
import {
  NavContextSchema,
  NavFacetsResponseSchema,
  NavRecentRowSchema,
  type NavContext,
  type NavFacetsResponse,
  type NavRecentRow,
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

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { credentials: 'same-origin', signal });
  if (!res.ok) throw new NavHttpError(res.status, url.split('?')[0] ?? url);
  return res.json();
}

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

const NavRecentsResponseSchema = z.object({
  surface: z.string(),
  rows: z.array(NavRecentRowSchema),
});

/** `GET <recents.endpoint>` — the endpoint already carries `surface=`. */
export async function fetchNavRecents(
  endpoint: string,
  signal?: AbortSignal,
): Promise<NavRecentRow[]> {
  return NavRecentsResponseSchema.parse(await getJson(endpoint, signal)).rows;
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
