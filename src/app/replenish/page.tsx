import { redirect } from 'next/navigation';

/** Replenish moved into the inventory page as a section toggle. */
export default async function ReplenishRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined): string | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const params = new URLSearchParams();
  params.set('section', 'replenish');

  const tab = first(sp.tab);
  // 'incoming' no longer exists — fall back to the default 'need' tab.
  if (tab === 'fifo') params.set('rtab', 'fifo');
  else if (tab === 'need') params.set('rtab', 'need');

  const sku = first(sp.sku);
  if (sku) params.set('rsku', sku);

  const status = first(sp.status);
  if (status) params.set('rstatus', status);

  redirect(`/inventory?${params.toString()}`);
}
