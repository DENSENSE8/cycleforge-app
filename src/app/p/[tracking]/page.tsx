import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/neon-client';

/** /p/[tracking] — short-URL landing for a package / carrier tracking number. */
export default async function PackageScanLandingPage({
  params,
}: {
  params: Promise<{ tracking: string }>;
}) {
  const { tracking } = await params;
  const cleaned = decodeURIComponent(tracking || '').trim();
  if (!cleaned) redirect('/shipped');

  try {
    // Resolve via normalized form so URL/QR variants all converge.
    const row = await queryOne<{ id: number }>`
      SELECT id FROM shipping_tracking_numbers
       WHERE tracking_number_normalized = UPPER(REGEXP_REPLACE(${cleaned}, '[^A-Za-z0-9]', '', 'g'))
       LIMIT 1
    `;
    if (row?.id) {
      redirect(`/shipped?tracking=${encodeURIComponent(cleaned)}`);
    }
  } catch {
    /* fall through */
  }
  redirect(`/shipped?tracking=${encodeURIComponent(cleaned)}`);
}
