'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from '@/components/Icons';
import { Layer } from '@/design-system/primitives/Layer';
import { Panel, Button, IconButton, TextField } from '@/design-system/primitives';
import { FormField } from '@/design-system/components';
import type { StationTheme } from '@/utils/staff-colors';
import { fbaSidebarThemeChrome } from '@/utils/staff-colors';
import { normalizeTrackingCanonical } from '@/lib/tracking-format';
import { FBA_OPEN_QUICK_ADD_FNSKU, FBA_FNSKU_SAVED } from '@/lib/fba/events';
import { FBA_CONDITIONS } from '@/lib/fba/fba-conditions';

/** @deprecated Use FBA_OPEN_QUICK_ADD_FNSKU from events.ts */
const FBA_OPEN_QUICK_ADD_FNSKU_EVENT = FBA_OPEN_QUICK_ADD_FNSKU;
/** @deprecated Use FBA_FNSKU_SAVED from events.ts */
export const FBA_FNSKU_SAVED_EVENT = FBA_FNSKU_SAVED;

interface OpenQuickAddFnskuDetail {
  fnsku?: string | null;
  product_title?: string | null;
  asin?: string | null;
  sku?: string | null;
  condition?: string | null;
}

interface SavedQuickAddFnskuDetail {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
}


export function emitOpenQuickAddFnsku(detail: OpenQuickAddFnskuDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(FBA_OPEN_QUICK_ADD_FNSKU_EVENT, {
      detail,
    }),
  );
}

function emitSavedQuickAddFnsku(detail: SavedQuickAddFnskuDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(FBA_FNSKU_SAVED_EVENT, {
      detail,
    }),
  );
}

export function FbaQuickAddFnskuModal({ stationTheme = 'blue' }: { stationTheme?: StationTheme }) {
  const chrome = fbaSidebarThemeChrome[stationTheme];
  const [open, setOpen] = useState(false);
  const [fnsku, setFnsku] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [asin, setAsin] = useState('');
  const [sku, setSku] = useState('');
  const [condition, setCondition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenQuickAddFnskuDetail>).detail || {};
      setFnsku(normalizeTrackingCanonical(String(detail.fnsku || '')));
      setProductTitle(String(detail.product_title || '').trim());
      setAsin(String(detail.asin || '').trim());
      setSku(String(detail.sku || '').trim());
      setCondition(String(detail.condition || '').trim());
      setError(null);
      setOpen(true);
    };
    window.addEventListener(FBA_OPEN_QUICK_ADD_FNSKU_EVENT, handleOpen as EventListener);
    return () => window.removeEventListener(FBA_OPEN_QUICK_ADD_FNSKU_EVENT, handleOpen as EventListener);
  }, []);

  const canSubmit = useMemo(() => Boolean(normalizeTrackingCanonical(fnsku)), [fnsku]);

  if (!open) return null;

  return (
    <Layer level="panelPopover" className="fixed inset-0 flex items-center justify-center p-4">
      {/* ds-raw-button: full-screen scrim/backdrop, not a content control */}
      <button
        type="button"
        className="absolute inset-0 bg-scrim/35"
        aria-label="Close quick add FNSKU popup"
        onClick={() => {
          if (saving) return;
          setOpen(false);
        }}
      />
      <Panel radius="none" padding="none" elevation="none" className="relative z-panelPopover w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div>
            <p className={`text-role-micro ${chrome.sectionLabel}`}>Quick add</p>
            <h2 className="mt-1 text-sm font-semibold text-text-default">Add Amazon SKU details</h2>
          </div>
          <IconButton
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            ariaLabel="Close quick add Amazon SKU popup"
            icon={<X className="h-4 w-4" />}
            size="md"
            radius="flush"
            className="border border-border-soft bg-surface-card text-text-soft hover:border-border-default hover:bg-surface-hover hover:text-text-default disabled:opacity-40"
          />
        </div>

        <div className="space-y-4 px-4 py-4">
          <TextField
            label="Product title (optional)"
            value={productTitle}
            onChange={setProductTitle}
          />

          <FormField label="Condition" optionalHint="optional">
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className={chrome.input}
            >
              <option value="">Select condition</option>
              {FBA_CONDITIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </FormField>

          <div className="space-y-2">
            <TextField
              label="FNSKU"
              value={fnsku}
              onChange={(next) => setFnsku(normalizeTrackingCanonical(next))}
              required
              mono
            />
            <p className="text-role-micro leading-snug text-text-soft">
              Save the FNSKU now and fill in more catalog details later if needed.
            </p>
          </div>

          <TextField
            label="ASIN (optional)"
            value={asin}
            onChange={(next) => setAsin(next.toUpperCase())}
            mono
          />

          <TextField
            label="SKU (optional)"
            value={sku}
            onChange={setSku}
            mono
          />

          {error ? <p className="text-xs font-semibold text-text-danger">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-soft px-4 py-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          {/* ds-raw-button: themed gradient solid CTA (blue→sky / emerald→teal) via chrome.primaryButton */}
          <button
            type="button"
            disabled={saving || !canSubmit}
            onClick={async () => {
              const normalizedFnsku = normalizeTrackingCanonical(fnsku);
              if (!normalizedFnsku) {
                setError('FNSKU is required.');
                return;
              }
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
                    condition: condition.trim() || null,
                  }),
                });
                const json = await response.json().catch(() => ({}));
                if (!response.ok || json?.success === false) {
                  setError(json?.error || 'Could not save this FNSKU.');
                  return;
                }
                const saved = json?.fnsku || {};
                emitSavedQuickAddFnsku({
                  fnsku: normalizeTrackingCanonical(String(saved.fnsku || normalizedFnsku)),
                  product_title: saved.product_title ?? (productTitle.trim() || null),
                  asin: saved.asin ?? null,
                  sku: saved.sku ?? null,
                  condition: saved.condition ?? (condition.trim() || null),
                });
                window.dispatchEvent(new Event('fba-plan-created'));
                setOpen(false);
              } catch {
                setError('Could not save this FNSKU.');
              } finally {
                setSaving(false);
              }
            }}
            className={chrome.primaryButton}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Save FNSKU
              </span>
            )}
          </button>
        </div>
      </Panel>
    </Layer>
  );
}
