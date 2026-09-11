/**
 * /settings/integrations/[provider] — connection detail page.
 */
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';
import { getIntegrationSummary } from '@/lib/integrations/integration-summary';
import { isNangoConfigured } from '@/lib/integrations/nango';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { PROVIDER_CATALOG } from '../registry';
import { IntegrationDetailClient } from './IntegrationDetailClient';

export default async function IntegrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('admin.view');
  const { provider } = await params;
  const sp = await searchParams;
  const scope = typeof sp.scope === 'string' ? sp.scope : null;

  const def = PROVIDER_CATALOG.find((p) => p.key === provider);
  if (!def) notFound();

  const summary = await getIntegrationSummary(
    user.organizationId,
    provider as IntegrationProvider,
    scope,
  );
  if (!summary) notFound();

  const nangoReady = isNangoConfigured();

  return (
    <div className={cn('flex h-full min-h-0 flex-col antialiased', SETTINGS_FLOOR_CLASS)}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
          <SettingsSectionHeader
            title={`${def.label} connection`}
            backHref="/settings/integrations"
            backAriaLabel="Back to Apps & integrations"
          />
          <p className="text-role-caption text-text-soft">{def.description}</p>
          <IntegrationDetailClient def={def} summary={summary} nangoReady={nangoReady} />
        </div>
      </main>
    </div>
  );
}
