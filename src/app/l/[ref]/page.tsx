import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/neon-client';

/**
 * /l/[ref] — internal-URL landing for a bin/location. The ref segment may
 * be either a barcode or a location name; we accept both. Redirects to
 * /inventory?bin={barcode} when the location resolves.
 *
 * PRINTED ON PHYSICAL STICKERS — the `/l/…` form is on boxes already in the
 * warehouse, so this route's existence and its accepted refs are frozen. Only
 * the destination moved (2026-08-21): it used to emit `/inventory/location/…`,
 * a page whose whole body was a second `redirect()` onto this query form, then
 * a `next.config.ts` 308 after that page was deleted. Same final URL, one hop.
 *
 * Part of Phase 1 of the inventory v2 plan (GS1 + internal short-URL scan
 * resolution). Phase 4+ will replace the redirect with a richer landing
 * that shows bin contents + allowed actions per role.
 */
export default async function LocationScanLandingPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const cleaned = decodeURIComponent(ref || '').trim();
  if (!cleaned) redirect('/inventory');

  try {
    const row = await queryOne<{ barcode: string | null }>`
      SELECT barcode FROM locations
       WHERE barcode = ${cleaned} OR name = ${cleaned}
       LIMIT 1
    `;
    const barcode = row?.barcode?.trim();
    if (barcode) {
      redirect(`/inventory?bin=${encodeURIComponent(barcode)}`);
    }
  } catch {
    /* fall through */
  }
  redirect('/inventory');
}
