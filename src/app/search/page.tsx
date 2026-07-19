/**
 * /search — legacy bookmark. Cross-entity search now lives on Dashboard Search
 * mode (`/dashboard?mode=search`). Preserve `q` + `type` for old links.
 */

import { redirect } from 'next/navigation';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = new URLSearchParams();
  next.set('mode', 'search');
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  const type = typeof sp.type === 'string' ? sp.type : undefined;
  if (q) next.set('q', q);
  if (type && type !== 'all' && type !== 'order') next.set('type', type);
  redirect(`/dashboard?${next.toString()}`);
}
