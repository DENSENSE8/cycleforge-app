'use client';

import { useEffect, useState } from 'react';
import { Plus, Link2, Loader2 } from '@/components/Icons';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformLabel, sourcePlatformMeta } from '@/lib/source-platform';
import type { SearchUnmatchedResponse, UnmappedPlatformId } from './types';

interface Props {
  /** Debounced sidebar search term. */
  query: string;
  /** Open the add/pair modal for a specific unmapped identifier. */
  onPairIdentifier: (id: UnmappedPlatformId) => void;
  /** Open the add modal to create a brand-new inventory SKU from the query. */
  onAddSku: () => void;
}

/** Sits beneath the canonical pairing queue. */
export function PairingUnmatchedSection({ query, onPairIdentifier, onAddSku }: Props) {
  const [data, setData] = useState<SearchUnmatchedResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/sku-catalog/search-unmatched?q=${encodeURIComponent(term)}`,
          { credentials: 'same-origin' },
        );
        const body = (await res.json()) as SearchUnmatchedResponse;
        if (!cancelled && body.success) setData(body);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [query]);

  // Refresh after a pair/create commit clears one of these gaps.
  useEffect(() => {
    const handler = () => setData(null);
    window.addEventListener('sku-pairing-updated', handler);
    return () => window.removeEventListener('sku-pairing-updated', handler);
  }, []);

  const term = query.trim();
  if (!term) return null;

  const unmapped = data?.unmappedPlatformIds ?? [];
  const catalogExists = data?.catalogSku.exists ?? false;
  const offerAdd = !!data && !catalogExists;

  // Nothing to show yet (still loading first pass) → keep it quiet.
  if (!data && !loading) return null;
  if (data && unmapped.length === 0 && !offerAdd) return null;

  return (
    <div className="shrink-0 border-b border-border-soft bg-surface-canvas/60">
      <div className={`flex items-center justify-between ${SIDEBAR_GUTTER} py-1.5`}>
        <span className="text-role-micro text-text-soft">
          Not in the queue
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-text-faint" />}
      </div>

      {/* Unmapped account-source identifiers */}
      {unmapped.length > 0 && (
        <ul className="max-h-52 divide-y divide-border-hairline overflow-y-auto border-t border-border-hairline bg-surface-card">
          {unmapped.map((id) => {
            const meta = sourcePlatformMeta(id.platform);
            // Ecwid's item id is an internal numeric product id — show its SKU
            // instead. Other platforms key on the marketplace item id (ASIN, etc.).
            const value =
              id.platform === 'ecwid'
                ? id.platformSku || id.platformItemId || ''
                : id.platformItemId || id.platformSku || '';
            return (
              <li key={id.platformIdRowId}>
                <button
                  type="button"
                  onClick={() => onPairIdentifier(id)}
                  className={`ds-raw-button flex w-full items-center gap-2 ${SIDEBAR_GUTTER} py-2 text-left transition-colors hover:bg-blue-50`}
                >
                  <HoverTooltip label={sourcePlatformLabel(id.platform)} asChild focusable={false}>
                    <span className="inline-flex shrink-0" aria-label={meta.label}>
                      <PlatformMark platformValue={id.platform} meta={meta} />
                    </span>
                  </HoverTooltip>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-semibold text-text-default">{value}</span>
                      {id.orderCount > 0 && (
                        <span className="shrink-0 text-role-eyebrow text-amber-700">
                          {id.orderCount} ord
                        </span>
                      )}
                    </div>
                    <p className="truncate text-role-micro text-text-soft">
                      {id.suggestedTitle || 'No linked title — unmapped'}
                    </p>
                  </div>
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add the searched inventory SKU to the catalog */}
      {offerAdd && (
        <div className={`border-t border-border-hairline ${SIDEBAR_GUTTER} py-2`}>
          <button
            type="button"
            onClick={onAddSku}
            className="ds-raw-button flex w-full items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-2.5 py-2 text-left transition-colors hover:bg-blue-50"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
              <Plus className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-role-caption font-semibold text-blue-700">Add inventory SKU to catalog</span>
              <span className="block truncate font-mono text-role-micro text-blue-500">{term}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
