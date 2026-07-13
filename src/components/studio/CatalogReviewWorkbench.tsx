'use client';

/**
 * CatalogReviewWorkbench — the curator review queue for org-submitted workflow
 * templates (Template Platform Phase 4). A platform curator (studio.catalog.review)
 * works submissions here and approves → public/approved (enters the curated
 * catalog) or rejects → private/rejected.
 *
 * Workbench archetype (list → select → detail → act): the submission queue is the
 * stable left picker; a row click is the durable selection; the right pane is the
 * selected submission's detail + the approve/reject actions and crossfades on
 * selection change (the list stays put). House style throughout: linear
 * space-y/divide-y scaffold, one-row anatomy, semantic-token color, selection =
 * bg-blue-50 ring-1 ring-inset ring-blue-400 (no size shift), icons from
 * @/components/Icons, right-pane motion via the canonical workbenchPane preset
 * routed through the reduced-motion bridge.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives/Button';
import { AlertCircle, Boxes, Check, CheckCircle, ClipboardList, Clock, Inbox, Loader2, X } from '@/components/Icons';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';

interface CatalogSubmission {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  nodeCount: number;
  edgeCount: number;
  submittedByOrg: string | null;
  submittedAt: string | null;
}

const QUEUE_KEY = ['catalog-submissions'] as const;

async function fetchSubmissions(): Promise<CatalogSubmission[]> {
  const res = await fetch('/api/studio/catalog/submissions');
  if (!res.ok) throw new Error(`submissions ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; submissions?: CatalogSubmission[] };
  if (!body.ok || !body.submissions) throw new Error('submissions: empty payload');
  return body.submissions;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  // Instant → warehouse-agnostic short label; a submission timestamp is display-only.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CatalogReviewWorkbench() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: submissions, isLoading, isError } = useQuery({
    queryKey: QUEUE_KEY,
    staleTime: 30_000,
    queryFn: fetchSubmissions,
  });

  const selected = useMemo(
    () => submissions?.find((s) => s.id === selectedId) ?? null,
    [submissions, selectedId],
  );

  const review = useMutation({
    mutationFn: async (vars: { id: number; decision: 'approve' | 'reject' }) => {
      const res = await fetch(`/api/studio/catalog/submissions/${vars.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: vars.decision }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? `review ${res.status}`);
      return body;
    },
    onSuccess: () => {
      // Reviewed rows leave the queue; refetch and clear the selection.
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['studio-catalog'] });
      setSelectedId(null);
    },
  });

  const panePresence = useMotionPresence(framerPresence.workbenchPane);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas">
      {/* Eyebrow header */}
      <header className="flex items-center gap-2 border-b border-border-hairline px-5 py-3">
        <ClipboardList className="h-4 w-4 text-text-accent" />
        <h1 className="text-role-caption font-bold text-text-default">Template catalog review</h1>
        <span className="ml-auto rounded-full bg-surface-sunken px-2 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-soft">
          {submissions?.length ?? 0} pending
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Master: submission queue (stable, never crossfades) ── */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-border-hairline">
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-role-caption text-text-soft">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
              </div>
            ) : isError ? (
              <div className="m-4 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
                <AlertCircle className="mx-auto h-4 w-4 text-rose-500" />
                <p className="mt-1 text-role-caption font-semibold text-rose-700">Could not load the review queue.</p>
                <p className="mt-0.5 text-role-eyebrow uppercase tracking-widest text-rose-400">Reload to try again.</p>
              </div>
            ) : !submissions || submissions.length === 0 ? (
              <div className="m-4 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-8 text-center">
                <Inbox className="mx-auto h-4 w-4 text-text-faint" />
                <p className="mt-1 text-role-caption font-semibold text-text-soft">No submissions to review.</p>
                <p className="mt-0.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
                  Org submissions land here for curation.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border-hairline">
                {submissions.map((s) => {
                  const isSel = s.id === selectedId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        aria-pressed={isSel}
                        className={[
                          'ds-raw-button flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors',
                          isSel ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
                        ].join(' ')}
                      >
                        <span className="truncate text-role-caption font-bold text-text-default">{s.name}</span>
                        <span className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                          {s.nodeCount} step{s.nodeCount === 1 ? '' : 's'}
                          {s.category ? ` · ${s.category}` : ''}
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
                key={`submission-${selected.id}`}
                initial={panePresence.initial}
                animate={panePresence.animate}
                exit={panePresence.exit}
                transition={paneTransition}
                className="mx-auto max-w-2xl space-y-5 px-6 py-6"
              >
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-text-accent">
                    <Clock className="h-3.5 w-3.5" /> Submitted {formatWhen(selected.submittedAt)}
                  </span>
                  <h2 className="text-lg font-bold text-text-default">{selected.name}</h2>
                  <p className="font-mono text-role-eyebrow uppercase tracking-widest text-text-faint">{selected.slug}</p>
                </div>

                {selected.description && (
                  <p className="text-role-caption leading-relaxed text-text-soft">{selected.description}</p>
                )}

                <dl className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">Shape</dt>
                    <dd className="flex items-center gap-1.5 text-role-caption font-semibold text-text-muted">
                      <Boxes className="h-3.5 w-3.5 text-text-soft" />
                      {selected.nodeCount} step{selected.nodeCount === 1 ? '' : 's'} · {selected.edgeCount} link
                      {selected.edgeCount === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">Category</dt>
                    <dd className="text-role-caption font-semibold text-text-muted">{selected.category ?? '—'}</dd>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-faint">Submitted by org</dt>
                    <dd className="truncate font-mono text-role-eyebrow text-text-soft">{selected.submittedByOrg ?? '—'}</dd>
                  </div>
                </dl>

                {review.isError && (
                  <p className="text-role-caption font-semibold text-rose-600">
                    Couldn&apos;t record that review: {(review.error as Error)?.message ?? 'unknown error'}
                  </p>
                )}

                <div className="flex items-center gap-3 border-t border-border-hairline pt-4">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    icon={<CheckCircle />}
                    loading={review.isPending && review.variables?.decision === 'approve'}
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: selected.id, decision: 'approve' })}
                  >
                    Approve for catalog
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    icon={<X />}
                    loading={review.isPending && review.variables?.decision === 'reject'}
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: selected.id, decision: 'reject' })}
                  >
                    Reject
                  </Button>
                </div>
                <p className="flex items-center gap-1.5 text-role-micro text-text-faint">
                  <Check className="h-3 w-3" /> Approving makes this template public + clonable by every tenant.
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
                  <ClipboardList className="mx-auto h-5 w-5 text-text-faint" />
                  <p className="mt-2 text-role-caption font-semibold text-text-soft">
                    Select a submission to review it.
                  </p>
                  <p className="mt-0.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
                    Approve to publish it to the curated catalog, or reject to keep it private.
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
