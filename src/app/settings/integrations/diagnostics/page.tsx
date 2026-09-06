import { redirect } from 'next/navigation';

/**
 * `/settings/integrations/diagnostics` → `/apps/diagnostics`
 * (marketplace promotion, 2026-09-06). Search params ride.
 */
export default async function SettingsDiagnosticsRedirect({
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
  redirect(query ? `/apps/diagnostics?${query}` : '/apps/diagnostics');
}
