'use client';

/**
 * Print station › **Add FNSKU** (owner 2026-10-04): a popover anchored right
 * under the page header's Add FNSKU button (top right) — never inline in the
 * list. FNSKU and Condition are required (the label prints the condition);
 * Label, ASIN and SKU are optional. Saving opens the new FNSKU.
 */

import { useMemo, useState, type FormEvent, type RefObject } from 'react';
import { Plus } from '@/components/Icons';
import { FormField } from '@/design-system/components';
import { Button, Panel, TextField } from '@/design-system/primitives';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { normalizeTrackingCanonical } from '@/lib/tracking-format';
import { FnskuConditionPicker } from './FnskuConditionPicker';

export interface CreatedFnsku {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
}

export function FnskuCreatePopover({
  anchorRef,
  onClose,
  onCreated,
}: {
  /** The header's Add FNSKU button: the popover hangs right under it, right-aligned. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onCreated: (row: CreatedFnsku) => void;
}) {
  const [fnsku, setFnsku] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [asin, setAsin] = useState('');
  const [sku, setSku] = useState('');
  const [condition, setCondition] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedFnsku = useMemo(() => normalizeTrackingCanonical(fnsku), [fnsku]);
  const ready = Boolean(normalizedFnsku && condition);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || saving) return;
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
    // The condition picker's menu portals outside the panel (Radix): a press there must not close the popover.
    <AnchoredLayer open onClose={onClose} anchorRef={anchorRef} placement="bottom-end" level="panelPopover" gap={6} ignoreClickSelector="[data-radix-popper-content-wrapper]">
      <Panel
        padding="none"
        radius="xl"
        elevation="overlay"
        aria-label="Add FNSKU"
        data-testid="fnsku-create-form"
        className="flex max-h-[var(--anchored-available-height,none)] w-[28rem] flex-col overflow-y-auto"
      >
        <form onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="FNSKU" value={fnsku} onChange={(next) => setFnsku(normalizeTrackingCanonical(next))} required mono autoFocus />
            </div>
            <div className="sm:col-span-2">
              <FormField label="Condition" required>
                <div className="flex">
                  <FnskuConditionPicker value={condition} onChange={setCondition} disabled={saving} testId="fnsku-create-condition" />
                </div>
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <TextField label="Label" value={productTitle} onChange={setProductTitle} />
            </div>
            <TextField label="ASIN (optional)" value={asin} onChange={(next) => setAsin(next.toUpperCase())} mono />
            <TextField label="SKU (optional)" value={sku} onChange={setSku} mono />
            {error ? (
              <p role="alert" className="text-role-caption text-text-danger sm:col-span-2">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-hairline px-4 py-3">
            {normalizedFnsku && !condition ? <p className="mr-auto text-role-caption text-text-warning">Choose a condition</p> : null}
            <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!ready} icon={<Plus aria-hidden />} data-testid="fnsku-create-save">
              Add FNSKU
            </Button>
          </div>
        </form>
      </Panel>
    </AnchoredLayer>
  );
}
