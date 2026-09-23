'use client';

import { useState } from 'react';
import { AlertTriangle, Check, PackageCheck } from '@/components/Icons';
import { Button, Inset, TextField } from '@/design-system/primitives';
import { normalizeTrackingCanonical } from '@/lib/tracking-format';
import { FBA_STATUS_LABEL } from '@/lib/fba/status';

type ScanResult = {
  fnsku: string;
  product_title?: string | null;
  shipment_ref?: string | null;
  actual_qty: number;
  expected_qty: number;
  status: string;
};

/**
 * Physical FBA unit confirmation for a focused wedge field. Camera capture
 * remains exclusively at the mobile shell's permanent `/m/scan` control.
 */
export function MobileFbaUnitScanTask() {
  const [fnsku, setFnsku] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const submit = async () => {
    const normalized = normalizeTrackingCanonical(fnsku);
    if (!normalized) {
      setError('Enter a valid FNSKU.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/fba/items/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fnsku: normalized, station: 'MOBILE_FBA' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'Could not record this FBA unit.');
      setResult(data as ScanResult);
      setFnsku('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this FBA unit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col bg-surface-card" aria-label="FBA unit confirmation">
      <header className="border-b border-border-hairline px-3 pb-3 pt-2">
        <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-soft">Amazon prep</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-text-default">Record FBA unit</h1>
        <p className="mt-0.5 text-role-caption text-text-muted">Confirm one physical unit against its FNSKU. Use the permanent shell control for camera capture.</p>
      </header>

      <Inset space="chip" className="border-b border-border-hairline">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] border border-border-soft bg-border-soft">
          <TextField label="FNSKU" value={fnsku} onChange={(value) => setFnsku(value.toUpperCase())} onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void submit(); }
          }} appearance="flush" mono autoComplete="off" disabled={saving} />
          <Button type="button" variant="primary" radius="flush" size="md" icon={<PackageCheck className="h-4 w-4" />} onClick={() => void submit()} disabled={saving}>Record</Button>
        </div>
      </Inset>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <div className="border-b border-border-hairline px-3 py-4"><p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger"><AlertTriangle className="h-4 w-4" /> {error}</p></div> : null}
        {result ? (
          <section className="border-b border-border-success bg-surface-success px-3 py-4" aria-live="polite">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-success"><Check className="h-4 w-4" /> Unit recorded</p>
            <p className="mt-3 font-mono text-role-caption font-semibold text-text-default">{result.fnsku}</p>
            <p className="mt-0.5 text-role-caption text-text-default">{result.product_title || 'No catalog title'}</p>
            <div className="mt-3 grid grid-cols-2 divide-x divide-border-success border-y border-border-success text-role-caption">
              <p className="py-2 pr-2 text-text-muted">Plan <span className="font-mono font-semibold text-text-default">{result.shipment_ref || 'Today'}</span></p>
              <p className="py-2 pl-2 text-right text-text-muted">Qty <span className="font-mono font-semibold text-text-default">{result.actual_qty}/{result.expected_qty}</span></p>
            </div>
            <p className="mt-3 text-role-eyebrow font-semibold uppercase tracking-widest text-text-success">{FBA_STATUS_LABEL[result.status] ?? result.status}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
