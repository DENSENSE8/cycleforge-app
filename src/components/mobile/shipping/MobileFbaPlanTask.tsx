'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus, RefreshCw, ScanBarcode } from '@/components/Icons';
import { Button, EmptyState, Inset, TextField } from '@/design-system/primitives';
import { normalizeTrackingCanonical } from '@/lib/tracking-format';
import { FBA_STATUS_LABEL } from '@/lib/fba/status';

type FbaPlanLine = {
  id: number;
  fnsku: string;
  expected_qty: number;
  status: string;
  display_title?: string | null;
};

type FbaTodayPlan = {
  id: number;
  shipment_ref: string;
  status: string;
  items: FbaPlanLine[];
} | null;

/**
 * Phone-first FBA planning task. It owns the same `today/items` write as the
 * desk plan controller: a wedge can enter an FNSKU in this focused field, but
 * it deliberately creates no camera/scan door (the mobile shell owns that).
 */
export function MobileFbaPlanTask() {
  const [plan, setPlan] = useState<FbaTodayPlan>(null);
  const [fnsku, setFnsku] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/fba/shipments/today', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'Could not load today\'s FBA plan.');
      setPlan(data?.shipment ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load today\'s FBA plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  const addToPlan = async () => {
    const normalized = normalizeTrackingCanonical(fnsku);
    if (!normalized) {
      setError('Enter a valid FNSKU.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/fba/shipments/today/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ fnsku: normalized, expected_qty: 1 }] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'Could not add this FNSKU to today\'s plan.');
      setFnsku('');
      setNotice(`${normalized} added to ${data?.shipment_ref || 'today\'s plan'}.`);
      await loadPlan();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this FNSKU to today\'s plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" aria-label="FBA plan shipment">
      <header className="border-b border-border-hairline px-3 pb-3 pt-2">
        <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-soft">Amazon prep</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-text-default">Today&apos;s FBA plan</h1>
        <p className="mt-0.5 text-role-caption text-text-muted">Add one FNSKU at a time. A hardware wedge can enter this field; the shell&apos;s scan control remains the only camera door.</p>
      </header>

      <Inset space="chip" className="border-b border-border-hairline">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] border border-border-soft bg-border-soft">
          <TextField
            label="FNSKU"
            value={fnsku}
            onChange={(value) => setFnsku(value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void addToPlan();
              }
            }}
            appearance="flush"
            mono
            autoComplete="off"
            disabled={saving}
          />
          <Button
            type="button"
            variant="primary"
            radius="flush"
            size="md"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => void addToPlan()}
            disabled={saving}
          >
            Add
          </Button>
        </div>
        {notice ? <p className="mt-2 text-role-caption font-semibold text-text-success">{notice}</p> : null}
        <Link href="/m/shipping/fba/scan" className="mt-2 flex min-h-11 items-center border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
          Record a physical FBA unit
        </Link>
        <Link href="/m/shipping/fba/verify" className="mt-2 flex min-h-11 items-center border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">
          Ready and verify FBA lines
        </Link>
        <Link href="/m/shipping/fba/label" className="mt-2 flex min-h-11 items-center border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">Bind packed lines to a shipping label</Link>
        <Link href="/m/shipping/fba/close" className="mt-2 flex min-h-11 items-center border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-default active:bg-surface-sunken">Close and send FBA shipment</Link>
      </Inset>

      <div className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">
        {loading ? 'Loading today\'s plan…' : plan ? `${plan.shipment_ref} · ${plan.items.length} planned ${plan.items.length === 1 ? 'line' : 'lines'}` : 'No FBA plan started today'}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-start gap-3 border-b border-border-hairline px-3 py-5">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger"><AlertTriangle className="h-4 w-4" /> {error}</p>
            <Button variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void loadPlan()}>Retry</Button>
          </div>
        ) : !loading && !plan ? (
          <EmptyState icon={<ScanBarcode className="h-6 w-6 text-text-soft" />} title="No FBA plan started" description="Add an FNSKU to create today’s plan from the governed shipment endpoint." />
        ) : (
          <ul className="divide-y divide-border-hairline">
            {plan?.items.map((line) => (
              <li key={line.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-role-caption font-semibold text-text-default">{line.fnsku}</p>
                  <p className="truncate text-role-micro text-text-soft">{line.display_title || 'No catalog title'}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-role-caption font-semibold text-text-default">QTY {line.expected_qty}</p>
                  <p className="text-role-eyebrow uppercase tracking-widest text-text-muted">{FBA_STATUS_LABEL[line.status] ?? line.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
