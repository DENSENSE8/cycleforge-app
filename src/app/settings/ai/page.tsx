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
import { getAiUsageMarginPercent, summarizeAiUsage, type AiUsageSummaryRow } from '@/lib/ai/usage';
import { applyMarginMicrocents, microcentsToUsd } from '@/lib/ai/model-pricing';
import type { OrgId } from '@/lib/tenancy/constants';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';
import { AiProviderOrderCard } from '@/components/settings/sections/AiProviderOrderCard';

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  ai_gateway: 'Vercel AI Gateway (your key)',
  openai: 'OpenAI (your key)',
  anthropic: 'Anthropic (your key)',
  ollama: 'Self-hosted endpoint (yours)',
  platform: 'Platform default (metered)',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function contextLabel(context: string): string {
  if (context === 'ask_ai') return 'Ask AI';
  if (context === 'query_embed') return 'Search queries';
  return 'Index embedding';
}

const USAGE_COLUMNS: DataTableColumn<AiUsageSummaryRow>[] = [
  {
    key: 'use',
    header: 'Use',
    type: 'text',
    cell: (row) => <span className="font-semibold">{contextLabel(row.context)}</span>,
  },
  {
    key: 'provider',
    header: 'Provider',
    type: 'text',
    cell: (row) => sourceLabel(row.provider),
  },
  {
    key: 'model',
    header: 'Model',
    type: 'id',
    cell: (row) => <span className="font-mono text-role-micro">{row.model}</span>,
  },
  {
    key: 'calls',
    header: 'Calls',
    type: 'number',
    cell: (row) => row.calls.toLocaleString(),
  },
  {
    key: 'tokens',
    header: 'Tokens in / out',
    type: 'number',
    cell: (row) => `${row.inputTokens.toLocaleString()} / ${row.outputTokens.toLocaleString()}`,
  },
  {
    key: 'cost',
    header: 'Est. cost',
    type: 'number',
    cell: (row) => (
      <span className="font-semibold">
        {microcentsToUsd(row.costMicrocents)}
        {row.unknownRateCalls > 0 ? ' *' : ''}
      </span>
    ),
  },
];

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

          <DataTable
            columns={USAGE_COLUMNS}
            rows={summary}
            rowKey={(row) => `${row.context}:${row.provider}:${row.model}`}
            empty={
              <div className="px-4 py-6 text-center text-role-caption font-medium text-text-soft">
                No AI usage recorded in this window yet — usage appears here as staff search.
              </div>
            }
          />
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
