import { redirect } from 'next/navigation';

/** `/manuals` was folded into `/products` as the default Manuals view. */
export default async function ManualsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.set(key, value);
  }
  const query = qs.toString();
  redirect(query ? `/products?${query}` : '/products');
}
