import { redirect } from 'next/navigation';

/**
 * `/settings/integrations/[provider]` → `/apps/[provider]`
 * (marketplace promotion, 2026-09-06). Search params ride.
 */
export default async function SettingsProviderRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { provider } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const query = qs.toString();
  redirect(query ? `/apps/${provider}?${query}` : `/apps/${provider}`);
}
