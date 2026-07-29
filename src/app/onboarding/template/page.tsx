'use client';

/**
 * /onboarding/template — the first-run ops-SOP chooser (Template Platform
 * Phase 1). A brand-new org has NO active workflow until the owner picks a
 * template here; signup no longer auto-seeds one.
 *
 * Workbench archetype (list → select → confirm): the system template library is
 * the list, a card click is the durable selection, and the primary CTA confirms
 * → POST /api/onboarding/template (installTemplateIntoOrg, activate: 'if_system')
 * → redirect home. Pre-selects the blessed default (is_default) template.
 *
 * House style: linear space-y/divide-y scaffold, semantic-token color, selection
 * = bg-blue-50 ring-1 ring-inset ring-blue-400 (no size shift), icons from
 * @/components/Icons, contextual copy inline (no title=).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives/Button';
import { AlertCircle, Boxes, Check, Loader2, Sparkles } from '@/components/Icons';
import type { StudioTemplateSummary } from '@/components/studio/studio-types';

/** Where the owner lands after their ops SOP is installed. */
const AFTER_CONFIRM_HREF = '/dashboard';

async function fetchTemplates(): Promise<StudioTemplateSummary[]> {
  const res = await fetch('/api/studio/templates');
  if (!res.ok) throw new Error(`templates ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; templates?: StudioTemplateSummary[] };
  if (!body.ok || !body.templates) throw new Error('templates: empty payload');
  return body.templates;
}

/** One ranked recommendation from POST /api/onboarding/recommend (advisory). */
interface TemplateRec {
  slug: string;
  score: number;
  reason: string;
}

export default function OnboardingTemplatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // AI-intake recommender (Template Platform Phase 5) — READ-ONLY / advisory.
  // It only RANKS existing slugs; it never installs or activates. Its result
  // decorates cards and pre-selects the top pick, nothing more.
  const [intakeText, setIntakeText] = useState('');
  const [recBySlug, setRecBySlug] = useState<Map<string, TemplateRec>>(new Map());

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['studio-templates'],
    staleTime: 5 * 60 * 1000,
    queryFn: fetchTemplates,
  });

  // Pre-select the blessed default once the list loads (owner can change it).
  useEffect(() => {
    if (!templates || selectedId !== null) return;
    const def = templates.find((t) => t.isDefault) ?? templates[0];
    if (def) setSelectedId(def.id);
  }, [templates, selectedId]);

  // Rank existing templates against the intake text. NEVER installs — it only
  // populates recBySlug (badges) and sets the selection to the top match.
  const recommend = useMutation({
    mutationFn: async (text: string): Promise<TemplateRec[]> => {
      const res = await fetch('/api/onboarding/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, category: null }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        recommendations?: TemplateRec[];
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `recommend ${res.status}`);
      return body.recommendations ?? [];
    },
    onSuccess: (recommendations) => {
      const map = new Map<string, TemplateRec>();
      for (const r of recommendations) map.set(r.slug, r);
      setRecBySlug(map);
      // Pre-select the top rec by slug → id. This ONLY sets selection state —
      // it never installs or activates. Falls back to the current selection.
      const top = recommendations[0];
      setSelectedId((current) => templates?.find((t) => t.slug === top?.slug)?.id ?? current);
    },
  });

  const confirm = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await fetch('/api/onboarding/template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `install ${res.status}`);
      return body;
    },
    onSuccess: () => {
      // The checklist's `workflow` step reads onboarding-stats — refresh it so
      // the step flips to done as the owner moves on.
      void queryClient.invalidateQueries({ queryKey: ['onboarding-stats'] });
      router.push(AFTER_CONFIRM_HREF);
    },
  });

  return (
    <div className="flex-1 overflow-y-auto bg-surface-canvas">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 py-10">
        {/* Header */}
        <header className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Get started
          </span>
          <h1 className="text-xl font-semibold text-text-default">Choose how you run ops</h1>
          <p className="text-role-caption text-text-soft">
            Start from a proven workflow template for your kind of shop. You can edit it any
            time in the Studio — this just gives your operation a live starting point.
          </p>
        </header>

        {/* AI intake — advisory recommender. Ranks existing templates only;
            never installs or activates (the CTA below is the sole install path). */}
        <section className="mt-5 space-y-2.5 rounded-xl border border-border-hairline bg-surface-card p-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Not sure which one?
            </span>
            <p className="text-role-eyebrow leading-snug text-text-soft">
              AI suggestion — you choose what to activate.
            </p>
          </div>
          <textarea
            value={intakeText}
            onChange={(e) => setIntakeText(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Describe how your shop runs — what you sell, and your steps from intake to shipping…"
            className="w-full resize-none rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 text-role-caption text-text-default placeholder:text-text-faint focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400"
          />
          <div className="flex items-center justify-between gap-3">
            {recommend.isError ? (
              <p className="text-role-eyebrow font-semibold text-rose-600">
                Couldn&apos;t get suggestions. Try again.
              </p>
            ) : recommend.isSuccess && recBySlug.size === 0 ? (
              <p className="text-role-eyebrow text-text-soft">No strong match — browse the list below.</p>
            ) : (
              <span aria-hidden />
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Sparkles />}
              disabled={intakeText.trim().length === 0 || recommend.isPending}
              loading={recommend.isPending}
              onClick={() => recommend.mutate(intakeText.trim())}
            >
              {recommend.isPending ? 'Thinking…' : 'Get recommendations'}
            </Button>
          </div>
        </section>

        {/* List → select */}
        <section className="mt-6 flex-1">
          {isLoading ? (
            <div className="flex items-center gap-2 px-1 py-8 text-role-caption text-text-soft">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
              <AlertCircle className="mx-auto h-4 w-4 text-rose-500" />
              <p className="mt-1 text-role-caption font-semibold text-rose-700">
                Could not load the template library.
              </p>
              <p className="mt-0.5 text-role-eyebrow uppercase tracking-widest text-rose-400">
                Reload the page to try again.
              </p>
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-6 text-center">
              <Boxes className="mx-auto h-4 w-4 text-text-faint" />
              <p className="mt-1 text-role-caption font-semibold text-text-soft">
                No workflow templates are available yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-hairline overflow-hidden rounded-xl border border-border-hairline bg-surface-card">
              {templates.map((t) => {
                const selected = t.id === selectedId;
                const rec = recBySlug.get(t.slug);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      aria-pressed={selected}
                      className={[
                        'ds-raw-button flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                        selected
                          ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                          : 'hover:bg-surface-hover',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden
                        className={[
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                          selected ? 'bg-blue-500 ring-blue-500' : 'ring-border-soft',
                        ].join(' ')}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-role-caption font-semibold text-text-default">
                            {t.name}
                          </span>
                          {rec ? (
                            // AI reason takes precedence over the default badge.
                            <span className="inline-flex min-w-0 items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 ring-1 ring-inset ring-violet-200">
                              <span className="text-role-eyebrow uppercase tracking-widest text-violet-700">
                                Recommended
                              </span>
                              {rec.reason && (
                                <span className="truncate text-role-eyebrow font-semibold normal-case tracking-normal text-violet-600">
                                  · {rec.reason}
                                </span>
                              )}
                            </span>
                          ) : (
                            t.isDefault && (
                              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-violet-700 ring-1 ring-inset ring-violet-200">
                                Recommended
                              </span>
                            )
                          )}
                        </span>
                        {t.description && (
                          <span className="mt-0.5 block text-role-eyebrow leading-snug text-text-soft">
                            {t.description}
                          </span>
                        )}
                        <span className="mt-1 block font-mono text-role-eyebrow uppercase tracking-widest text-text-faint">
                          {t.nodeCount} step{t.nodeCount === 1 ? '' : 's'} · {t.edgeCount} link
                          {t.edgeCount === 1 ? '' : 's'}
                          {t.category ? ` · ${t.category}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {confirm.isError && (
            <p className="mt-3 text-role-caption font-semibold text-rose-600">
              Couldn&apos;t install that template: {(confirm.error as Error)?.message ?? 'unknown error'}
            </p>
          )}
        </section>

        {/* Confirm */}
        <footer className="mt-6 flex items-center justify-end gap-3 border-t border-border-hairline pt-4">
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={selectedId === null || confirm.isPending}
            loading={confirm.isPending}
            icon={<Check />}
            onClick={() => selectedId !== null && confirm.mutate(selectedId)}
          >
            {confirm.isPending ? 'Setting up…' : 'Use this template'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
