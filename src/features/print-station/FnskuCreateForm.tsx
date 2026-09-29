'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from '@/components/Icons';
import { FormField } from '@/design-system/components';
import { Button, Panel, TextField } from '@/design-system/primitives';
import { normalizeTrackingCanonical } from '@/lib/tracking-format';
import { FnskuConditionPicker } from './FnskuConditionPicker';

export interface CreatedFnsku {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
}

export function FnskuCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (row: CreatedFnsku) => void }) {
  const [fnsku, setFnsku] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [asin, setAsin] = useState('');
  const [sku, setSku] = useState('');
  const [condition, setCondition] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedFnsku = useMemo(() => normalizeTrackingCanonical(fnsku), [fnsku]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedFnsku || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/fba/fnskus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fnsku: normalizedFnsku,
          product_title: productTitle.trim() || null,
          asin: asin.trim() || null,
          sku: sku.trim() || null,
          condition,
        }),
      });
      const json = (await response.json().catch(() => null)) as { success?: boolean; error?: string; fnsku?: CreatedFnsku } | null;
      if (!response.ok || json?.success === false || !json?.fnsku) {
        setError(json?.error ?? 'Could not save this FNSKU.');
        return;
      }
      onCreated(json.fnsku);
    } catch {
      setError('Could not save this FNSKU.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-4" data-testid="fnsku-create-form">
      <Panel radius="lg" padding="none" elevation="none" className="overflow-hidden border border-border-hairline bg-surface-card">
        <form onSubmit={(event) => void submit(event)}>
          <div className="border-b border-border-hairline px-4 py-3">
            <p className="mode-label text-mode-muted">New catalog label</p>
            <h2 className="text-role-title text-mode-ink">Add FNSKU</h2>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                label="FNSKU"
                value={fnsku}
                onChange={(next) => setFnsku(normalizeTrackingCanonical(next))}
                required
                mono
                autoFocus
              />
            </div>
            <div className="sm:col-span-2">
              <TextField label="Label" value={productTitle} onChange={setProductTitle} />
            </div>
            <TextField label="ASIN (optional)" value={asin} onChange={(next) => setAsin(next.toUpperCase())} mono />
            <TextField label="SKU (optional)" value={sku} onChange={setSku} mono />
            <div className="sm:col-span-2">
              <FormField label="Condition" optionalHint="optional">
                <FnskuConditionPicker value={condition} onChange={setCondition} disabled={saving} testId="fnsku-create-condition" />
              </FormField>
            </div>
            {error ? (
              <p role="alert" className="text-role-caption text-text-danger sm:col-span-2">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-hairline px-4 py-3">
            <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!normalizedFnsku} icon={<Plus aria-hidden />} data-testid="fnsku-create-save">
              Add FNSKU
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
