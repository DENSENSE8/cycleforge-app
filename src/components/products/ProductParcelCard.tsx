'use client';

/** Product-level parcel profile used by shipping-label rate and purchase flows. */

import { useEffect, useMemo, useState } from 'react';
import { Collapse } from '@/design-system/components/Collapse';
import { Button, TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { useAuth } from '@/contexts/AuthContext';
import type { ProductParcelProfile } from '@/components/products/types';
import { cn } from '@/utils/_cn';

type ParcelDraft = {
  weightOz: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
};

const textOf = (value: number | null) => (value == null ? '' : String(value));

function draftOf(parcel: ProductParcelProfile): ParcelDraft {
  return {
    weightOz: textOf(parcel.weightOz),
    lengthIn: textOf(parcel.lengthIn),
    widthIn: textOf(parcel.widthIn),
    heightIn: textOf(parcel.heightIn),
  };
}

function valueOf(raw: string): number | null | 'invalid' {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 'invalid';
}

export function ProductParcelCard({
  sku,
  parcel,
  itemNumbers,
  onSaved,
  className,
  embedded = false,
}: {
  sku: string;
  parcel: ProductParcelProfile;
  itemNumbers: readonly string[];
  onSaved: (next: ProductParcelProfile) => void;
  className?: string;
  /** TriageSections already owns the card surface when embedded. */
  embedded?: boolean;
}) {
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const [draft, setDraft] = useState<ParcelDraft>(() => draftOf(parcel));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(draftOf(parcel));
  }, [parcel]);

  const stored = useMemo(() => draftOf(parcel), [parcel]);
  const dirty = (Object.keys(draft) as Array<keyof ParcelDraft>).some(
    (key) => draft[key] !== stored[key],
  );

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
    const dimensionCount = [values.lengthIn, values.widthIn, values.heightIn].filter(
      (value) => typeof value === 'number',
    ).length;
    if (dimensionCount !== 0 && dimensionCount !== 3) {
      setError('Length, width, and height must be saved together.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcel: values }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || 'Could not save package profile.');
      onSaved({
        weightOz: values.weightOz as number | null,
        lengthIn: values.lengthIn as number | null,
        widthIn: values.widthIn as number | null,
        heightIn: values.heightIn as number | null,
        source: values.weightOz != null || dimensionCount === 3 ? 'sku' : null,
        sourceKey: values.weightOz != null || dimensionCount === 3 ? sku.trim().toUpperCase() : null,
      });
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save package profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={cn(
        !embedded && 'border border-border-soft bg-surface-card p-4',
        !embedded && cornerClass('surface'),
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {!embedded ? <h2 className="text-role-caption font-semibold text-text-default">Shipping package</h2> : null}
          <p className="text-role-body font-semibold text-text-default">
            {parcel.weightOz != null ? `${parcel.weightOz} oz` : 'Weight not measured'}
            {parcel.lengthIn != null && parcel.widthIn != null && parcel.heightIn != null
              ? ` · ${parcel.lengthIn} × ${parcel.widthIn} × ${parcel.heightIn} in`
              : ''}
          </p>
          <p className="text-role-micro text-text-soft">
            {parcel.source === 'item_number' ? 'Remembered by item #' : parcel.source === 'sku' ? 'Remembered by SKU' : 'Not measured'}
          </p>
        </div>
        {canManage ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
            {editing ? 'Close' : 'Edit package'}
          </Button>
        ) : null}
      </div>

      <Collapse open={editing} className="mt-4 border-t border-border-hairline pt-4">
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Weight (oz)" value={draft.weightOz} onChange={set('weightOz')} inputMode="decimal" disabled={!canManage || saving} />
          <TextField label="Length (in)" value={draft.lengthIn} onChange={set('lengthIn')} inputMode="decimal" disabled={!canManage || saving} />
          <TextField label="Width (in)" value={draft.widthIn} onChange={set('widthIn')} inputMode="decimal" disabled={!canManage || saving} />
          <TextField label="Height (in)" value={draft.heightIn} onChange={set('heightIn')} inputMode="decimal" disabled={!canManage || saving} />
        </div>
        <p className="mt-3 text-role-micro text-text-soft">
          Shipping labels use this package when an order has no parcel of its own. Saving updates the SKU
          {itemNumbers.length > 0 ? ` and ${itemNumbers.length} linked item number${itemNumbers.length === 1 ? '' : 's'}` : ''}.
        </p>
        {error ? <p role="alert" className="mt-2 text-role-caption text-text-danger">{error}</p> : null}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={!dirty || saving} loading={saving} onClick={save}>Save package</Button>
          {dirty ? (
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setDraft(stored); setError(null); }}>
              Reset
            </Button>
          ) : null}
        </div>
      </Collapse>

      {itemNumbers.length > 0 ? (
        <p className="mt-1 truncate font-mono text-role-micro text-text-faint" title={itemNumbers.join(', ')}>
          Item # {itemNumbers.join(' · ')}
        </p>
      ) : null}

      {!canManage ? (
        <p className="mt-3 text-role-micro text-text-faint">Read-only — editing needs catalog manage permission.</p>
      ) : null}
    </section>
  );
}
