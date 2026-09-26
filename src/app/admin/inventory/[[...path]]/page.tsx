import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** `/admin/inventory/**` — DISSOLVED. */
const MOVED_SEGMENTS: Record<string, true> = {
  'cycle-counts': true,
  holds: true,
  returns: true,
  'bulk-allocate': true,
  throughput: true,
  events: true,
};

export default async function LegacyInventoryAdminRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = await params;
  const segments = (path ?? []).filter(Boolean);
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value)) for (const v of value) qs.append(key, v);
  }
  const query = qs.toString();
  const withQuery = (base: string) => {
    if (!query) return base;
    return `${base}${base.includes('?') ? '&' : '?'}${query}`;
  };

  const [head, ...rest] = segments;

  if (!head) redirect(withQuery('/inventory/health'));

  if (head === 'units') {
    const ref = decodeURIComponent(rest[0] ?? '').trim();
    redirect(ref ? `/inventory?unit=${encodeURIComponent(ref)}` : '/inventory');
  }

  if (head === 'sku') {
    const sku = decodeURIComponent(rest[0] ?? '').trim();
    redirect(
      sku
        ? withQuery(`/inventory/health/sku/${encodeURIComponent(sku)}`)
        : withQuery('/inventory/health'),
    );
  }

  if (MOVED_SEGMENTS[head]) {
    const tail = rest.map((segment) => encodeURIComponent(segment)).join('/');
    redirect(withQuery(`/inventory/${head}${tail ? `/${tail}` : ''}`));
  }

  redirect(withQuery('/inventory/health'));
}
