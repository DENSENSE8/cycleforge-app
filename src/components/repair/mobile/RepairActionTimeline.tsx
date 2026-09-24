'use client';

import { useCallback, useEffect, useState } from 'react';
import { repairActionTypeToneClass } from '@/lib/repair-action-type-tone';
import { repairActionLabel, type RepairActionRecord } from '@/lib/repair/repair-actions';
import { formatMonthDayTimePST } from '@/utils/date';
import { Check, Clock, RefreshCw, Tool, Wrench, X } from '@/components/Icons';

interface Props {
  repairId: number;
  /** Bump this to force a refetch (e.g. after Add sheet saves). */
  refreshKey: number;
  /** Newest-first actions after every load — the page reads saved stamps from here. */
  onLoaded?: (actions: RepairActionRecord[]) => void;
  /** Action id to mark as just saved (the page passes the id the POST returned). */
  highlightId?: number | null;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  replaced: RefreshCw,
  repaired: Wrench,
  cleaned: Tool,
  tested: Check,
  no_fix: X,
  awaiting_part: Clock,
};

export function RepairActionTimeline({ repairId, refreshKey, onLoaded, highlightId = null }: Props) {
  const [actions, setActions] = useState<RepairActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/repair/actions?repairId=${repairId}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      const next: RepairActionRecord[] = Array.isArray(body?.actions) ? body.actions : [];
      setActions(next);
      onLoaded?.(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }, [repairId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section>
      <div className="px-1 mb-2 flex items-baseline justify-between">
        <p className="text-role-micro uppercase tracking-[0.16em] text-text-soft">
          What was repaired
        </p>
        <span className="text-role-micro text-text-faint">
          {actions.length} action{actions.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {loading && actions.length === 0 && (
        <p className="text-center text-sm font-semibold text-text-soft py-6">Loading…</p>
      )}

      {!loading && actions.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-border-default bg-surface-card p-6 text-center">
          <p className="text-sm font-semibold text-text-muted">No actions logged yet.</p>
          <p className="mt-1 text-role-caption text-text-soft">
            Use Log work in the dock to record the first one.
          </p>
        </div>
      )}

      {actions.length > 0 && (
        <ul className="space-y-2">
          {actions.map((a) => {
            const tone = repairActionTypeToneClass(a.action_type);
            const ActionIcon = TYPE_ICON[a.action_type] ?? Tool;
            const hasReplacement =
              a.action_type === 'replaced' && (a.old_sku || a.new_sku || a.old_serial || a.new_serial);
            return (
              <li
                key={a.id}
                className={`rounded-mode border ${tone} p-mode-page shadow-none ${a.id === highlightId ? 'ring-2 ring-emerald-400' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <ActionIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-text-default">
                        {repairActionLabel(a.action_type)}
                        {a.part_name ? (
                          <span className="ml-1.5 font-semibold text-text-muted">— {a.part_name}</span>
                        ) : null}
                      </p>
                      {/* Server-stamped on insert — never a typed or client-clock date. */}
                      <time dateTime={a.created_at} className="text-role-micro text-text-soft shrink-0">
                        {formatMonthDayTimePST(a.created_at)}
                      </time>
                    </div>

                    {hasReplacement && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-role-caption font-mono">
                        {a.old_sku && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 line-through">
                            {a.old_sku}
                          </span>
                        )}
                        {(a.old_sku || a.old_serial) && (a.new_sku || a.new_serial) && (
                          <span className="text-text-faint">→</span>
                        )}
                        {a.new_sku && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                            {a.new_sku}
                          </span>
                        )}
                      </div>
                    )}

                    {(a.old_serial || a.new_serial) && (
                      <div className="mt-1 flex items-center gap-1.5 text-role-micro font-mono text-text-muted">
                        {a.old_serial && <span>SN: {a.old_serial}</span>}
                        {a.old_serial && a.new_serial && <span className="text-text-faint">→</span>}
                        {a.new_serial && <span>SN: {a.new_serial}</span>}
                      </div>
                    )}

                    {a.notes && (
                      <p className="mt-1.5 text-role-caption text-text-muted leading-snug whitespace-pre-wrap">
                        {a.notes}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-2 text-role-micro text-text-soft">
                      {a.staff_name && <span>{a.staff_name}</span>}
                      {a.duration_min != null && (
                        <>
                          {a.staff_name && <span className="text-text-faint">·</span>}
                          <span>{a.duration_min} min</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
