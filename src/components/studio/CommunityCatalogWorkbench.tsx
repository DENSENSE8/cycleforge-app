'use client';

/** CommunityCatalogWorkbench — the BROWSE/CLONE half of the unified /studio/catalog surface (Template Platform Phase 4). */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives/Button';
import { AlertCircle, Boxes, Copy, Globe, Layers, Loader2, RefreshCw } from '@/components/Icons';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { toast } from '@/lib/toast';
import type { StudioTemplateSummary } from '@/components/studio/studio-types';
import { Panel } from '@/design-system/primitives';


const CATALOG_KEY = ['studio-catalog'] as const;

async function fetchCatalog(): Promise<StudioTemplateSummary[]> {
  const res = await fetch('/api/studio/catalog');
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; templates?: StudioTemplateSummary[] };
  if (!body.ok || !body.templates) throw new Error('catalog: empty payload');
  return body.templates;
}

export function CommunityCatalogWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlSelectedId = useMemo(() => {
    const raw = Number(searchParams.get('selectedId'));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  const replaceSelected = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const writeSelected = useCallback((params: URLSearchParams, next: number | null) => {
    if (next != null && next > 0) params.set('selectedId', String(next));
    else params.delete('selectedId');
  }, []);

  const { value: selectedId, setValue: setSelectedId } = useOptimisticUrlParam<number | null>({
    urlValue: urlSelectedId,
    replace: replaceSelected,
    write: writeSelected,
  });

  const {
    data: templates,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: CATALOG_KEY,
    staleTime: 30_000,
    queryFn: fetchCatalog,
  });

  const selectTemplate = useCallback(
    (id: number) => setSelectedId(id),
    [setSelectedId],
  );

  const selected = useMemo(
    () => templates?.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const clone = useMutation({
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
      toast.success('Cloned as a draft in your Studio');
      router.push('/studio');
    },
  });

  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: panePresence, transition: paneTransition } = useMotionRole(motionRole.swap.focus);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas">
      {/* Eyebrow header */}
      <header className="flex items-center gap-2 border-b border-border-hairline px-5 py-3">
        <Globe className="h-4 w-4 text-text-accent" />
        <h1 className="text-role-caption font-semibold text-text-default">Community catalog</h1>
        <span className="ml-auto rounded-full bg-surface-sunken px-2 py-0.5 text-role-eyebrow text-text-soft">
          {templates?.length ?? 0} template{templates?.length === 1 ? '' : 's'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Master: template list (stable, never crossfades) ── */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-border-hairline">
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-role-caption text-text-soft">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
              </div>
            ) : isError ? (
              <div className="m-4 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
                <AlertCircle className="mx-auto h-4 w-4 text-rose-500" />
                <p className="mt-1 text-role-caption font-semibold text-rose-700">Could not load the catalog.</p>
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<RefreshCw />}
                    loading={isRefetching}
                    onClick={() => void refetch()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : !templates || templates.length === 0 ? (
              <Panel radius="xl" padding="none" className="m-4 border-dashed px-4 py-8 text-center">
                <Layers className="mx-auto h-4 w-4 text-text-faint" />
                <p className="mt-1 text-role-caption font-semibold text-text-soft">
                  No community templates published yet.
                </p>
                <p className="mt-0.5 text-role-eyebrow text-text-faint">
                  Curator-approved blueprints appear here to clone.
                </p>
              </Panel>
            ) : (
              <ul className="divide-y divide-border-hairline">
                {templates.map((t) => {
                  const isSel = t.id === selectedId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => selectTemplate(t.id)}
                        aria-pressed={isSel}
                        className={[
                          'ds-raw-button flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors',
                          isSel ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
                        ].join(' ')}
                      >
                        <span className="truncate text-role-caption font-semibold text-text-default">{t.name}</span>
                        <span className="truncate text-role-eyebrow font-semibold text-text-faint">
                          {t.category ?? 'Uncategorized'} · {t.nodeCount} step{t.nodeCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Detail: crossfades on selection change (the list stays put) ── */}
        <section className="min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div
                key={`template-${selected.id}`}
                initial={panePresence.initial}
                animate={panePresence.animate}
                exit={panePresence.exit}
                transition={paneTransition}
                className="mx-auto max-w-2xl space-y-5 px-6 py-6"
              >
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-role-eyebrow text-text-accent">
                    <Globe className="h-3.5 w-3.5" /> {selected.category ?? 'Uncategorized'}
                  </span>
                  <h2 className="text-lg font-semibold text-text-default">{selected.name}</h2>
                  <p className="font-mono text-role-eyebrow text-text-faint">{selected.slug}</p>
                </div>

                {selected.description && (
                  <p className="text-role-caption leading-relaxed text-text-soft">{selected.description}</p>
                )}

                <dl className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <dt className="text-role-eyebrow text-text-faint">Shape</dt>
                    <dd className="flex items-center gap-1.5 text-role-caption font-semibold text-text-muted">
                      <Boxes className="h-3.5 w-3.5 text-text-soft" />
                      {selected.nodeCount} step{selected.nodeCount === 1 ? '' : 's'} · {selected.edgeCount} link
                      {selected.edgeCount === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-role-eyebrow text-text-faint">Category</dt>
                    <dd className="text-role-caption font-semibold text-text-muted">{selected.category ?? '—'}</dd>
                  </div>
                </dl>

                {clone.isError && (
                  <p className="text-role-caption font-semibold text-rose-600">
                    Couldn&apos;t clone that template: {(clone.error as Error)?.message ?? 'unknown error'}
                  </p>
                )}

                <div className="flex items-center gap-3 border-t border-border-hairline pt-4">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    icon={<Copy />}
                    loading={clone.isPending}
                    disabled={clone.isPending}
                    onClick={() => clone.mutate(selected.id)}
                  >
                    Clone into my workspace
                  </Button>
                </div>
                <p className="flex items-center gap-1.5 text-role-micro text-text-faint">
                  <Copy className="h-3 w-3" /> Cloning lands a private draft in your Studio — publish it when you&apos;re
                  ready.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={panePresence.initial}
                animate={panePresence.animate}
                exit={panePresence.exit}
                transition={paneTransition}
                className="flex h-full items-center justify-center px-6"
              >
                <div className="max-w-sm text-center">
                  <Layers className="mx-auto h-5 w-5 text-text-faint" />
                  <p className="mt-2 text-role-caption font-semibold text-text-soft">
                    Select a template to preview it.
                  </p>
                  <p className="mt-0.5 text-role-eyebrow text-text-faint">
                    Clone a community blueprint into your Studio as an editable draft.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
