'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import type { ProductParcelProfile } from '@/lib/products/product-detail';

type ParcelDraft = { weightOz: string; lengthIn: string; widthIn: string; heightIn: string };
const textOf = (value: number | null) => (value == null ? '' : String(value));
const draftOf = (parcel: ProductParcelProfile): ParcelDraft => ({
  weightOz: textOf(parcel.weightOz),
  lengthIn: textOf(parcel.lengthIn),
  widthIn: textOf(parcel.widthIn),
  heightIn: textOf(parcel.heightIn),
});
const valueOf = (raw: string): number | null | 'invalid' => {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 'invalid';
};

export function MobileProductParcelCard({
  sku,
  parcel,
  itemNumbers,
  onSaved,
}: {
  sku: string;
  parcel: ProductParcelProfile;
  itemNumbers: readonly string[];
  onSaved: (next: ProductParcelProfile) => void;
}) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const [draft, setDraft] = useState<ParcelDraft>(() => draftOf(parcel));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(draftOf(parcel)), [parcel]);
  const stored = useMemo(() => draftOf(parcel), [parcel]);
  const dirty = (Object.keys(draft) as Array<keyof ParcelDraft>).some((key) => draft[key] !== stored[key]);
  const set = (key: keyof ParcelDraft) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const save = async () => {
    const values = {
      weightOz: valueOf(draft.weightOz),
      lengthIn: valueOf(draft.lengthIn),
      widthIn: valueOf(draft.widthIn),
      heightIn: valueOf(draft.heightIn),
    };
    if (Object.values(values).includes('invalid')) {
      setError('Use positive numbers, or leave a field empty.');
      return;
    }
    const dimensionCount = [values.lengthIn, values.widthIn, values.heightIn].filter((value) => typeof value === 'number').length;
    if (dimensionCount !== 0 && dimensionCount !== 3) {
      setError('Length, width, and height must be saved together.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcel: values }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || 'Could not save package profile.');
      const hasValue = values.weightOz != null || dimensionCount === 3;
      onSaved({
        weightOz: values.weightOz as number | null,
        lengthIn: values.lengthIn as number | null,
        widthIn: values.widthIn as number | null,
        heightIn: values.heightIn as number | null,
        source: hasValue ? 'sku' : null,
        sourceKey: hasValue ? sku.trim().toUpperCase() : null,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save package profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-mode-panel px-mode-page py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-role-caption font-semibold text-mode-ink">Shipping package</h2>
        <span className="text-role-micro text-mode-muted">{parcel.source ? `Saved by ${parcel.source === 'sku' ? 'SKU' : 'item #'}` : 'Not measured'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Weight (oz)" value={draft.weightOz} onChange={set('weightOz')} inputMode="decimal" disabled={!canManage || saving} />
        <TextField label="Length (in)" value={draft.lengthIn} onChange={set('lengthIn')} inputMode="decimal" disabled={!canManage || saving} />
        <TextField label="Width (in)" value={draft.widthIn} onChange={set('widthIn')} inputMode="decimal" disabled={!canManage || saving} />
        <TextField label="Height (in)" value={draft.heightIn} onChange={set('heightIn')} inputMode="decimal" disabled={!canManage || saving} />
      </div>
      <p className="mt-3 text-role-micro text-mode-muted">
        Labels use this package when the order has no parcel of its own. Saving keeps the SKU and linked item numbers synchronized.
      </p>
      {itemNumbers.length ? <p className="mt-1 truncate font-mono text-role-micro text-mode-muted">Item # {itemNumbers.join(' · ')}</p> : null}
      {error ? <p role="alert" className="mt-2 text-role-caption text-text-danger">{error}</p> : null}
      {canManage ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" radius="flush" size="lg" disabled={!dirty || saving} loading={saving} onClick={save}>Save package</Button>
          <Button variant="secondary" radius="flush" size="lg" disabled={!dirty || saving} onClick={() => { setDraft(stored); setError(null); }}>Reset</Button>
        </div>
      ) : (
        <p className="mt-3 text-role-micro text-mode-muted">Read-only — catalog manage permission is required.</p>
      )}
    </section>
  );
}
