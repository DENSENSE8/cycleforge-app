/**
 * /settings/ai — the tenant's AI & Search dashboard.
 *
 * Server component, gated admin.view (billing-page pattern). Everything is
 * resolved from the caller's org in the DB — the connected provider comes
 * from organization_integrations (vault rows), usage from ai_usage_events,
 * the margin from organizations.settings — never code constants.
 *
 * Shows: the provider CHAIN for chat/embeddings (preferred first, with the
 * fallbacks behind it), the order preference driving it, the usage + price
 * breakdown for the window, and where to connect providers.
 *
 * The card names the provider a call TRIES FIRST, not the one that served the
 * last turn — with failover those differ whenever the preferred provider is
 * demoted. Per-turn attribution is the `source` column in the usage table
 * below, which records whichever provider actually answered.
 */

import Link from 'next/link';
import { requirePermission } from '@/lib/auth/page-guard';
import { PageHeader } from '@/components/ui/pane-header';
import { resolveOrgAiChain, type OrgAiConfig } from '@/lib/ai/org-provider';
import { resolveAiProviderOrderForOrg } from '@/lib/ai/provider-order-deps';
import { getAiUsageMarginPercent, summarizeAiUsage } from '@/lib/ai/usage';
import { applyMarginMicrocents, microcentsToUsd } from '@/lib/ai/model-pricing';
import type { OrgId } from '@/lib/tenancy/constants';
import { AiUsageTable } from '@/components/settings/ai-usage/AiUsageTable';
import type { AiUsageTableRow } from '@/lib/ai/ai-usage-row';
import { AiProviderOrderCard } from '@/components/settings/sections/AiProviderOrderCard';

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  grok: 'Grok (SuperGrok subscription)',
  ai_gateway: 'Vercel AI Gateway (your key)',
  openai: 'OpenAI (your key)',
  anthropic: 'Anthropic (your key)',
  ollama: 'Self-hosted endpoint (yours)',
  platform: 'Platform default (metered)',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}


/*
  The six hand-written `AdminTableColumn` objects that used to live here are
  gone. Columns are DATA now: `field-catalog/ai-usage.ts` names the facts,
  `ai-usage-resolve.ts` reads them, and the shared engine paints them — so this
  page gained header sort, search and a Fields picker the second table engine was
  never going to grow for one surface.
*/

function ProviderCard({ title, chain, note }: { title: string; chain: OrgAiConfig[]; note?: string }) {
  const config = chain[0] ?? null;
  const fallbacks = chain.slice(1);
  return (
    <div className="space-y-1 rounded-none border border-border-soft bg-surface-card p-4">
      <p className="text-role-micro uppercase tracking-widest text-text-soft">{title}</p>
      {config ? (
        <>
          <p className="text-sm font-semibold text-text-default">{sourceLabel(config.source)}</p>
          <p className="truncate text-role-caption font-medium text-text-soft">
            {config.model} · via {new URL(config.baseURL).host}
          </p>
          {/* The fallbacks are the difference between local-first being a
              preference and being a single point of failure. Showing them is
              how an operator knows an outage will be survived. */}
          <p className="truncate text-role-caption font-medium text-text-soft">
            {fallbacks.length
              ? `Falls back to ${fallbacks.map((f) => sourceLabel(f.source)).join(' → ')}`
              : 'No fallback — this is the only connected provider.'}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-text-default">Not connected</p>
          <p className="text-role-caption font-medium text-text-soft">
            {note ?? 'Search falls back to keyword matching until a provider is connected.'}
          </p>
        </>
      )}
    </div>
  );
}

export default async function AiSettingsPage() {
  const user = await requirePermission('admin.view');
  const orgId = user.organizationId as OrgId;
  const days = 30;

  const [chatChain, embedChain, summary, marginPercent, providerOrder] = await Promise.all([
    resolveOrgAiChain(orgId, 'chat'),
    resolveOrgAiChain(orgId, 'embed'),
    summarizeAiUsage(orgId, days),
    getAiUsageMarginPercent(orgId),
    resolveAiProviderOrderForOrg(orgId),
  ]);

  const estimated = summary.reduce((sum, r) => sum + r.costMicrocents, 0);
  const platformCost = summary
    .filter((r) => r.provider === 'platform')
    .reduce((sum, r) => sum + r.costMicrocents, 0);
  const billed = applyMarginMicrocents(platformCost, marginPercent) + (estimated - platformCost);
  const totalCalls = summary.reduce((sum, r) => sum + r.calls, 0);
  const unknownRateCalls = summary.reduce((sum, r) => sum + r.unknownRateCalls, 0);

  /*
    Give each roll-up row a stable id at the boundary. The summary is a GROUP BY
    with no key of its own, and the engine needs one — the same tuple the retired
    display used for `rowKey`, named once instead of rebuilt in the mount.
  */
  const usageRows: AiUsageTableRow[] = summary.map((row) => ({
    key: `${row.context}:${row.provider}:${row.model}`,
    capability: row.capability,
    provider: row.provider,
    model: row.model,
    context: row.context,
    calls: row.calls,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costMicrocents: row.costMicrocents,
    unknownRateCalls: row.unknownRateCalls,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-canvas">
      <PageHeader title="AI & Search" maxWidth="5xl" />
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6">
        {/* Active providers */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
              Active providers ·{' '}
              {providerOrder === 'local-first' ? 'self-hosted first' : 'cloud first'}
            </p>
            <Link
              href="/settings/integrations"
              className="text-role-caption font-semibold text-blue-600 hover:underline"
            >
              Connect / manage providers →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ProviderCard
              title="Search embeddings (semantic search)"
              chain={embedChain}
              note="Keyword search keeps working; semantic ranking activates when a provider is connected."
            />
            <ProviderCard
              title="Ask AI (natural-language search)"
              chain={chatChain}
              note="The Ask AI action falls back to the classic chat page until connected."
            />
          </div>
          <p className="text-role-caption font-medium text-text-soft">
            Connect your own key under Integrations → Realtime &amp; AI (Vercel AI Gateway, OpenAI,
            Anthropic, or a self-hosted endpoint). Your key is encrypted at rest and used only for
            your organization. Without a key, your searches use the platform default and appear
            below as metered usage.
          </p>
        </section>

        {/* Order preference — which provider a call tries first. */}
        <section>
          <AiProviderOrderCard />
        </section>

        {/* Price breakdown */}
        <section className="space-y-3">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Usage &amp; pricing · last {days} days
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 rounded-none border border-border-soft bg-surface-card p-4">
              <p className="text-role-micro uppercase tracking-widest text-text-soft">AI calls</p>
              <p className="text-xl font-semibold text-text-default">{totalCalls.toLocaleString()}</p>
            </div>
            <div className="space-y-1 rounded-none border border-border-soft bg-surface-card p-4">
              <p className="text-role-micro uppercase tracking-widest text-text-soft">
                Estimated provider cost
              </p>
              <p className="text-xl font-semibold text-text-default">{microcentsToUsd(estimated)}</p>
            </div>
            <div className="space-y-1 rounded-none border border-border-soft bg-surface-card p-4">
              <p className="text-role-micro uppercase tracking-widest text-text-soft">
                Billed{marginPercent > 0 ? ` (cost + ${marginPercent}%)` : ''}
              </p>
              <p className="text-xl font-semibold text-text-default">{microcentsToUsd(billed)}</p>
              <p className="text-role-caption font-medium text-text-soft">
                Margin applies to platform-metered usage only — your own keys bill at your provider.
              </p>
            </div>
          </div>

          <AiUsageTable rows={usageRows} />
          {unknownRateCalls > 0 && (
            <p className="text-role-caption font-medium text-text-soft">
              * {unknownRateCalls.toLocaleString()} call(s) used a model without a published rate —
              tokens are counted, cost shown excludes them.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
