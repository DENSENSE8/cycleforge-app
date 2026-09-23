'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, RefreshCw } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { FBA_STATUS_LABEL } from '@/lib/fba/status';

type Line = { id: number; fnsku: string; display_title?: string | null; expected_qty: number; actual_qty?: number; status: string };
type Plan = { id: number; shipment_ref: string; items: Line[] } | null;

/** Phone projection of the existing ready and verify writes; it has no scan input or camera door. */
export function MobileFbaVerifyTask() {
  const [plan, setPlan] = useState<Plan>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/fba/shipments/today', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'Could not load today’s FBA plan.');
      setPlan(data?.shipment ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load today’s FBA plan.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const advance = async (line: Line) => {
    const endpoint = line.status === 'PLANNED' ? '/api/fba/items/ready' : '/api/fba/items/verify';
    setBusy(line.fnsku); setError(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipment_id: plan?.id, fnsku: line.fnsku, station: 'MOBILE_FBA' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'Could not advance this FBA unit.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not advance this FBA unit.'); }
    finally { setBusy(null); }
  };

  const actionable = plan?.items.filter((line) => line.status === 'PLANNED' || line.status === 'TESTED') ?? [];
  return <main className="flex h-full min-h-0 flex-col bg-surface-card" aria-label="FBA ready and verification">
    <header className="border-b border-border-hairline px-3 pb-3 pt-2"><p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-soft">Amazon prep</p><h1 className="mt-1 text-lg font-semibold tracking-tight text-text-default">Ready and verify</h1><p className="mt-0.5 text-role-caption text-text-muted">Advance only the plan line in front of you. Camera capture stays in the shell.</p></header>
    <div className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">{loading ? 'Loading FBA verification work…' : plan ? `${plan.shipment_ref} · ${actionable.length} actionable ${actionable.length === 1 ? 'line' : 'lines'}` : 'No FBA plan started today'}</div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {error ? <div className="border-b border-border-hairline px-3 py-4"><p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger"><AlertTriangle className="h-4 w-4" /> {error}</p><Button className="mt-3" variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void load()}>Retry</Button></div> : null}
      {!loading && actionable.length === 0 ? <EmptyState icon={<Check className="h-6 w-6 text-text-soft" />} title="No FBA verification work" description="Planned and tested FBA lines appear here when they need the next physical confirmation." /> : <ul className="divide-y divide-border-hairline">{actionable.map((line) => { const isReady = line.status === 'PLANNED'; return <li key={line.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"><div className="min-w-0"><p className="truncate font-mono text-role-caption font-semibold text-text-default">{line.fnsku}</p><p className="truncate text-role-micro text-text-soft">{line.display_title || 'No catalog title'}</p><p className="mt-1 text-role-eyebrow uppercase tracking-widest text-text-muted">{FBA_STATUS_LABEL[line.status] ?? line.status} · QTY {line.actual_qty ?? 0}/{line.expected_qty}</p></div><Button type="button" variant="primary" radius="flush" size="sm" onClick={() => void advance(line)} disabled={busy === line.fnsku}>{isReady ? 'Mark ready' : 'Verify pack'}</Button></li>; })}</ul>}
    </div>
  </main>;
}
