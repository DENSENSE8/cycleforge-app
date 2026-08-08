'use client';

/**
 * Signals ▸ Browse — the Workbench half of the two domain-linked history pages
 * (universal-feed plan Phase 5). A master-detail over `entity_signals`: a
 * searchable list (master) + the selected signal's full detail (crossfading
 * right pane, keyed on `?signalId=`). Durable, URL-addressable selection — the
 * Workbench contract, distinct from the Monitor timeline at `?mode=timeline`.
 *
 * Workbench half of Operations ▸ Signals: searchable list (master) + selected
 * signal detail (crossfading right pane, keyed on `?signalId=`). Search lives
 * in the global header; filters/selection are URL-driven.
 *
 * Row preview: identity chrome paints from the clicked list row (or the list
 * row matching `?signalId=`) before the detail fetch returns. Preview is
 * ephemeral — never durable SoT; drops when the URL clears or fetch supersedes.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { operationsHistoryTraceHref } from '@/lib/operations/history-links';
import { SIGNAL_KINDS, SURFACE_ENTITY_TYPES } from '@/lib/surfaces/registry';
import type { EntitySignalTimelineRow } from '@/lib/timeline';
import type { EntitySignalDetail } from '@/lib/surfaces/entity-signals-read';
import { useSignalIdParam } from '@/hooks/useSignalIdParam';
import { cn } from '@/utils/_cn';

/** Identity fields available on the list row — enough to paint chrome before detail fetch. */
type SignalRowPreview = Pick<
  EntitySignalTimelineRow,
  'id' | 'signal_kind' | 'entity_type' | 'entity_id' | 'reason_code' | 'occurred_at'
>;

function kindLabel(kind: string): string {
  return (SIGNAL_KINDS as Record<string, { label: string } | undefined>)[kind]?.label ?? kind;
}
function entityLabel(type: string): string {
  return (SURFACE_ENTITY_TYPES as Record<string, { label: string } | undefined>)[type]?.label ?? type;
}
function shortTime(at: string | null): string {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toPreview(row: EntitySignalTimelineRow): SignalRowPreview {
  return {
    id: row.id,
    signal_kind: row.signal_kind,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    reason_code: row.reason_code,
    occurred_at: row.occurred_at,
  };
}

export function SignalsBrowseWorkspace() {
  const searchParams = useSearchParams();
  const { signalId, setSignalId } = useSignalIdParam();
  const q = searchParams.get('q') ?? '';

  // Ephemeral row preview — consumer-owned; SoT stays id-typed (`useSignalIdParam`).
  const [rowPreview, setRowPreview] = useState<SignalRowPreview | null>(null);

  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: paneMotion, transition: paneTransition } = useMotionRole(motionRole.swap.focus);

  const select = (id: number | null, row?: EntitySignalTimelineRow) => {
    if (id == null) {
      setRowPreview(null);
      setSignalId(null);
      return;
    }
    setRowPreview(row ? toPreview(row) : null);
    setSignalId(id);
  };

  const { data: rows, isLoading: listLoading } = useQuery<EntitySignalTimelineRow[]>({
    queryKey: ['entity-signals', 'browse', q],
    staleTime: 30_000,
    queryFn: async () => {
      const sp = new URLSearchParams({ limit: '200' });
      if (q.trim()) sp.set('q', q.trim());
      const res = await fetch(`/api/entity-signals?${sp.toString()}`, { cache: 'no-store' });
      if (!res.ok) return [];
      const body = (await res.json().catch(() => null)) as { signals?: EntitySignalTimelineRow[] } | null;
      return body?.signals ?? [];
    },
  });

  const { data: detail, isLoading: detailLoading } = useQuery<EntitySignalDetail | null>({
    queryKey: ['entity-signal', signalId],
    enabled: signalId != null,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/entity-signals/${signalId}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { signal?: EntitySignalDetail } | null;
      return body?.signal ?? null;
    },
  });

  const list = useMemo(() => rows ?? [], [rows]);

  // Deep-link / refresh: seed chrome from the list row once it lands.
  const listPreview = useMemo((): SignalRowPreview | null => {
    if (signalId == null) return null;
    const row = list.find((s) => s.id === signalId);
    return row ? toPreview(row) : null;
  }, [list, signalId]);

  const preview =
    rowPreview?.id === signalId ? rowPreview : listPreview?.id === signalId ? listPreview : null;

  // Drop stale click-preview when URL clears or selection moves.
  useEffect(() => {
    if (signalId == null) {
      setRowPreview(null);
      return;
    }
    if (rowPreview != null && rowPreview.id !== signalId) {
      setRowPreview(null);
    }
  }, [signalId, rowPreview]);

  // Fetch supersedes preview once durable detail matches the open id.
  useEffect(() => {
    if (detail != null && rowPreview != null && detail.id === rowPreview.id) {
      setRowPreview(null);
    }
  }, [detail, rowPreview]);

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Master list */}
      <div className={cn('flex w-full flex-col border-r border-border-hairline md:w-80 md:shrink-0', signalId != null && 'hidden md:flex')}>
        <div className="min-h-0 flex-1 divide-y divide-border-hairline overflow-y-auto">
          {listLoading ? (
            <p className="p-3 text-role-caption text-text-faint">Loading…</p>
          ) : list.length === 0 ? (
            <p className="p-3 text-role-caption text-text-faint">{q ? 'No signals match.' : 'No signals yet.'}</p>
          ) : (
            list.map((s) => (
              // ds-raw-button: master-list navigation row (sets ?signalId=), not a DS content button
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id, s)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors',
                  signalId === s.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
                )}
              >
                <span className="truncate text-role-caption font-semibold text-text-default">{kindLabel(s.signal_kind)}</span>
                <span className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                  {entityLabel(s.entity_type)} #{s.entity_id}
                  {shortTime(s.occurred_at) ? ` · ${shortTime(s.occurred_at)}` : ''}
                </span>
                {s.reason_code ? (
                  <span className="rounded bg-surface-canvas px-1.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
                    {s.reason_code}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail (crossfades on selection) */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', signalId == null && 'hidden md:block')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`signal-${signalId ?? 'none'}`}
            initial={paneMotion.initial}
            animate={paneMotion.animate}
            exit={paneMotion.exit}
            transition={paneTransition}
            className="h-full"
          >
            {signalId == null ? (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <p className="text-role-caption text-text-faint">Select a signal to see its detail.</p>
              </div>
            ) : (
              <div className="space-y-4 p-4">
                {/* ds-raw-button: mobile back-link — shown for EVERY signalId state
                    (loading / not-found / detail) so a bad ?signalId= is never a dead end.
                    router.replace is used, so browser Back won't restore the list. */}
                <button
                  type="button"
                  onClick={() => select(null)}
                  className="text-role-eyebrow uppercase tracking-widest text-blue-600 md:hidden"
                >
                  ← Back
                </button>
                {detail ? (
                  <SignalDetailBody detail={detail} />
                ) : preview ? (
                  <>
                    <SignalIdentityChrome
                      signalKind={preview.signal_kind}
                      entityType={preview.entity_type}
                      entityId={preview.entity_id}
                      reasonCode={preview.reason_code}
                      occurredAt={preview.occurred_at}
                    />
                    {detailLoading ? (
                      <p className="text-role-caption text-text-faint">Loading…</p>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-faint">
                        Signal not found.
                      </div>
                    )}
                  </>
                ) : detailLoading ? (
                  <p className="text-role-caption text-text-faint">Loading…</p>
                ) : (
                  <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption text-text-faint">
                    Signal not found.
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SignalIdentityChrome({
  signalKind,
  entityType,
  entityId,
  reasonCode,
  occurredAt,
}: {
  signalKind: string;
  entityType: string;
  entityId: number;
  reasonCode: string | null;
  occurredAt: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-lg font-semibold tracking-tight text-text-default">{kindLabel(signalKind)}</p>
      <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
        {entityLabel(entityType)} #{entityId}
        {shortTime(occurredAt) ? ` · ${shortTime(occurredAt)}` : ''}
      </p>
      {reasonCode ? (
        <span className="inline-block rounded bg-surface-canvas px-1.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
          {reasonCode}
        </span>
      ) : null}
    </div>
  );
}

function SignalDetailBody({ detail }: { detail: EntitySignalDetail }) {
  return (
    <>
      <SignalIdentityChrome
        signalKind={detail.signal_kind}
        entityType={detail.entity_type}
        entityId={detail.entity_id}
        reasonCode={null}
        occurredAt={null}
      />
      <Field label="Occurred">{fmt(detail.occurred_at)}</Field>
      {detail.reason_code ? <Field label="Reason code">{detail.reason_code}</Field> : null}
      {detail.severity != null ? <Field label="Severity">{String(detail.severity)}</Field> : null}
      {detail.notes ? <Field label="Notes">{detail.notes}</Field> : null}
      {detail.node_id ? <Field label="Node">{detail.node_id}</Field> : null}
      {detail.source_ref ? <Field label="Source ref">{detail.source_ref}</Field> : null}
      {detail.meta && Object.keys(detail.meta).length > 0 ? (
        <div className="space-y-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Meta</p>
          <pre className="overflow-x-auto rounded-md bg-surface-canvas p-2 text-role-micro text-text-muted ring-1 ring-inset ring-border-soft">
            {JSON.stringify(detail.meta, null, 2)}
          </pre>
        </div>
      ) : null}
      {detail.entity_dim && detail.entity_ref ? (
        <div className="border-t border-border-hairline pt-3">
          <Link
            href={operationsHistoryTraceHref({
              dim: detail.entity_dim,
              value: detail.entity_ref,
            })}
            className="inline-flex items-center gap-1 text-role-eyebrow uppercase tracking-widest text-blue-600 transition hover:text-blue-700"
          >
            Full event trace →
          </Link>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      <p className="text-role-caption text-text-default">{children}</p>
    </div>
  );
}

function fmt(at: string | null): string {
  if (!at) return '—';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
