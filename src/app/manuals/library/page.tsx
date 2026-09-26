import { redirect } from 'next/navigation';

/** `/manuals/library` was a second, bookmark-only copy of the manuals library — its own sidebar fork (`manuals-library-sidebar/*`) with a… */
export default async function ManualsLibraryRedirectPage({
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
  qs.set('view', 'manuals');
  redirect(`/products?${qs.toString()}`);
}
