import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

/**
 * `/settings/integrations` → `/apps` (marketplace promotion, 2026-09-06).
 * The integrations tree moved to `src/app/apps`; this stub keeps every
 * bookmark, OAuth return, and onboarding step working. Search params ride.
 */
export const metadata: Metadata = { title: 'Apps' };

export default async function SettingsIntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const query = qs.toString();
  redirect(query ? `/apps?${query}` : '/apps');
}
