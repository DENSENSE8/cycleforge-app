import { redirect } from 'next/navigation';

/**
 * `/manuals/library` was a second, bookmark-only copy of the manuals library —
 * its own sidebar fork (`manuals-library-sidebar/*`) with a duplicated folder
 * tree, badge helpers and fuzzy matcher, around the same `ManualLibrary` body
 * that `/products?view=manuals` already renders. The fork was deleted
 * 2026-08-01; this shell stays so existing bookmarks land on the real surface
 * instead of a 404, exactly as `/manuals` does one level up.
 *
 * `?id=` survives the hop: it is declared on `PRODUCTS_ROUTE_PARAMS`, so
 * `SurfaceParamHygiene` no longer strips the selected manual (it did until the
 * same day, which is the only reason this route looked like the working one).
 */
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
