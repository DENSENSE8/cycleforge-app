'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, Loader2, Check, Link2, Plus, AlertCircle } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMeta } from '@/lib/source-platform';
import type { UnmappedPlatformId } from './types';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

interface CatalogSearchRow {
  id: number;
  sku: string;
  product_title: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The current sidebar search term. Seeds the new inventory SKU field in the
   *  add-to-catalog flow (no pending id), and the "pair to existing" search. */
  query: string;
  /** When set, the modal links this account-source identifier after create, or
   *  lets the operator pair it to an existing canonical SKU. */
  pending: UnmappedPlatformId | null;
  /** Called with the canonical SKU after a successful add/pair so the caller can
   *  open it (`?sku=`). */
  onDone: (sku: string) => void;
}

type Mode = 'create' | 'existing';

const MODE_TAB_IDS = ['create', 'existing'] as const;

const MODE_OPTIONS = [
  {
    value: 'create',
    label: 'Create new SKU',
    meta: 'Add a new inventory SKU',
    group: 'Pairing mode',
  },
  {
    value: 'existing',
    label: 'Pair to existing',
    meta: 'Match an existing catalog SKU',
    group: 'Pairing mode',
  },
] as const;

/** Closes the two gaps the canonical pairing queue can't: */
export function AddOrPairSkuModal({ open, onClose, query, pending, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('create');
  // ⌥1 / ⌥2 jump modes directly — same chord the ticket claim's Create|Link
  // picker binds (ClaimModeSelect), so the shortcut means the same thing
  // everywhere it appears. Stands down in the search box itself.
  const onModeChord = useCallback((id: string) => setMode(id as Mode), []);
  useSegmentChords({ enabled: !!pending, tabIds: MODE_TAB_IDS, onTabChange: onModeChord });

  // Create-form fields.
  const identifier = pending?.platformItemId || pending?.platformSku || '';
  const [sku, setSku] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [upc, setUpc] = useState('');

  // Pair-to-existing search.
  const [existingQuery, setExistingQuery] = useState('');
  const [results, setResults] = useState<CatalogSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogSearchRow | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal (re)opens or the target changes.
  useEffect(() => {
    if (!open) return;
    setMode('create');
    // Add-to-catalog flow (no pending id):
    setSku(pending ? '' : query.trim());
    setTitle(pending?.suggestedTitle || '');
    setCategory('');
    setUpc('');
    setExistingQuery(pending?.suggestedTitle?.split(/\s+/).slice(0, 2).join(' ') || query.trim());
    setResults([]);
    setSelected(null);
    setError(null);
  }, [open, pending, query]);

  // Debounced catalog search for the "pair to existing" mode.
  useEffect(() => {
    if (!open || mode !== 'existing') return;
    const term = existingQuery.trim();
    if (!term) { setResults([]); return; }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/sku-catalog/search?q=${encodeURIComponent(term)}&searchField=zoho_catalog&limit=20`,
          { credentials: 'same-origin' },
        );
        const body = await res.json();
        if (!cancelled && body.success) setResults(body.items || []);
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [open, mode, existingQuery]);

  const pendingPlatform = pending?.platform || '';

  const linkPending = async (skuCatalogId: number) => {
    if (!pending) return;
    const res = await fetch('/api/sku-catalog/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        skuCatalogId,
        itemNumber: identifier,
        platform: pendingPlatform,
        accountName: pending.accountName,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body.error || 'Pairing failed');
  };

  const handleCreate = async () => {
    const trimmedSku = sku.trim();
    const trimmedTitle = title.trim();
    if (!trimmedSku) { setError('Inventory SKU is required.'); return; }
    if (!trimmedTitle) { setError('Product title is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/sku-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          sku: trimmedSku,
          productTitle: trimmedTitle,
          category: category.trim() || undefined,
          upc: upc.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Failed to create SKU');
      if (pending) await linkPending(body.catalog.id);
      window.dispatchEvent(new CustomEvent('sku-pairing-updated'));
      onDone(body.catalog.sku);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePairExisting = async () => {
    if (!selected) { setError('Pick a SKU to pair to.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await linkPending(selected.id);
      window.dispatchEvent(new CustomEvent('sku-pairing-updated'));
      onDone(selected.sku);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pair');
    } finally {
      setSubmitting(false);
    }
  };

  const headerLabel = pending ? 'Pair identifier' : 'Add inventory SKU';
  const pendingMeta = useMemo(
    () => (pending ? sourcePlatformMeta(pending.platform) : null),
    [pending],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="max-h-[84vh] max-w-lg gap-0 overflow-hidden p-0 sm:rounded-xl"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border-soft px-4 py-3">
          <DialogTitle className="text-role-micro uppercase tracking-[0.16em] text-text-soft">
            {headerLabel}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {pending
              ? 'Create a new inventory SKU or pair this identifier to an existing one.'
              : 'Add a new inventory SKU to the catalog.'}
          </DialogDescription>
        </DialogHeader>

        {/* Pending identifier banner */}
        {pending && pendingMeta && (
          <div className="shrink-0 border-b border-border-hairline bg-surface-canvas px-4 py-2.5">
            <div className="flex items-center gap-2">
              <HoverTooltip label={pendingMeta.label} asChild focusable={false}>
                <span className="inline-flex shrink-0" aria-label={pendingMeta.label}>
                  <PlatformMark platformValue={pending.platform} meta={pendingMeta} />
                </span>
              </HoverTooltip>
              <span className="font-mono text-xs font-semibold text-text-default">{identifier}</span>
              {pending.orderCount > 0 && (
                <span className="text-role-micro font-semibold text-amber-700">
                  links {pending.orderCount} order{pending.orderCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {pending.suggestedTitle && (
              <p className="mt-1 truncate text-role-caption text-text-soft">{pending.suggestedTitle}</p>
            )}
          </div>
        )}

        {/* Create | Link mode (only meaningful when pairing an identifier) — same flush combobox grammar as the ticket claim's Create|Link picker… */}
        {pending && (
          <div className="shrink-0 pt-2" data-testid="pair-mode-select">
            <SearchableSelectField
              appearance="flush"
              value={mode}
              onChange={(id) => {
                if (id == null) return;
                setMode(id as Mode);
              }}
              options={MODE_OPTIONS}
              placeholder="Create or Pair…"
              searchPlaceholder="Type to filter…"
              emptyMessage="No modes match"
              ariaLabel="SKU pairing mode"
            />
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {mode === 'create' ? (
            <div className="space-y-3">
              <Field label="Inventory SKU" required>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. 00326-P-2"
                  className={cn("w-full rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 font-mono text-sm font-semibold text-text-default", focusRing("field", "accent"))}
                />
              </Field>
              <Field label="Product title" required>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Canonical product name"
                  className={cn("w-full rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 text-sm font-semibold text-text-default", focusRing("field", "accent"))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Optional"
                    className={cn("w-full rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 text-sm text-text-default", focusRing("field", "accent"))}
                  />
                </Field>
                <Field label="UPC">
                  <input
                    value={upc}
                    onChange={(e) => setUpc(e.target.value)}
                    placeholder="Optional"
                    className={cn("w-full rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 font-mono text-sm text-text-default", focusRing("field", "accent"))}
                  />
                </Field>
              </div>
              {pending && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-role-micro font-semibold text-emerald-700">
                  Creating this SKU will also link <span className="font-mono">{identifier}</span> and backfill its {pending.orderCount} order{pending.orderCount === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
                <input
                  value={existingQuery}
                  onChange={(e) => { setExistingQuery(e.target.value); setSelected(null); }}
                  placeholder="Search canonical SKU or title…"
                  className={cn("w-full rounded-lg border border-border-soft bg-surface-canvas py-2 pl-8 pr-3 text-sm font-semibold text-text-default", focusRing("field", "accent"))}
                />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-text-faint" />}
              </div>
              <div className="divide-y divide-border-hairline overflow-hidden rounded-lg border border-border-hairline">
                {results.length === 0 ? (
                  <p className="px-3 py-6 text-center text-role-caption text-text-faint">
                    {existingQuery.trim() ? 'No matches' : 'Type to search the catalog'}
                  </p>
                ) : (
                  results.map((r) => {
                    const isSel = selected?.id === r.id;
                    return (
                      // ds-raw-button: text-left master-detail picker row (SKU + title), not a standard action button
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(isSel ? null : r)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${isSel ? 'bg-emerald-50' : 'hover:bg-surface-hover'}`}
                      >
                        {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                        <span className="font-mono text-xs font-semibold text-text-default">{r.sku}</span>
                        <span className="truncate text-role-caption text-text-soft">{r.product_title}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex shrink-0 items-center gap-1.5 border-t border-red-100 bg-red-50 px-4 py-2 text-role-micro font-semibold text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-border-soft px-4 py-3 sm:justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="md"
            loading={submitting}
            disabled={submitting || (mode === 'existing' && !selected)}
            onClick={mode === 'create' ? handleCreate : handlePairExisting}
            icon={mode === 'create' ? <Plus className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          >
            {mode === 'create' ? (pending ? 'Create & pair' : 'Add SKU') : 'Pair SKU'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-role-micro uppercase tracking-wider text-text-soft">
        {label}{required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}
