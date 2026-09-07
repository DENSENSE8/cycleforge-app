'use client';

/**
 * AutomationsMarketplace — the AI-first marketplace SHELL at /automations
 * (Phase 1). A single scrollable column: a hero with an intent search that
 * live-filters the two catalogs, the org's INSTALLED automations (observe-only
 * roll-ups from GET /api/automations), a DISCOVER grid of curated blueprints
 * (GET /api/studio/catalog) that studio.manage users install as drafts, and a
 * read-only CONNECTIONS grid (GET /api/integrations/composio/connections).
 *
 * Free browse, gated install: any studio.view user reaches this page; the
 * Install action only fires for a studio.manage user whose org is un-gated
 * (the `canManage` prop, resolved server-side in page.tsx). Observe-only v1 —
 * nothing here triggers or mutates a run.
 */

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Panel, SearchField, Spinner } from '@/design-system/primitives';
import { Boxes, Layers, Link2, Sparkles, Workflow } from '@/components/Icons';
import { toast } from '@/lib/toast';
import type { AutomationDefinitionSummary, AutomationsResponse } from '@/lib/automations/types';
import type { StudioTemplateSummary } from '@/components/studio/studio-types';

const INSTALLED_KEY = ['automations-installed'] as const;
const CATALOG_KEY = ['studio-catalog'] as const;
const CONNECTIONS_KEY = ['composio-connections'] as const;

interface ComposioConnection {
  app: string;
  label: string;
  connected: boolean;
}
interface ComposioConnectionsResponse {
  configured: boolean;
  apps: ComposioConnection[];
}

async function fetchInstalled(): Promise<AutomationDefinitionSummary[]> {
  const res = await fetch('/api/automations');
  const body = (await res.json().catch(() => ({}))) as AutomationsResponse;
  if (!res.ok || !body.ok) throw new Error(body.error ?? `automations ${res.status}`);
  return body.installed ?? [];
}

async function fetchTemplateFeed(path: string): Promise<StudioTemplateSummary[]> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    templates?: StudioTemplateSummary[];
    error?: string;
  };
  if (!res.ok || !body.ok || !body.templates) throw new Error(body.error ?? `catalog ${res.status}`);
  return body.templates;
}

/**
 * Discover = the SYSTEM library plus the curated community catalog.
 *
 * Two feeds because two predicates own the same table: `/api/studio/templates`
 * is `is_system = TRUE` (the blueprints that ship with the product) and
 * `/api/studio/catalog` is the curator-approved public submissions. Discover
 * asked only the second one, and every template on disk today is a system row —
 * so the marketplace's centre shelf read "No blueprints available yet" for
 * every tenant while two installable blueprints sat right there (measured
 * 2026-09-07, authenticated). Deduped by id, system rows first: those are the
 * ones an operator can trust on day one.
 */
async function fetchCatalog(): Promise<StudioTemplateSummary[]> {
  const [system, curated] = await Promise.all([
    fetchTemplateFeed('/api/studio/templates'),
    fetchTemplateFeed('/api/studio/catalog'),
  ]);
  const seen = new Set(system.map((t) => t.id));
  return [...system, ...curated.filter((t) => !seen.has(t.id))];
}

async function fetchConnections(): Promise<ComposioConnectionsResponse> {
  const res = await fetch('/api/integrations/composio/connections');
  if (!res.ok) throw new Error(`connections ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as Partial<ComposioConnectionsResponse>;
  return { configured: Boolean(body.configured), apps: body.apps ?? [] };
}

/** Compact "how long ago" for the last-run meta; falls back to a date, then —. */
function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Case-insensitive substring match across a row's searchable text. */
function matches(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-text-default">{title}</h2>
      {subtitle && <p className="text-sm text-text-soft">{subtitle}</p>}
    </div>
  );
}

function QueryError({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-text-soft">{children}</p>;
}

export function AutomationsMarketplace({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');

  const installedQuery = useQuery({ queryKey: INSTALLED_KEY, queryFn: fetchInstalled });
  const catalogQuery = useQuery({ queryKey: CATALOG_KEY, queryFn: fetchCatalog });
  const connectionsQuery = useQuery({ queryKey: CONNECTIONS_KEY, queryFn: fetchConnections });

  const install = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/studio/templates/${id}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `import ${res.status}`);
      return body;
    },
    onSuccess: () => {
      toast.success('Installed as a draft');
      queryClient.invalidateQueries({ queryKey: INSTALLED_KEY });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Install failed');
    },
  });

  const installed = useMemo(
    () => (installedQuery.data ?? []).filter((a) => matches(query, a.name)),
    [installedQuery.data, query],
  );
  const templates = useMemo(
    () =>
      (catalogQuery.data ?? []).filter((t) => matches(query, t.name, t.description, t.category)),
    [catalogQuery.data, query],
  );

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto bg-surface-canvas">
      <div className="mx-auto w-full max-w-5xl space-y-12 px-6 py-10">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text-default">Automations</h1>
            <p className="text-base text-text-soft">
              Assemble and observe your automated operation.
            </p>
          </div>
          <Panel padding="sm" radius="xl" elevation="sm" className="max-w-2xl">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Describe what you want to automate…"
              tone="blue"
              size="default"
              debounceMs={120}
              fillHost
              className="w-full"
              leadingIcon={<Sparkles className="h-5 w-5 text-blue-500" />}
            />
          </Panel>
        </section>

        {/* ─── Your automations ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader title="Your automations" />
          {installedQuery.isLoading ? (
            <div className="py-8">
              <Spinner />
            </div>
          ) : installedQuery.isError ? (
            <QueryError>Couldn’t load your automations. Try again shortly.</QueryError>
          ) : installed.length === 0 ? (
            <EmptyState
              icon={<Workflow className="h-7 w-7 text-text-soft" />}
              title="No automations yet"
              description={
                query.trim()
                  ? 'No installed automation matches your search.'
                  : 'Install one from Discover to see it here.'
              }
            />
          ) : (
            <div className="space-y-3">
              {installed.map((automation) => (
                <Panel
                  key={automation.id}
                  padding="md"
                  radius="lg"
                  elevation="sm"
                  className="flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text-default">
                        {automation.name}
                      </span>
                      <StatusChip active={automation.isActive} />
                    </div>
                    <p className="text-xs text-text-soft">
                      v{automation.version} · {automation.nodeCount} steps · {automation.inFlight} in
                      flight · last run {relativeTime(automation.lastRunAt)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/studio?v=${automation.id}`)}
                  >
                    Open in builder
                  </Button>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* ─── Discover ─────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader title="Discover" subtitle="Curated blueprints you can install as a draft." />
          {catalogQuery.isLoading ? (
            <div className="py-8">
              <Spinner />
            </div>
          ) : catalogQuery.isError ? (
            <QueryError>Couldn’t load blueprints. Try again shortly.</QueryError>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-7 w-7 text-text-soft" />}
              title={query.trim() ? 'No matching blueprints' : 'No blueprints available yet'}
              description={
                query.trim() ? 'Nothing matches your search yet.' : 'Check back soon for new blueprints.'
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Panel
                  key={template.id}
                  padding="md"
                  radius="lg"
                  elevation="sm"
                  className="flex h-full flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-default">
                      {template.name}
                    </h3>
                    {template.category && (
                      <span className="shrink-0 rounded-full border border-border-soft bg-surface-canvas px-2 py-0.5 text-[11px] font-medium text-text-soft">
                        {template.category}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 min-h-[2.5rem] text-xs text-text-soft">
                    {template.description ?? 'No description provided.'}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-text-soft">
                      <Layers className="h-3.5 w-3.5" />
                      {template.nodeCount} steps
                    </span>
                    {canManage ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={install.isPending && install.variables === template.id}
                        disabled={install.isPending}
                        onClick={() => install.mutate(template.id)}
                      >
                        Install
                      </Button>
                    ) : (
                      <Link
                        href="/settings/billing"
                        className="text-xs font-medium text-blue-600 hover:text-blue-500"
                      >
                        Upgrade to install
                      </Link>
                    )}
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* ─── Connections ──────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader title="Connections" subtitle="Connect apps from the assistant chat." />
          {connectionsQuery.isLoading ? (
            <div className="py-8">
              <Spinner />
            </div>
          ) : connectionsQuery.isError ? (
            <QueryError>Couldn’t load connections. Try again shortly.</QueryError>
          ) : !connectionsQuery.data?.configured ? (
            <EmptyState
              icon={<Link2 className="h-7 w-7 text-text-soft" />}
              title="No app connections"
              description="App connections aren’t configured for this workspace."
            />
          ) : connectionsQuery.data.apps.length === 0 ? (
            <EmptyState
              icon={<Link2 className="h-7 w-7 text-text-soft" />}
              title="No apps available"
              description="There are no connectable apps for this workspace yet."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connectionsQuery.data.apps.map((connection) => (
                <Panel
                  key={connection.app}
                  padding="md"
                  radius="lg"
                  elevation="sm"
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate text-sm font-medium text-text-default">
                    {connection.label}
                  </span>
                  <ConnectedChip connected={connection.connected} />
                </Panel>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface-canvas px-2 py-0.5 text-[11px] font-medium text-text-soft">
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-text-faint'}`}
        aria-hidden
      />
      {active ? 'Active' : 'Draft'}
    </span>
  );
}

function ConnectedChip({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-surface-canvas px-2 py-0.5 text-[11px] font-medium text-text-soft">
      <span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-text-faint'}`}
        aria-hidden
      />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  );
}
