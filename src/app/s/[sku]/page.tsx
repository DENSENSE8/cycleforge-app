import { redirect } from 'next/navigation';

/**
 * /s/[sku] — short-URL landing for a SKU. Forwards to /inventory?sku={sku}.
 * The short form (/s/...) is encoded into printed SKU labels so the QR is
 * denser at the same scan reliability.
 *
 * PRINTED ON PHYSICAL STICKERS — this route and the refs it accepts are frozen.
 * Only the destination moved (2026-08-21): `/inventory/sku/{sku}` was a page
 * whose whole body was a second `redirect()` onto this query form, and a
 * `next.config.ts` 308 after it was deleted. Same final URL, one hop.
 */
export default async function SkuShortLandingPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const cleaned = decodeURIComponent(sku || '').trim();
  if (!cleaned) redirect('/inventory');
  redirect(`/inventory?sku=${encodeURIComponent(cleaned)}`);
}
