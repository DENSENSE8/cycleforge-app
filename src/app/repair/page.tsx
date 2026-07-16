import { redirect } from 'next/navigation';
import { walkInStationHref } from '@/lib/walk-in/jobs';

/**
 * Legacy /repair route — redirects to Receiving Walk-In repair job.
 * Preserves tab, search, openRepair, and new params.
 */
export default async function RepairPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;
  const extra: Record<string, string | null | undefined> = {};
  for (const [key, value] of Object.entries(resolved || {})) {
    if (typeof value === 'string') extra[key] = value;
  }
  // Drop legacy mode=repairs — station uses job=repair.
  delete extra.mode;
  redirect(walkInStationHref('repair', extra));
}
