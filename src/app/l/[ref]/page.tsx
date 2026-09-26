import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/neon-client';

/** /l/[ref] — internal-URL landing for a bin/location. */
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
      redirect(`/inventory/location/${encodeURIComponent(barcode)}`);
    }
  } catch {
    /* fall through */
  }
  redirect('/inventory');
}
